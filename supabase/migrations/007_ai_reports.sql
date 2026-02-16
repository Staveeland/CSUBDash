CREATE TABLE IF NOT EXISTS public.ai_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL,
  created_by_email TEXT NOT NULL,
  request_text TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  report_markdown TEXT NOT NULL,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  period_start DATE,
  period_end DATE,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_bucket TEXT NOT NULL DEFAULT 'imports',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_created_at
  ON public.ai_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reports_created_by
  ON public.ai_reports(created_by, created_at DESC);

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved employee read" ON public.ai_reports;
CREATE POLICY "Approved employee read" ON public.ai_reports
  FOR SELECT TO authenticated USING (public.is_allowed_employee());

DROP POLICY IF EXISTS "Approved employee insert" ON public.ai_reports;
CREATE POLICY "Approved employee insert" ON public.ai_reports
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());

DROP POLICY IF EXISTS "Service role full access" ON public.ai_reports;
CREATE POLICY "Service role full access" ON public.ai_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
