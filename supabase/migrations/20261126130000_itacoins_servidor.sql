-- =====================================================================
-- iTAcoins no servidor
--  * xp_rules.coin_amount: moedas pagas junto com o XP, na MESMA chamada
--    de award_xp (mesmas validacoes, limite diario e anti-duplicata).
--      DELIVERY_COMPLETE 20 (bike 50) | SERVICE_CHAT_DONE 10
--      ATTEND_EVENT = events.reward_itacoins (teto 500)
--      JOIN_CLUB 0 (o pagamento do clube e simulado)
--  * spend_itacoins(): debito atomico com checagem de saldo e historico.
-- Recria award_xp (conteudo da migration 20261126120000 + moedas).
-- =====================================================================
begin;

alter table public.xp_rules add column if not exists coin_amount integer not null default 0;
update public.xp_rules set coin_amount = 20 where action_type = 'DELIVERY_COMPLETE';
update public.xp_rules set coin_amount = 10 where action_type = 'SERVICE_CHAT_DONE';

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
  v_amount     integer;
  v_coins      integer;
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
  v_amount := v_rule.xp_amount;
  v_coins  := coalesce(v_rule.coin_amount, 0);

  if v_rule.requires_reference and coalesce(p_reference, '') = '' then
    return jsonb_build_object('awarded', false, 'reason', 'missing_reference');
  end if;

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
      -- o check-in precisa ser seu, de hoje e o PRIMEIRO do dia neste local
      -- (toques repetidos ou duas abas não geram XP em dobro)
      v_ok := exists (
        select 1 from public.merchant_checkins mc
        where mc.id::text = p_reference
          and mc.user_id::text = v_uid::text
          and mc.created_at >= v_day_start
          and not exists (
            select 1 from public.merchant_checkins outro
            where outro.user_id = mc.user_id
              and outro.merchant_id = mc.merchant_id
              and outro.created_at >= v_day_start
              and (outro.created_at < mc.created_at
                   or (outro.created_at = mc.created_at and outro.id::text < mc.id::text))
          )
      );
    when 'OFFER_RIDE' then
      v_ok := exists (select 1 from public.rides r
                      where r.id::text = p_reference and r.driver_id::text = v_uid::text);
    when 'MEET_RIDE' then
      v_ok := p_reference <> v_uid::text;
    when 'ATTEND_EVENT' then
      v_ok := exists (select 1 from public.tickets t
                      where t.event_id::text = p_reference and t.user_id::text = v_uid::text
                        and t.status = 'used');
      -- valor definido no evento, com teto de segurança de 500
      select least(coalesce(e.reward_xp, v_rule.xp_amount), 500) into v_amount
      from public.events e where e.id::text = p_reference;
      v_amount := coalesce(v_amount, v_rule.xp_amount);
      select least(greatest(coalesce(e.reward_itacoins, 0), 0), 500) into v_coins
      from public.events e where e.id::text = p_reference;
      v_coins := coalesce(v_coins, 0);
    when 'REGISTER_SERVICE' then
      v_ok := exists (select 1 from public.service_providers s
                      where s.id::text = p_reference and s.user_id::text = v_uid::text);
    when 'CREATE_RENTAL' then
      v_ok := exists (select 1 from public.rentals r
                      where r.id::text = p_reference and r.host_id::text = v_uid::text);
    when 'JOIN_CLUB' then
      v_ok := exists (select 1 from public.club_members m
                      where m.club_id::text = p_reference and m.user_id::text = v_uid::text);
    when 'DELIVERY_COMPLETE' then
      v_ok := exists (select 1 from public.deliveries d
                      where d.id::text = p_reference and d.driver_id::text = v_uid::text
                        and d.status = 'completed');
      if exists (select 1 from public.profiles pr where pr.id = v_uid and pr.vehicle_type = 'bike') then
        v_amount := 100;
        v_coins  := 50;
      end if;
    when 'SERVICE_CHAT_DONE' then
      v_ok := exists (select 1 from public.service_providers s
                      where s.id::text = p_reference and s.user_id::text <> v_uid::text);
    when 'MISSION_COMPLETE' then
      v_ok := exists (select 1 from public.posts p
                      where p.user_id::text = v_uid::text and p.created_at > now() - interval '15 minutes');
    else
      v_ok := true;
  end case;

  if not v_ok then
    return jsonb_build_object('awarded', false, 'reason', 'invalid_reference');
  end if;

  if v_rule.daily_cap is not null then
    perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_action));
    select count(*) into v_count
    from public.xp_transactions
    where user_id::text = v_uid::text and action_type = p_action and created_at >= v_day_start;
    if v_count >= v_rule.daily_cap then
      return jsonb_build_object('awarded', false, 'reason', 'daily_cap');
    end if;
  end if;

  insert into public.xp_transactions (user_id, action_type, xp_amount, reference_id)
  values (v_uid, p_action, v_amount, nullif(p_reference, ''))
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  perform set_config('app.xp_write', 'on', true);
  update public.profiles
     set xp = coalesce(xp, 0) + v_amount,
         itacoins = coalesce(itacoins, 0) + v_coins
   where id = v_uid
  returning xp into v_total;
  perform set_config('app.xp_write', 'off', true);

  if v_coins > 0 then
    begin
      insert into public.itacoin_transactions (user_id, amount, type, description)
      values (v_uid, v_coins, 'earn', 'Recompensa: ' || p_action);
    exception when others then
      null; -- historico e opcional; nunca impede o pagamento
    end;
  end if;

  return jsonb_build_object('awarded', true, 'amount', v_amount, 'coins', v_coins, 'total_xp', v_total);
end;
$$;

revoke all on function public.award_xp(text, text) from public, anon;
grant execute on function public.award_xp(text, text) to authenticated;

-- Debito atomico de iTAcoins (nunca fica negativo)
create or replace function public.spend_itacoins(
  p_amount integer, p_type text default 'spend', p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bal integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  if p_type not in ('spend', 'burn') then
    p_type := 'spend';
  end if;

  select coalesce(itacoins, 0) into v_bal from public.profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if v_bal < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance', v_bal);
  end if;

  perform set_config('app.xp_write', 'on', true);
  update public.profiles set itacoins = v_bal - p_amount where id = v_uid;
  perform set_config('app.xp_write', 'off', true);

  insert into public.itacoin_transactions (user_id, amount, type, description)
  values (v_uid, -p_amount, p_type, coalesce(p_description, 'Gasto em iTAcoins'));

  return jsonb_build_object('ok', true, 'balance', v_bal - p_amount);
end;
$$;

revoke all on function public.spend_itacoins(integer, text, text) from public, anon;
grant execute on function public.spend_itacoins(integer, text, text) to authenticated;

commit;
