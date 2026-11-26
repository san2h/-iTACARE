-- =====================================================================
-- OPCIONAL — Corrige o XP dado a mais pelo bug do S.O.S
-- (SEND_SOS_INVITE pagava 100 em vez de 10; ACCEPT_SOS pagava 2500 em vez de 25)
-- Rode PRIMEIRO só a parte 1 (prévia). Se estiver certo, rode a parte 2.
-- =====================================================================

-- PARTE 1 — PRÉVIA (não altera nada)
with excesso as (
  select t.user_id,
         sum(t.xp_amount - r.xp_amount) as xp_a_remover
  from public.xp_transactions t
  join public.xp_rules r on r.action_type = t.action_type
  where t.action_type in ('SEND_SOS_INVITE', 'ACCEPT_SOS')
    and t.xp_amount > r.xp_amount
  group by t.user_id
)
select p.id, p.full_name, p.xp as xp_atual, e.xp_a_remover,
       greatest(p.xp - e.xp_a_remover, 0) as xp_corrigido
from excesso e join public.profiles p on p.id::text = e.user_id::text
order by e.xp_a_remover desc;

-- PARTE 2 — APLICAR (descomente para rodar)
-- begin;
-- with excesso as (
--   select t.user_id, sum(t.xp_amount - r.xp_amount) as xp_a_remover
--   from public.xp_transactions t
--   join public.xp_rules r on r.action_type = t.action_type
--   where t.action_type in ('SEND_SOS_INVITE', 'ACCEPT_SOS') and t.xp_amount > r.xp_amount
--   group by t.user_id
-- )
-- update public.profiles p
-- set xp = greatest(coalesce(p.xp, 0) - e.xp_a_remover, 0)
-- from excesso e
-- where p.id::text = e.user_id::text;
--
-- update public.xp_transactions t
-- set xp_amount = r.xp_amount
-- from public.xp_rules r
-- where r.action_type = t.action_type
--   and t.action_type in ('SEND_SOS_INVITE', 'ACCEPT_SOS')
--   and t.xp_amount > r.xp_amount;
-- commit;
