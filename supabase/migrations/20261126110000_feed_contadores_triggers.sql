-- Feed: contadores de curtidas/comentarios calculados pelo banco
-- (antes o app calculava no celular e gravava em posts, o que perdia
-- curtidas simultaneas e permitia forjar os numeros).

-- 1) Indices para paginacao e contagem
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);
create index if not exists comments_post_id_idx on public.comments (post_id);

-- 2) Funcao dos gatilhos de contagem (SECURITY DEFINER: roda como dono)
create or replace function public.feed_atualiza_contador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'post_likes' then
    if tg_op = 'INSERT' then
      update public.posts set likes_count = coalesce(likes_count, 0) + 1 where id = new.post_id;
    else
      update public.posts set likes_count = greatest(0, coalesce(likes_count, 0) - 1) where id = old.post_id;
    end if;
  else
    if tg_op = 'INSERT' then
      update public.posts set comments_count = coalesce(comments_count, 0) + 1 where id = new.post_id;
    else
      update public.posts set comments_count = greatest(0, coalesce(comments_count, 0) - 1) where id = old.post_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_likes_contador on public.post_likes;
create trigger trg_post_likes_contador
after insert or delete on public.post_likes
for each row execute function public.feed_atualiza_contador();

drop trigger if exists trg_comments_contador on public.comments;
create trigger trg_comments_contador
after insert or delete on public.comments
for each row execute function public.feed_atualiza_contador();

-- 3) Recalcula os contadores existentes (corrige o que ficou fora de sincronia).
--    Roda ANTES da protecao, senao o gatilho de protecao desfaria a correcao.
update public.posts p
   set likes_count = (select count(*) from public.post_likes l where l.post_id = p.id),
       comments_count = (select count(*) from public.comments c where c.post_id = p.id);

-- 4) Ignora gravacao direta dos contadores pelo app.
--    Quando o UPDATE vem do gatilho acima, pg_trigger_depth() > 1.
create or replace function public.feed_protege_contadores()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() = 1 then
    new.likes_count := old.likes_count;
    new.comments_count := old.comments_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_posts_protege_contadores on public.posts;
create trigger trg_posts_protege_contadores
before update on public.posts
for each row execute function public.feed_protege_contadores();

