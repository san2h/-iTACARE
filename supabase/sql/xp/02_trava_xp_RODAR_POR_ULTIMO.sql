-- =====================================================================
-- PASSO 2 — TRAVA (só rodar DEPOIS que TODO o frontend usar award_xp)
-- A partir daqui o usuário não consegue mais mexer no próprio XP
-- nem nas iTAcoins (use a migration 20261126130000 antes), nem inserir histórico falso. Chamadas antigas param de dar XP
-- (sem erro na tela: o valor antigo é mantido em silêncio).
-- =====================================================================
begin;

create or replace function public.protect_xp_column()
returns trigger
language plpgsql
as $$
begin
  -- Só bloqueia requisições vindas do app (anon/authenticated).
  -- service_role (webhooks/edge functions) e o SQL Editor continuam livres.
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(current_setting('app.xp_write', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.xp := 0;
    elsif new.xp is distinct from old.xp or new.itacoins is distinct from old.itacoins then
      new.xp := old.xp;
      new.itacoins := old.itacoins;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_xp on public.profiles;
create trigger trg_protect_xp
  before insert or update on public.profiles
  for each row execute function public.protect_xp_column();

-- Histórico de XP passa a ser escrito só pela função award_xp
revoke insert, update, delete on public.xp_transactions from anon, authenticated;

commit;
