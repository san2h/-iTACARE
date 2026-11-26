-- =====================================================================
-- +iTACARE: passos de segurança 1, 2 e 3
-- Rodar no SQL Editor do Supabase, uma SEÇÃO por vez (selecione o trecho
-- da seção e clique em Run). Cada seção é independente.
-- =====================================================================


-- =====================================================================
-- PASSO 1: trancar funções de pagamento/carteira/indicação
-- (o app não chama nenhuma delas; só a service role continua podendo)
-- Rollback: grant execute on function <assinatura> to public, anon, authenticated;
-- =====================================================================
revoke all on function public.confirm_payment(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.cancel_payment(uuid) from public, anon, authenticated;
revoke all on function public.buy_subscription_with_itacoins(text,text) from public, anon, authenticated;
revoke all on function public.apply_premium_referral_reward(uuid) from public, anon, authenticated;
revoke all on function public.init_payment_intent(text,text,text,numeric,numeric,numeric,numeric,numeric) from public, anon, authenticated;
revoke all on function public.init_payment_intent(jsonb) from public, anon, authenticated;
revoke all on function public.init_payment_intent(numeric,uuid) from public, anon, authenticated;
revoke all on function public.init_payment_intent(numeric,uuid,uuid,numeric) from public, anon, authenticated;


-- =====================================================================
-- PASSO 2: vagas do beta (200) e cadastro seguro
-- Rollback: drop trigger if exists trg_beta_on_confirm on auth.users;
--           e recriar handle_new_user com a definição anterior.
-- =====================================================================

-- Tabelas privadas (sem policies: só funções e service role)
create table if not exists public.beta_config (
  id int primary key default 1 check (id = 1),
  vagas_total int not null default 200,
  vagas_usadas int not null default 0
);
insert into public.beta_config (id) values (1) on conflict do nothing;
alter table public.beta_config enable row level security;
revoke all on public.beta_config from anon, authenticated;

create table if not exists public.beta_participantes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.beta_participantes enable row level security;
revoke all on public.beta_participantes from anon, authenticated;

-- Reserva atômica de vaga + promoção a premium
create or replace function public.conceder_vaga_beta(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.beta_participantes (user_id) values (p_user_id) on conflict do nothing;
  if not found then return true; end if;          -- já tinha vaga

  update public.beta_config set vagas_usadas = vagas_usadas + 1
   where id = 1 and vagas_usadas < vagas_total;
  if not found then                                -- vagas esgotadas
    delete from public.beta_participantes where user_id = p_user_id;
    return false;
  end if;

  update public.profiles set user_type = 'premium_user'
   where id = p_user_id and coalesce(user_type, 'free') in ('free', 'visitante');
  return true;
end $$;
revoke all on function public.conceder_vaga_beta(uuid) from public, anon, authenticated;

-- Contador público (só o número)
create or replace function public.vagas_beta_restantes()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(vagas_total - vagas_usadas, 0) from public.beta_config where id = 1
$$;
grant execute on function public.vagas_beta_restantes() to anon, authenticated;

-- Cadastro: ignora o user_type enviado no metadado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url, user_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'free'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = timezone('utc'::text, now());

  if new.email_confirmed_at is not null then      -- ex.: login com Google
    perform public.conceder_vaga_beta(new.id);
  end if;
  return new;
end $$;

-- Confirmação de e-mail depois do cadastro
create or replace function public.on_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.conceder_vaga_beta(new.id);
  end if;
  return new;
end $$;
revoke all on function public.on_email_confirmed() from public, anon, authenticated;

drop trigger if exists trg_beta_on_confirm on auth.users;
create trigger trg_beta_on_confirm
  after update of email_confirmed_at on auth.users
  for each row execute function public.on_email_confirmed();


-- =====================================================================
-- PASSO 3: exigir quem pode chamar cada função
-- Rollback: grant execute on function <assinatura> to anon;
--           (definições antigas estão no resultado colado anteriormente)
-- =====================================================================

-- Helper: o usuário logado é admin?
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.user_type = 'admin' or p.role = 'admin')
  )
$$;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- Solicitações de comércio: só admin
create or replace function public.approve_merchant_claim(claim_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_merchant_id uuid; v_user_id uuid;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
  select merchant_id, user_id into v_merchant_id, v_user_id
    from public.merchant_claims where id = claim_id and status = 'pending';
  if v_merchant_id is null then raise exception 'Solicitação não encontrada.'; end if;

  update public.merchant_claims set status = 'approved' where id = claim_id;
  update public.merchants set owner_id = v_user_id where id = v_merchant_id;
  update auth.users
     set raw_user_meta_data = raw_user_meta_data || '{"user_type": "comerciante_premium"}'::jsonb
   where id = v_user_id;
end $$;

create or replace function public.reject_merchant_claim(claim_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
  update public.merchant_claims set status = 'rejected'
   where id = claim_id and status = 'pending';
end $$;

-- Ingressos: só admin ou dono do comércio do evento
create or replace function public.validate_event_ticket(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text; v_event_title text; v_price numeric; v_owner uuid;
begin
  select t.status, e.title, t.price, m.owner_id
    into v_status, v_event_title, v_price, v_owner
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.merchants m on m.id = e.merchant_id
  where t.id = p_ticket_id;

  if v_status is null then
    return jsonb_build_object('success', false, 'message', 'Ingresso inválido ou não encontrado em Itacaré!');
  end if;

  if not (public.eh_admin() or (v_owner is not null and v_owner = auth.uid())) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para validar ingressos deste evento.');
  end if;

  if v_status = 'used' then
    return jsonb_build_object('success', false, 'message', '⚠️ Alerta! Este ingresso JÁ FOI UTILIZADO na portaria!');
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('success', false, 'message', 'Acesso negado. Este ingresso foi cancelado.');
  end if;

  update public.tickets
     set status = 'used', scanned_at = timezone('utc'::text, now())
   where id = p_ticket_id;

  return jsonb_build_object('success', true, 'message', 'Acesso AUTORIZADO! Bom evento!',
                            'event_title', v_event_title, 'price', v_price);
end $$;

-- Networking por QR: o "scanner" precisa ser quem está logado
create or replace function public.accept_qr_networking(p_scanner_id uuid, p_owner_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if auth.uid() is null or auth.uid() <> p_scanner_id then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_scanner_id = p_owner_id then
    return json_build_object('success', false, 'message', 'Você não pode se conectar consigo mesmo.');
  end if;
  if not exists (select 1 from public.profiles where id = p_owner_id) then
    return json_build_object('success', false, 'message', 'Usuário não encontrado.');
  end if;

  select exists(
    select 1 from public.friends
    where (user_id = p_scanner_id and friend_id = p_owner_id)
       or (user_id = p_owner_id and friend_id = p_scanner_id)
  ) into v_exists;

  if v_exists then
    update public.friends set status = 'accepted'
     where (user_id = p_scanner_id and friend_id = p_owner_id)
        or (user_id = p_owner_id and friend_id = p_scanner_id);
    return json_build_object('success', false, 'message', 'Vocês já estavam conectados!');
  end if;

  insert into public.friends (user_id, friend_id, status)
  values (p_scanner_id, p_owner_id, 'accepted');

  update public.profiles set xp = xp + 50 where id = p_scanner_id;
  insert into public.xp_transactions (user_id, action_type, xp_amount)
  values (p_scanner_id, 'QR_NETWORKING_SCAN', 50);

  update public.profiles set xp = xp + 50 where id = p_owner_id;
  insert into public.xp_transactions (user_id, action_type, xp_amount)
  values (p_owner_id, 'QR_NETWORKING_SCANNED', 50);

  return json_build_object('success', true, 'message', 'Nova Conexão na Teia! +50 XP');
end $$;

-- Só usuários logados chamam estas funções (visitantes não)
revoke all on function public.approve_merchant_claim(uuid) from public, anon;
revoke all on function public.reject_merchant_claim(uuid) from public, anon;
revoke all on function public.validate_event_ticket(uuid) from public, anon;
revoke all on function public.accept_qr_networking(uuid, uuid) from public, anon;
grant execute on function public.approve_merchant_claim(uuid) to authenticated;
grant execute on function public.reject_merchant_claim(uuid) to authenticated;
grant execute on function public.validate_event_ticket(uuid) to authenticated;
grant execute on function public.accept_qr_networking(uuid, uuid) to authenticated;
