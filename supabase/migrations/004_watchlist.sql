-- Watchlist table for tracking projects and contracts
CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_identifier TEXT NOT NULL, -- session-based identifier (no auth required)
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'contract')),
  entity_id UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchlist_user ON public.watchlist(user_identifier);
CREATE INDEX idx_watchlist_entity ON public.watchlist(entity_type, entity_id);
CREATE UNIQUE INDEX idx_watchlist_unique ON public.watchlist(user_identifier, entity_type, entity_id);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.watchlist FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read" ON public.watchlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write" ON public.watchlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete" ON public.watchlist FOR DELETE TO authenticated USING (true);

-- Allow async import status tracking
ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_file_type_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_file_type_check
  CHECK (file_type IN ('excel_rystad', 'pdf_contract_awards', 'pdf_market_report', 'async_upload'));

-- Add storage_path to import_batches for async flow
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS storage_path TEXT;
