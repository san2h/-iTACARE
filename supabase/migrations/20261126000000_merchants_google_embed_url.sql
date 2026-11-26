-- Link oficial de "Compartilhar > Incorporar um mapa" do Google Maps
-- (https://www.google.com/maps/embed?pb=...). Opcional: sem ele, o app usa a busca por nome.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS google_embed_url text;
