-- Security hardening: ensure scrape_sources is protected by RLS
-- This resolves Security Advisor warning:
-- "Table public.scrape_sources is public, but RLS has not been enabled."

ALTER TABLE public.scrape_sources ENABLE ROW LEVEL SECURITY;

-- Clean up legacy policy names if they exist.
DROP POLICY IF EXISTS "Authenticated read" ON public.scrape_sources;
DROP POLICY IF EXISTS "Authenticated write" ON public.scrape_sources;
DROP POLICY IF EXISTS "Authenticated update" ON public.scrape_sources;

DROP POLICY IF EXISTS "Approved employee read" ON public.scrape_sources;
CREATE POLICY "Approved employee read" ON public.scrape_sources
  FOR SELECT TO authenticated USING (public.is_allowed_employee());

DROP POLICY IF EXISTS "Approved employee insert" ON public.scrape_sources;
CREATE POLICY "Approved employee insert" ON public.scrape_sources
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());

DROP POLICY IF EXISTS "Approved employee update" ON public.scrape_sources;
CREATE POLICY "Approved employee update" ON public.scrape_sources
  FOR UPDATE TO authenticated USING (public.is_allowed_employee()) WITH CHECK (public.is_allowed_employee());

DROP POLICY IF EXISTS "Service role full access" ON public.scrape_sources;
CREATE POLICY "Service role full access" ON public.scrape_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);
