-- extension_providers: no app code reads this table; restrict to admins only (Admins manage providers policy already covers SELECT for admins)
DROP POLICY IF EXISTS "Providers publicly readable" ON public.extension_providers;
REVOKE SELECT ON public.extension_providers FROM anon;

-- catalog_items: keep the catalog publicly readable, but hide soft-deleted (is_hidden) items from everyone via RLS
DROP POLICY IF EXISTS "Catalog is publicly readable" ON public.catalog_items;
CREATE POLICY "Catalog is publicly readable"
  ON public.catalog_items
  FOR SELECT
  TO anon, authenticated
  USING (is_hidden = false);