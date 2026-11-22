CREATE TABLE IF NOT EXISTS public.stremio_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manifest_url text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stremio_addons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stremio_addons TO authenticated;
GRANT ALL ON public.stremio_addons TO service_role;
ALTER TABLE public.stremio_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Addons publicly readable" ON public.stremio_addons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage addons" ON public.stremio_addons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));