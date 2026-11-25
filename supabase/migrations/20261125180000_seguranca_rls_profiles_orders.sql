-- Registro das alterações de segurança aplicadas manualmente no SQL Editor
-- do Supabase em 2026-11-25. Este arquivo NÃO altera o app (frontend); serve
-- apenas como histórico do que mudou no banco.

-- PASSO 1: profiles
-- A policy "Livre acesso perfis" (ALL, public, true/true) permitia que qualquer
-- pessoa, mesmo sem login, lesse, editasse e apagasse qualquer perfil.
-- Continuam valendo: leitura pública, insert próprio e update próprio.
drop policy if exists "Livre acesso perfis" on public.profiles;

-- PASSO 2: orders
-- A tabela estava com RLS desligado (aberta para qualquer um com a anon key).
-- O cliente só pode criar pedido próprio com status 'pending_payment'.
-- Não há policy de UPDATE/DELETE: mudanças de status só via service role
-- (Edge Functions / webhook de pagamento).
alter table public.orders enable row level security;

drop policy if exists "Users create own pending orders" on public.orders;
create policy "Users create own pending orders" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid()::text and status = 'pending_payment');

-- (A policy "Users see own orders" de SELECT já existia.)

-- ROLLBACK (se necessário):
--   create policy "Livre acesso perfis" on public.profiles
--     for all to public using (true) with check (true);
--   alter table public.orders disable row level security;
--   drop policy if exists "Users create own pending orders" on public.orders;
