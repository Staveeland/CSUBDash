-- Async import jobs for storage-first ingestion pipeline
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('excel_rystad', 'pdf_contract_awards', 'pdf_market_report')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  storage_bucket TEXT NOT NULL DEFAULT 'imports',
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  import_batch_id UUID REFERENCES public.import_batches(id),
  records_total INTEGER DEFAULT 0,
  records_imported INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created
  ON public.import_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_batch_id
  ON public.import_jobs(import_batch_id);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read" ON public.import_jobs;
CREATE POLICY "Authenticated read" ON public.import_jobs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated write" ON public.import_jobs;
CREATE POLICY "Authenticated write" ON public.import_jobs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update" ON public.import_jobs;
CREATE POLICY "Authenticated update" ON public.import_jobs
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.import_jobs;
CREATE POLICY "Service role full access" ON public.import_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage bucket for raw import files
INSERT INTO storage.buckets (id, name, public)
VALUES ('imports', 'imports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow import uploads" ON storage.objects;
CREATE POLICY "Allow import uploads" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'imports');

DROP POLICY IF EXISTS "Allow import reads" ON storage.objects;
CREATE POLICY "Allow import reads" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'imports');
