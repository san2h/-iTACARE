-- =====================================================================
-- PASSO 0 — CHECAGEM (somente leitura, não altera nada)
-- Rode no SQL Editor do Supabase ANTES da migração 01 e me mande o resultado.
-- =====================================================================

-- 0.1 Tipos das colunas que a função award_xp vai usar
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('profiles','id'), ('profiles','xp'),
    ('xp_transactions','user_id'), ('xp_transactions','reference_id'), ('xp_transactions','created_at'),
    ('posts','id'), ('posts','user_id'),
    ('comments','id'), ('comments','user_id'), ('comments','post_id'),
    ('post_likes','post_id'), ('post_likes','user_id'),
    ('follows','follower_id'), ('follows','following_id'),
    ('friends','user_id'), ('friends','friend_id'), ('friends','status'),
    ('merchant_checkins','id'), ('merchant_checkins','user_id'), ('merchant_checkins','created_at')
  )
order by table_name, column_name;

-- 0.2 Duplicatas que impediriam o índice único (se voltar linhas, me avise)
select user_id, action_type, reference_id, count(*) as vezes
from public.xp_transactions
where reference_id is not null
group by 1, 2, 3
having count(*) > 1
order by vezes desc
limit 50;

-- 0.3 Políticas atuais de profiles e xp_transactions
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'xp_transactions');

-- 0.4 Quais ações já existem no histórico (para não esquecer nenhuma regra)
select action_type, count(*) as total, sum(xp_amount) as xp_total
from public.xp_transactions
group by 1
order by total desc;
