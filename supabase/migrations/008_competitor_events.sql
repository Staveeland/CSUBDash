CREATE TABLE IF NOT EXISTS public.competitor_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT NOT NULL UNIQUE,
  competitor_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  event_date DATE,
  signal_type TEXT NOT NULL DEFAULT 'other'
    CHECK (signal_type IN ('contract_award', 'tender', 'project_sanction', 'operations', 'partnership', 'corporate', 'other')),
  relevance_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  relevance_reason TEXT,
  ai_summary TEXT,
  importance TEXT NOT NULL DEFAULT 'low'
    CHECK (importance IN ('high', 'medium', 'low')),
  is_upcoming BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] NOT NULL DEFAULT '{}',
  raw_payload JSONB,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_events_published
  ON public.competitor_events(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_events_upcoming
  ON public.competitor_events(is_upcoming, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_events_company
  ON public.competitor_events(competitor_name, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_events_importance
  ON public.competitor_events(importance, relevance_score DESC);

DROP TRIGGER IF EXISTS competitor_events_updated_at ON public.competitor_events;
CREATE TRIGGER competitor_events_updated_at
  BEFORE UPDATE ON public.competitor_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.competitor_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved employee read" ON public.competitor_events;
CREATE POLICY "Approved employee read" ON public.competitor_events
  FOR SELECT TO authenticated USING (public.is_allowed_employee());

DROP POLICY IF EXISTS "Approved employee insert" ON public.competitor_events;
CREATE POLICY "Approved employee insert" ON public.competitor_events
  FOR INSERT TO authenticated WITH CHECK (public.is_allowed_employee());

DROP POLICY IF EXISTS "Approved employee update" ON public.competitor_events;
CREATE POLICY "Approved employee update" ON public.competitor_events
  FOR UPDATE TO authenticated USING (public.is_allowed_employee()) WITH CHECK (public.is_allowed_employee());

DROP POLICY IF EXISTS "Service role full access" ON public.competitor_events;
CREATE POLICY "Service role full access" ON public.competitor_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
