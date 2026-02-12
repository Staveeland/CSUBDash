-- CSUB Sales Intelligence Platform - Database Schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (synced with auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'seller' CHECK (role IN ('admin', 'seller', 'viewer')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts (from Rystad + scraping)
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT UNIQUE, -- Rystad ID or scrape hash
  date DATE NOT NULL,
  supplier TEXT NOT NULL,
  operator TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT,
  contract_type TEXT CHECK (contract_type IN ('EPCI', 'Subsea', 'SURF', 'SPS', 'Other')),
  region TEXT,
  country TEXT,
  water_depth_m INTEGER,
  estimated_value_usd BIGINT,
  source TEXT CHECK (source IN ('rystad_awards', 'rystad_epc', 'rystad_forecast', 'web_scraping', 'manual', 'email')),
  source_url TEXT,
  
  -- Pipeline phase
  pipeline_phase TEXT DEFAULT 'new' CHECK (pipeline_phase IN ('feed', 'bidding', 'awarded', 'csub_contact', 'csub_award', 'lost', 'archived')),
  
  -- AI analysis
  csub_relevance TEXT DEFAULT 'unknown' CHECK (csub_relevance IN ('high', 'medium', 'low', 'unknown')),
  csub_relevance_score NUMERIC(4,3), -- 0.000 to 1.000
  csub_relevance_reason TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'rejected')),
  handled_by UUID REFERENCES public.users(id),
  handled_at TIMESTAMPTZ,
  
  -- Timestamps
  announced_at DATE, -- When originally announced
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contract notes/comments
CREATE TABLE public.contract_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- News/feed items (from web scraping)
CREATE TABLE public.news_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  source TEXT NOT NULL, -- offshore-energy.biz, worldoil.com, etc.
  published_at TIMESTAMPTZ,
  relevance TEXT DEFAULT 'unknown' CHECK (relevance IN ('high', 'medium', 'low', 'unknown')),
  linked_contract_id UUID REFERENCES public.contracts(id),
  raw_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document uploads (drag & drop from sales team)
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Supabase Storage path
  file_type TEXT,
  file_size_bytes BIGINT,
  ai_summary TEXT,
  linked_contract_id UUID REFERENCES public.contracts(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rystad forecast data
CREATE TABLE public.forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  metric TEXT NOT NULL, -- 'subsea_capex', 'pipeline_km', 'tree_count', etc.
  value NUMERIC,
  unit TEXT,
  source TEXT DEFAULT 'rystad',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, metric)
);

-- Contact log (CSUB contact with installers)
CREATE TABLE public.contact_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  contact_type TEXT CHECK (contact_type IN ('email', 'phone', 'meeting', 'other')),
  contact_with TEXT, -- Company/person contacted
  notes TEXT,
  contacted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraping configuration
CREATE TABLE public.scrape_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  scrape_type TEXT CHECK (scrape_type IN ('rss', 'html', 'api')),
  keywords TEXT[], -- Array of search keywords
  enabled BOOLEAN DEFAULT true,
  last_scraped_at TIMESTAMPTZ,
  scrape_interval_minutes INTEGER DEFAULT 60
);

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL, -- 'status_change', 'contract_update', 'login', etc.
  entity_type TEXT, -- 'contract', 'document', 'news', etc.
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contracts_date ON public.contracts(date DESC);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contracts_relevance ON public.contracts(csub_relevance);
CREATE INDEX idx_contracts_region ON public.contracts(region);
CREATE INDEX idx_contracts_pipeline ON public.contracts(pipeline_phase);
CREATE INDEX idx_contracts_supplier ON public.contracts(supplier);
CREATE INDEX idx_contracts_operator ON public.contracts(operator);
CREATE INDEX idx_news_published ON public.news_items(published_at DESC);
CREATE INDEX idx_news_relevance ON public.news_items(relevance);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_contact_log_contract ON public.contact_log(contract_id);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can read everything
CREATE POLICY "Authenticated read" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.contract_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.news_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.contact_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.users FOR SELECT TO authenticated USING (true);

-- Policies: Authenticated users can insert/update
CREATE POLICY "Authenticated write" ON public.contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON public.contracts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated write" ON public.contract_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.contact_log FOR INSERT TO authenticated WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
