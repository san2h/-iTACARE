-- =====================================================================
-- PASSO 1 — Motor de XP no servidor (NÃO QUEBRA NADA)
-- Pode rodar a qualquer momento: o app atual continua funcionando igual.
-- Cria: tabela de regras, índice anti-duplicata e a função award_xp().
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Tabela de regras: o servidor decide quanto vale cada ação
-- ---------------------------------------------------------------------
create table if not exists public.xp_rules (
  action_type        text primary key,
  xp_amount          integer not null check (xp_amount >= 0),
  daily_cap          integer check (daily_cap is null or daily_cap > 0), -- null = sem limite diário
  requires_reference boolean not null default true,
  active             boolean not null default true,
  description        text
);

alter table public.xp_rules enable row level security;
drop policy if exists "xp_rules_leitura" on public.xp_rules;
create policy "xp_rules_leitura" on public.xp_rules
  for select to authenticated using (true);

-- Valores para validar (re-rodar o script atualiza os valores)
insert into public.xp_rules (action_type, xp_amount, daily_cap, requires_reference, description) values
  ('CREATE_FEED_POST',  15,  3, true, 'Publicar no Feed (ref = posts.id)'),
  ('COMMENT_FEED_POST',  5, 10, true, 'Comentar post de outra pessoa (ref = comments.id)'),
  ('LIKE_FEED_POST',     2, 20, true, 'Curtir post de outra pessoa (ref = posts.id)'),
  ('FOLLOW_USER',       10,  5, true, 'Seguir usuário (ref = id do seguido)'),
  ('ACCEPT_FRIEND',     10,  5, true, 'Aceitar amizade (ref = id do amigo)'),
  ('LIKE_MERCHANT',      5, 10, true, 'Curtir comércio (ref = merchants.id)'),
  ('FOLLOW_MERCHANT',   10,  5, true, 'Seguir comércio (ref = merchants.id)'),
  ('CHECK_IN_FISICO',   50,  5, true, 'Check-in no local (ref = merchant_checkins.id do dia)'),
  ('SHARE_IG_PARTNER',  20,  3, true, 'Compartilhar check-in no Instagram (ref = merchant_checkins.id, 1x por check-in)'),
  ('PURCHASE',          50,  3, true, 'Pagamento em comércio'),
  ('SEND_SOS_INVITE',   10,  5, true, 'Convidar para rede S.O.S (antes dava 100 por bug)'),
  ('ACCEPT_SOS',        25,  5, true, 'Aceitar rede S.O.S (antes dava 2500 por bug)')
on conflict (action_type) do update set
  xp_amount = excluded.xp_amount,
  daily_cap = excluded.daily_cap,
  requires_reference = excluded.requires_reference,
  description = excluded.description;

-- ---------------------------------------------------------------------
-- 2. xp_transactions: reference_id em texto + created_at garantidos
-- ---------------------------------------------------------------------
alter table public.xp_transactions add column if not exists reference_id text;
alter table public.xp_transactions add column if not exists created_at timestamptz not null default now();

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'xp_transactions' and column_name = 'reference_id') <> 'text' then
    alter table public.xp_transactions alter column reference_id type text using reference_id::text;
  end if;
end $$;

-- Mesmo usuário não ganha 2x pela mesma ação + referência.
-- Se falhar aqui, existem duplicatas: rode a checagem 0.2.
create unique index if not exists xp_transactions_unq_ref
  on public.xp_transactions (user_id, action_type, reference_id)
  where reference_id is not null;

create index if not exists xp_transactions_user_action_date
  on public.xp_transactions (user_id, action_type, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Função award_xp: única porta de entrada de XP
-- ---------------------------------------------------------------------
create or replace function public.award_xp(p_action text, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_rule       public.xp_rules%rowtype;
  v_day_start  timestamptz := date_trunc('day', now() at time zone 'America/Bahia') at time zone 'America/Bahia';
  v_ok         boolean := true;
  v_count      integer;
  v_inserted   integer;
  v_total      integer;
begin
  if v_uid is null then
    return jsonb_build_object('awarded', false, 'reason', 'not_authenticated');
  end if;

  select * into v_rule from public.xp_rules where action_type = p_action and active;
  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'unknown_action');
  end if;

  if v_rule.requires_reference and coalesce(p_reference, '') = '' then
    return jsonb_build_object('awarded', false, 'reason', 'missing_reference');
  end if;

  -- Validação: a ação precisa ter acontecido de verdade no banco
  case p_action
    when 'CREATE_FEED_POST' then
      v_ok := exists (select 1 from public.posts p
                      where p.id::text = p_reference and p.user_id::text = v_uid::text);
    when 'COMMENT_FEED_POST' then
      v_ok := exists (select 1 from public.comments c join public.posts p on p.id = c.post_id
                      where c.id::text = p_reference and c.user_id::text = v_uid::text
                        and p.user_id::text <> v_uid::text);
    when 'LIKE_FEED_POST' then
      v_ok := exists (select 1 from public.post_likes l join public.posts p on p.id = l.post_id
                      where l.post_id::text = p_reference and l.user_id::text = v_uid::text
                        and p.user_id::text <> v_uid::text);
    when 'FOLLOW_USER' then
      v_ok := p_reference <> v_uid::text
              and exists (select 1 from public.follows f
                          where f.follower_id::text = v_uid::text and f.following_id::text = p_reference);
    when 'ACCEPT_FRIEND' then
      v_ok := exists (select 1 from public.friends f
                      where f.status = 'accepted'
                        and ((f.user_id::text = v_uid::text and f.friend_id::text = p_reference)
                          or (f.friend_id::text = v_uid::text and f.user_id::text = p_reference)));
    when 'CHECK_IN_FISICO', 'SHARE_IG_PARTNER' then
      v_ok := exists (select 1 from public.merchant_checkins mc
                      where mc.id::text = p_reference and mc.user_id::text = v_uid::text
                        and mc.created_at >= v_day_start);
    else
      v_ok := true; -- demais ações: só regra + limite diário + anti-duplicata
  end case;

  if not v_ok then
    return jsonb_build_object('awarded', false, 'reason', 'invalid_reference');
  end if;

  -- Limite diário (lock evita corrida entre duas chamadas simultâneas)
  if v_rule.daily_cap is not null then
    perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_action));
    select count(*) into v_count
    from public.xp_transactions
    where user_id::text = v_uid::text and action_type = p_action and created_at >= v_day_start;
    if v_count >= v_rule.daily_cap then
      return jsonb_build_object('awarded', false, 'reason', 'daily_cap');
    end if;
  end if;

  -- Registra no histórico (o índice único bloqueia repetição)
  insert into public.xp_transactions (user_id, action_type, xp_amount, reference_id)
  values (v_uid, p_action, v_rule.xp_amount, nullif(p_reference, ''))
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  -- Soma atômica (sem ler-somar-gravar no celular). O flag libera o trigger da migração 02.
  perform set_config('app.xp_write', 'on', true);
  update public.profiles set xp = coalesce(xp, 0) + v_rule.xp_amount
  where id = v_uid
  returning xp into v_total;
  perform set_config('app.xp_write', 'off', true);

  return jsonb_build_object('awarded', true, 'amount', v_rule.xp_amount, 'total_xp', v_total);
end;
$$;

revoke all on function public.award_xp(text, text) from public, anon;
grant execute on function public.award_xp(text, text) to authenticated;

commit;
