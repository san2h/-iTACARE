-- =====================================================================
-- XP: ultimas telas que gravavam XP direto no perfil
--   JOIN_CLUB          entrar no clube (ref = clubs.id, precisa ser membro)
--   DELIVERY_COMPLETE  entrega concluida (ref = deliveries.id, driver_id = voce,
--                      status completed; bike paga 100, demais 50)
--   SERVICE_CHAT_DONE  concluir servico no chat (ref = service_providers.id,
--                      nao pode ser o proprio prestador). Era +500 sem validar nada.
--   MISSION_COMPLETE   missao de campo (ref = titulo da missao; exige post seu
--                      criado nos ultimos 15 min)
-- Recria award_xp com o mesmo conteudo da migration 20261126100200 + novos casos.
-- =====================================================================
begin;

insert into public.xp_rules (action_type, xp_amount, daily_cap, requires_reference, description) values
  ('JOIN_CLUB',         20,  5, true, 'Entrar em clube (ref = clubs.id)'),
  ('DELIVERY_COMPLETE', 50, 10, true, 'Entrega concluida (ref = deliveries.id; bike = 100)'),
  ('SERVICE_CHAT_DONE', 50,  3, true, 'Servico concluido (ref = service_providers.id)'),
  ('MISSION_COMPLETE',   5,  5, true, 'Missao de campo (ref = titulo da missao)')
on conflict (action_type) do update
  set xp_amount = excluded.xp_amount, daily_cap = excluded.daily_cap,
      requires_reference = excluded.requires_reference, description = excluded.description, active = true;

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
  update public.profiles set xp = coalesce(xp, 0) + v_amount
  where id = v_uid
  returning xp into v_total;
  perform set_config('app.xp_write', 'off', true);

  return jsonb_build_object('awarded', true, 'amount', v_amount, 'total_xp', v_total);
end;
$$;

revoke all on function public.award_xp(text, text) from public, anon;
grant execute on function public.award_xp(text, text) to authenticated;

commit;
