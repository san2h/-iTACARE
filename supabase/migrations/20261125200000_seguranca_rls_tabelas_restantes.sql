-- =====================================================================
-- RLS das tabelas restantes (rodar BLOCO A BLOCO e testar o app entre eles)
-- Pré-requisito: função public.eh_admin() (já criada nos passos 1-3).
-- Reversão de uma tabela:  alter table public.<tabela> disable row level security;
-- Observações:
--  * Edge Functions (service role) ignoram RLS.
--  * O SQL Editor também ignora RLS (testar sempre pelo app).
-- =====================================================================

-- ===================== BLOCO 1: catálogo (places, merchants, clubs) =====================

-- ---------- places: leitura pública, escrita só admin
alter table public.places enable row level security;
drop policy if exists "rls_places_select" on public.places;
create policy "rls_places_select" on public.places for select to anon, authenticated
  using (true);
drop policy if exists "rls_places_write" on public.places;
create policy "rls_places_write" on public.places for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ---------- merchants: leitura pública, escrita do dono ou admin
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='merchants' loop
    execute format('drop policy %I on public.merchants', r.policyname);
  end loop;
end $$;
alter table public.merchants enable row level security;
drop policy if exists "rls_merchants_select" on public.merchants;
create policy "rls_merchants_select" on public.merchants for select to anon, authenticated
  using (true);
drop policy if exists "rls_merchants_insert" on public.merchants;
create policy "rls_merchants_insert" on public.merchants for insert to authenticated
  with check (public.eh_admin() or (owner_id::text = auth.uid()::text and coalesce(is_partner,false) = false));
drop policy if exists "rls_merchants_update" on public.merchants;
create policy "rls_merchants_update" on public.merchants for update to authenticated
  using (public.eh_admin() or owner_id::text = auth.uid()::text)
  with check (public.eh_admin() or owner_id::text = auth.uid()::text);
drop policy if exists "rls_merchants_delete" on public.merchants;
create policy "rls_merchants_delete" on public.merchants for delete to authenticated
  using (public.eh_admin() or owner_id::text = auth.uid()::text);

-- Dono não pode se promover a parceiro nem trocar o dono do comércio
create or replace function public.proteger_colunas_sensiveis_merchants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.eh_admin() then
    if new.is_partner is distinct from old.is_partner
       or new.owner_id is distinct from old.owner_id then
      raise exception 'Alteração não permitida.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_merchants on public.merchants;
create trigger trg_proteger_merchants before update on public.merchants
  for each row execute function public.proteger_colunas_sensiveis_merchants();
-- ATENÇÃO: merchants continua com leitura pública (o mapa precisa). Os tokens do
-- Mercado Pago só saem dali depois de reescrever mp-connect/mp-orders/mp-pay.

-- ---------- clubs: leitura logado, escrita só admin
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='clubs' loop
    execute format('drop policy %I on public.clubs', r.policyname);
  end loop;
end $$;
alter table public.clubs enable row level security;
drop policy if exists "rls_clubs_select" on public.clubs;
create policy "rls_clubs_select" on public.clubs for select to authenticated
  using (true);
drop policy if exists "rls_clubs_write" on public.clubs;
create policy "rls_clubs_write" on public.clubs for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ===================== BLOCO 2: comunidade e clubes =====================

-- ---------- club_members: ver todos; entrar/sair só o próprio
alter table public.club_members enable row level security;
drop policy if exists "rls_club_members_select" on public.club_members;
create policy "rls_club_members_select" on public.club_members for select to authenticated
  using (true);
drop policy if exists "rls_club_members_insert" on public.club_members;
create policy "rls_club_members_insert" on public.club_members for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_club_members_delete" on public.club_members;
create policy "rls_club_members_delete" on public.club_members for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- club_messages: ver logado; enviar como si mesmo
alter table public.club_messages enable row level security;
drop policy if exists "rls_club_messages_select" on public.club_messages;
create policy "rls_club_messages_select" on public.club_messages for select to authenticated
  using (true);
drop policy if exists "rls_club_messages_insert" on public.club_messages;
create policy "rls_club_messages_insert" on public.club_messages for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_club_messages_delete" on public.club_messages;
create policy "rls_club_messages_delete" on public.club_messages for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- club_photos: ver logado; enviar como si mesmo
alter table public.club_photos enable row level security;
drop policy if exists "rls_club_photos_select" on public.club_photos;
create policy "rls_club_photos_select" on public.club_photos for select to authenticated
  using (true);
drop policy if exists "rls_club_photos_insert" on public.club_photos;
create policy "rls_club_photos_insert" on public.club_photos for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_club_photos_delete" on public.club_photos;
create policy "rls_club_photos_delete" on public.club_photos for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- club_subscriptions: cada um vê a sua; escrita só servidor
alter table public.club_subscriptions enable row level security;
drop policy if exists "rls_club_subscriptions_select" on public.club_subscriptions;
create policy "rls_club_subscriptions_select" on public.club_subscriptions for select to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- community_posts: ver logado; escrever/apagar o próprio
alter table public.community_posts enable row level security;
drop policy if exists "rls_community_posts_select" on public.community_posts;
create policy "rls_community_posts_select" on public.community_posts for select to authenticated
  using (true);
drop policy if exists "rls_community_posts_insert" on public.community_posts;
create policy "rls_community_posts_insert" on public.community_posts for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_community_posts_update" on public.community_posts;
create policy "rls_community_posts_update" on public.community_posts for update to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin())
  with check (user_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_community_posts_delete" on public.community_posts;
create policy "rls_community_posts_delete" on public.community_posts for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- post_comments: ver logado; comentar como si mesmo
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='post_comments' loop
    execute format('drop policy %I on public.post_comments', r.policyname);
  end loop;
end $$;
alter table public.post_comments enable row level security;
drop policy if exists "rls_post_comments_select" on public.post_comments;
create policy "rls_post_comments_select" on public.post_comments for select to authenticated
  using (true);
drop policy if exists "rls_post_comments_insert" on public.post_comments;
create policy "rls_post_comments_insert" on public.post_comments for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_post_comments_delete" on public.post_comments;
create policy "rls_post_comments_delete" on public.post_comments for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- post_likes: ver logado; curtir como si mesmo
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='post_likes' loop
    execute format('drop policy %I on public.post_likes', r.policyname);
  end loop;
end $$;
alter table public.post_likes enable row level security;
drop policy if exists "rls_post_likes_select" on public.post_likes;
create policy "rls_post_likes_select" on public.post_likes for select to authenticated
  using (true);
drop policy if exists "rls_post_likes_insert" on public.post_likes;
create policy "rls_post_likes_insert" on public.post_likes for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_post_likes_delete" on public.post_likes;
create policy "rls_post_likes_delete" on public.post_likes for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ---------- alerts: ver logado; criar o próprio; resolver dono/admin
alter table public.alerts enable row level security;
drop policy if exists "rls_alerts_select" on public.alerts;
create policy "rls_alerts_select" on public.alerts for select to authenticated
  using (true);
drop policy if exists "rls_alerts_insert" on public.alerts;
create policy "rls_alerts_insert" on public.alerts for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_alerts_update" on public.alerts;
create policy "rls_alerts_update" on public.alerts for update to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin())
  with check (user_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_alerts_delete" on public.alerts;
create policy "rls_alerts_delete" on public.alerts for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- ===================== BLOCO 3: marketplace, caronas, aluguéis, serviços =====================

-- ---------- products: ver logado; vendedor gerencia
alter table public.products enable row level security;
drop policy if exists "rls_products_select" on public.products;
create policy "rls_products_select" on public.products for select to authenticated
  using (true);
drop policy if exists "rls_products_insert" on public.products;
create policy "rls_products_insert" on public.products for insert to authenticated
  with check (seller_id::text = auth.uid()::text);
drop policy if exists "rls_products_update" on public.products;
create policy "rls_products_update" on public.products for update to authenticated
  using (seller_id::text = auth.uid()::text or public.eh_admin())
  with check (seller_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_products_delete" on public.products;
create policy "rls_products_delete" on public.products for delete to authenticated
  using (seller_id::text = auth.uid()::text or public.eh_admin());

-- ---------- marketplace_messages: só remetente e destinatário
alter table public.marketplace_messages enable row level security;
drop policy if exists "rls_mkt_msg_select" on public.marketplace_messages;
create policy "rls_mkt_msg_select" on public.marketplace_messages for select to authenticated
  using (sender_id::text = auth.uid()::text or receiver_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_mkt_msg_insert" on public.marketplace_messages;
create policy "rls_mkt_msg_insert" on public.marketplace_messages for insert to authenticated
  with check (sender_id::text = auth.uid()::text);

-- ---------- rides: ver logado; motorista gerencia
alter table public.rides enable row level security;
drop policy if exists "rls_rides_select" on public.rides;
create policy "rls_rides_select" on public.rides for select to authenticated
  using (true);
drop policy if exists "rls_rides_insert" on public.rides;
create policy "rls_rides_insert" on public.rides for insert to authenticated
  with check (driver_id::text = auth.uid()::text);
drop policy if exists "rls_rides_update" on public.rides;
create policy "rls_rides_update" on public.rides for update to authenticated
  using (driver_id::text = auth.uid()::text or public.eh_admin())
  with check (driver_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_rides_delete" on public.rides;
create policy "rls_rides_delete" on public.rides for delete to authenticated
  using (driver_id::text = auth.uid()::text or public.eh_admin());

-- ---------- rentals: ver logado; anfitrião gerencia; qualquer um curte/segue
alter table public.rentals enable row level security;
drop policy if exists "rls_rentals_select" on public.rentals;
create policy "rls_rentals_select" on public.rentals for select to authenticated
  using (true);
drop policy if exists "rls_rentals_insert" on public.rentals;
create policy "rls_rentals_insert" on public.rentals for insert to authenticated
  with check (host_id::text = auth.uid()::text);
drop policy if exists "rls_rentals_update" on public.rentals;
create policy "rls_rentals_update" on public.rentals for update to authenticated
  using (true)
  with check (true);
drop policy if exists "rls_rentals_delete" on public.rentals;
create policy "rls_rentals_delete" on public.rentals for delete to authenticated
  using (host_id::text = auth.uid()::text or public.eh_admin());

-- Quem não é anfitrião só pode mexer nos contadores de curtidas/seguidores
create or replace function public.limitar_update_rentals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.eh_admin()
     and old.host_id::text is distinct from auth.uid()::text then
    if (to_jsonb(new) - 'likes_count' - 'followers_count')
       is distinct from (to_jsonb(old) - 'likes_count' - 'followers_count') then
      raise exception 'Apenas o anfitrião pode editar este aluguel.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_limitar_update_rentals on public.rentals;
create trigger trg_limitar_update_rentals before update on public.rentals
  for each row execute function public.limitar_update_rentals();

-- ---------- rental_messages: só remetente e destinatário
alter table public.rental_messages enable row level security;
drop policy if exists "rls_rental_msg_select" on public.rental_messages;
create policy "rls_rental_msg_select" on public.rental_messages for select to authenticated
  using (sender_id::text = auth.uid()::text or receiver_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_rental_msg_insert" on public.rental_messages;
create policy "rls_rental_msg_insert" on public.rental_messages for insert to authenticated
  with check (sender_id::text = auth.uid()::text);

-- ---------- service_providers: ver logado; prestador gerencia; avaliação por qualquer um
alter table public.service_providers enable row level security;
drop policy if exists "rls_service_providers_select" on public.service_providers;
create policy "rls_service_providers_select" on public.service_providers for select to authenticated
  using (true);
drop policy if exists "rls_service_providers_insert" on public.service_providers;
create policy "rls_service_providers_insert" on public.service_providers for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_service_providers_update" on public.service_providers;
create policy "rls_service_providers_update" on public.service_providers for update to authenticated
  using (true)
  with check (true);
drop policy if exists "rls_service_providers_delete" on public.service_providers;
create policy "rls_service_providers_delete" on public.service_providers for delete to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

-- Quem não é o prestador só pode alterar a nota média e a contagem de avaliações
create or replace function public.limitar_update_service_providers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.eh_admin()
     and old.user_id::text is distinct from auth.uid()::text then
    if (to_jsonb(new) - 'rating' - 'reviews_count')
       is distinct from (to_jsonb(old) - 'rating' - 'reviews_count') then
      raise exception 'Apenas o prestador pode editar este serviço.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_limitar_update_service_providers on public.service_providers;
create trigger trg_limitar_update_service_providers before update on public.service_providers
  for each row execute function public.limitar_update_service_providers();

-- ===================== BLOCO 4: delivery, verificações, itacoins =====================

-- ---------- deliveries: cliente, entregador e pedidos pendentes
alter table public.deliveries enable row level security;
drop policy if exists "rls_deliveries_select" on public.deliveries;
create policy "rls_deliveries_select" on public.deliveries for select to authenticated
  using (client_id::text = auth.uid()::text or driver_id::text = auth.uid()::text or status = 'pending' or public.eh_admin());
drop policy if exists "rls_deliveries_insert" on public.deliveries;
create policy "rls_deliveries_insert" on public.deliveries for insert to authenticated
  with check (client_id::text = auth.uid()::text);
drop policy if exists "rls_deliveries_update" on public.deliveries;
create policy "rls_deliveries_update" on public.deliveries for update to authenticated
  using (client_id::text = auth.uid()::text or driver_id::text = auth.uid()::text or (driver_id is null and status = 'pending') or public.eh_admin())
  with check (client_id::text = auth.uid()::text or driver_id::text = auth.uid()::text or public.eh_admin());

-- ---------- delivery_messages: só participantes da entrega
alter table public.delivery_messages enable row level security;
drop policy if exists "rls_delivery_msg_select" on public.delivery_messages;
create policy "rls_delivery_msg_select" on public.delivery_messages for select to authenticated
  using (exists (select 1 from public.deliveries d where d.id = delivery_id and (d.client_id::text = auth.uid()::text or d.driver_id::text = auth.uid()::text)) or public.eh_admin());
drop policy if exists "rls_delivery_msg_insert" on public.delivery_messages;
create policy "rls_delivery_msg_insert" on public.delivery_messages for insert to authenticated
  with check (sender_id::text = auth.uid()::text and exists (select 1 from public.deliveries d where d.id = delivery_id and (d.client_id::text = auth.uid()::text or d.driver_id::text = auth.uid()::text)));

-- ---------- verifications: enviar a própria; admin aprova
alter table public.verifications enable row level security;
drop policy if exists "rls_verifications_select" on public.verifications;
create policy "rls_verifications_select" on public.verifications for select to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());
drop policy if exists "rls_verifications_insert" on public.verifications;
create policy "rls_verifications_insert" on public.verifications for insert to authenticated
  with check (user_id::text = auth.uid()::text);
drop policy if exists "rls_verifications_update" on public.verifications;
create policy "rls_verifications_update" on public.verifications for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ---------- itacoins: cada um vê o seu; escrita só servidor
alter table public.itacoins enable row level security;
drop policy if exists "rls_itacoins_select" on public.itacoins;
create policy "rls_itacoins_select" on public.itacoins for select to authenticated
  using (user_id::text = auth.uid()::text or public.eh_admin());

