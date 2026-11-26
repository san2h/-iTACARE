-- Guarda o Google Place ID de cada estabelecimento.
-- O place_id é o único dado do Google que pode ser armazenado sem restrição de cache.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS google_place_id text;
