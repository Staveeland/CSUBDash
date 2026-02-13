-- Harden dashboard/import access:
-- 1) Remove anonymous read access
-- 2) Restrict authenticated access to approved employee domains
-- 3) Harden storage bucket policies for imports

-- Remove known anonymous policies
DROP POLICY IF EXISTS "Anon read projects" ON public.projects;
DROP POLICY IF EXISTS "Anon read upcoming awards" ON public.upcoming_awards;
DROP POLICY IF EXISTS "Allow import uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow import reads" ON storage.objects;

-- Domain check helper used by RLS policies
CREATE OR REPLACE FUNCTION public.is_allowed_employee()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2))
    IN ('csub.com', 'workflows.no');
$$;

-- Ensure RLS is enabled on core data tables
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xmt_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surf_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsea_unit_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upcoming_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Replace permissive authenticated policies with domain-restricted policies
DROP POLICY IF EXISTS "Authenticated read" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated read" ON public.contract_notes;
DROP POLICY IF EXISTS "Authenticated read" ON public.news_items;
DROP POLICY IF EXISTS "Authenticated read" ON public.documents;
DROP POLICY IF EXISTS "Authenticated read" ON public.forecasts;
DROP POLICY IF EXISTS "Authenticated read" ON public.contact_log;
DROP POLICY IF EXISTS "Authenticated read" ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated read" ON public.users;
DROP POLICY IF EXISTS "Authenticated read" ON public.projects;
DROP POLICY IF EXISTS "Authenticated read" ON public.import_batches;
DROP POLICY IF EXISTS "Authenticated read" ON public.xmt_data;
DROP POLICY IF EXISTS "Authenticated read" ON public.surf_data;
DROP POLICY IF EXISTS "Authenticated read" ON public.subsea_unit_data;
DROP POLICY IF EXISTS "Authenticated read" ON public.upcoming_awards;
DROP POLICY IF EXISTS "Authenticated read" ON public.import_jobs;

DROP POLICY IF EXISTS "Authenticated write" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated update" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated write" ON public.contract_notes;
DROP POLICY IF EXISTS "Authenticated write" ON public.documents;
DROP POLICY IF EXISTS "Authenticated write" ON public.contact_log;
DROP POLICY IF EXISTS "Authenticated write" ON public.projects;
DROP POLICY IF EXISTS "Authenticated update" ON public.projects;
DROP POLICY IF EXISTS "Authenticated write" ON public.import_batches;
DROP POLICY IF EXISTS "Authenticated update" ON public.import_batches;
DROP POLICY IF EXISTS "Authenticated write" ON public.xmt_data;
DROP POLICY IF EXISTS "Authenticated write" ON public.surf_data;
DROP POLICY IF EXISTS "Authenticated write" ON public.subsea_unit_data;
DROP POLICY IF EXISTS "Authenticated write" ON public.upcoming_awards;
DROP POLICY IF EXISTS "Authenticated write" ON public.import_jobs;
DROP POLICY IF EXISTS "Authenticated update" ON public.import_jobs;

CREATE POLICY "Approved employee read" ON public.contracts
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.contract_notes
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.news_items
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.documents
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.forecasts
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.contact_log
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.users
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.projects
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.import_batches
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.xmt_data
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.surf_data
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.subsea_unit_data
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.upcoming_awards
  FOR SELECT TO authenticated USING (public.is_allowed_employee());
CREATE POLICY "Approved employee read" ON public.import_jobs
  FOR SELECT TO authenticated USING (public.is_allowed_employee());

CREATE POLICY "Approved employee insert" ON public.contracts
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee update" ON public.contracts
  FOR UPDATE TO authenticated USING (public.is_allowed_employee()) WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.contract_notes
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.contact_log
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee update" ON public.projects
  FOR UPDATE TO authenticated USING (public.is_allowed_employee()) WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.import_batches
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee update" ON public.import_batches
  FOR UPDATE TO authenticated USING (public.is_allowed_employee()) WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.xmt_data
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.surf_data
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.subsea_unit_data
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.upcoming_awards
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee insert" ON public.import_jobs
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());
CREATE POLICY "Approved employee update" ON public.import_jobs
  FOR UPDATE TO authenticated USING (public.is_allowed_employee()) WITH CHECK (public.is_allowed_employee());

-- Storage: no anonymous access to imports bucket
CREATE POLICY "Approved employee upload import objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imports' AND public.is_allowed_employee());

CREATE POLICY "Approved employee read import objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'imports' AND public.is_allowed_employee());
