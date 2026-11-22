CREATE TABLE public.extension_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_url text NOT NULL,
  provider_id text NOT NULL,
  name text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  icon_url text,
  flag text NOT NULL DEFAULT 'global',
  author text,
  status text NOT NULL DEFAULT 'active',
  test_status text NOT NULL DEFAULT 'not_tested',
  test_message text,
  has_settings boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, provider_id)
);
GRANT SELECT ON public.extension_providers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_providers TO authenticated;
GRANT ALL ON public.extension_providers TO service_role;
ALTER TABLE public.extension_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers publicly readable" ON public.extension_providers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage providers" ON public.extension_providers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role));