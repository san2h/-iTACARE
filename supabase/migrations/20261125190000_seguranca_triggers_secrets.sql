-- Registro das alterações aplicadas manualmente no SQL Editor em 2026-11-25
-- (continuação de 20261125180000). Não altera o app (frontend).

-- 1) Média de avaliação do entregador calculada no banco.
--    (O cliente não pode mais atualizar o perfil de outro usuário.)
create or replace function public.recalcular_rating_entregador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.driver_id is not null and new.rating is not null
     and new.rating is distinct from old.rating then
    update public.profiles p
       set total_ratings = s.qtd,
           rating_avg    = s.media
      from (select count(*) as qtd, round(avg(rating)::numeric, 2) as media
              from public.deliveries
             where driver_id = new.driver_id and rating is not null) s
     where p.id = new.driver_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_recalcular_rating_entregador on public.deliveries;
create trigger trg_recalcular_rating_entregador
  after update of rating on public.deliveries
  for each row execute function public.recalcular_rating_entregador();

-- 2) add_community_score: nenhuma das duas versões fica acessível ao cliente.
revoke all on function public.add_community_score(text, integer) from public, anon, authenticated;
revoke all on function public.add_community_score(text, integer, integer) from public, anon, authenticated;

-- A) Usuário logado não pode alterar o próprio plano/papel.
--    auth.uid() é nulo na service role (Edge Functions) e no SQL Editor.
create or replace function public.proteger_colunas_sensiveis_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.user_type is distinct from old.user_type
       or new.role is distinct from old.role then
      raise exception 'Alteração de plano/papel não permitida.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_profiles on public.profiles;
create trigger trg_proteger_profiles
  before update on public.profiles
  for each row execute function public.proteger_colunas_sensiveis_profiles();

-- B) Tabela privada para tokens do Mercado Pago (sem policies: só service role).
--    Os tokens AINDA estão em merchants; serão removidos depois que
--    mp-connect, mp-orders e mp-pay passarem a ler desta tabela.
create table if not exists public.merchant_secrets (
  merchant_id uuid primary key references public.merchants(id) on delete cascade,
  mp_access_token text,
  mp_refresh_token text,
  updated_at timestamptz not null default now()
);
alter table public.merchant_secrets enable row level security;
revoke all on public.merchant_secrets from anon, authenticated;

insert into public.merchant_secrets (merchant_id, mp_access_token, mp_refresh_token)
select id, mp_access_token, mp_refresh_token
from public.merchants
where mp_access_token is not null or mp_refresh_token is not null
on conflict (merchant_id) do update
  set mp_access_token = excluded.mp_access_token,
      mp_refresh_token = excluded.mp_refresh_token,
      updated_at = now();

alter table public.merchants add column if not exists mp_connected boolean not null default false;
update public.merchants set mp_connected = (mp_access_token is not null);

-- ROLLBACK:
--   drop trigger if exists trg_recalcular_rating_entregador on public.deliveries;
--   drop trigger if exists trg_proteger_profiles on public.profiles;
--   drop table public.merchant_secrets;
--   alter table public.merchants drop column mp_connected;
