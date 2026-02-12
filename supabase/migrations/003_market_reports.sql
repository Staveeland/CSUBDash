-- Allow 'pdf_market_report' in import_batches file_type
ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_file_type_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_file_type_check
  CHECK (file_type IN ('excel_rystad', 'pdf_contract_awards', 'pdf_market_report'));

-- Allow 'rystad_report' as forecast source
ALTER TABLE public.forecasts DROP CONSTRAINT IF EXISTS forecasts_source_check;
-- No constraint existed on forecasts.source, so this is just documentation.

-- Add index for document dedup by file_name
CREATE INDEX IF NOT EXISTS idx_documents_file_name ON public.documents(file_name);
