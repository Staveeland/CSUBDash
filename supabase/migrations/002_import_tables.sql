-- Projects (deduplicated from Excel — one row per unique development project)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  development_project TEXT NOT NULL,
  asset TEXT,
  country TEXT,
  continent TEXT,
  operator TEXT,
  surf_contractor TEXT,
  facility_category TEXT,
  field_type TEXT,
  water_depth_category TEXT,
  field_size_category TEXT,
  xmt_count INTEGER DEFAULT 0,
  surf_km NUMERIC DEFAULT 0,
  subsea_unit_count INTEGER DEFAULT 0,
  first_year INTEGER,
  last_year INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(development_project, asset, country)
);

CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('excel_rystad', 'pdf_contract_awards')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  records_total INTEGER DEFAULT 0,
  records_imported INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.xmt_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_batch_id UUID REFERENCES public.import_batches(id),
  year INTEGER,
  continent TEXT,
  country TEXT,
  development_project TEXT,
  asset TEXT,
  operator TEXT,
  surf_contractor TEXT,
  facility_category TEXT,
  field_type TEXT,
  water_depth_category TEXT,
  distance_group TEXT,
  contract_award_year INTEGER,
  contract_type TEXT,
  purpose TEXT,
  state TEXT,
  xmt_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, development_project, asset, purpose, state)
);

CREATE TABLE public.surf_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_batch_id UUID REFERENCES public.import_batches(id),
  year INTEGER,
  continent TEXT,
  country TEXT,
  development_project TEXT,
  asset TEXT,
  operator TEXT,
  surf_contractor TEXT,
  facility_category TEXT,
  field_type TEXT,
  water_depth_category TEXT,
  distance_group TEXT,
  design_category TEXT,
  line_group TEXT,
  km_surf_lines NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, development_project, asset, design_category, line_group)
);

CREATE TABLE public.subsea_unit_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_batch_id UUID REFERENCES public.import_batches(id),
  year INTEGER,
  continent TEXT,
  country TEXT,
  development_project TEXT,
  asset TEXT,
  operator TEXT,
  surf_contractor TEXT,
  facility_category TEXT,
  field_type TEXT,
  water_depth_category TEXT,
  distance_group TEXT,
  unit_category TEXT,
  unit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, development_project, asset, unit_category)
);

CREATE TABLE public.upcoming_awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_batch_id UUID REFERENCES public.import_batches(id),
  year INTEGER,
  country TEXT,
  development_project TEXT,
  asset TEXT,
  operator TEXT,
  surf_contractor TEXT,
  facility_category TEXT,
  field_size_category TEXT,
  field_type TEXT,
  water_depth_category TEXT,
  xmts_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, development_project, asset)
);

-- Indexes
CREATE INDEX idx_xmt_year ON public.xmt_data(year);
CREATE INDEX idx_xmt_project ON public.xmt_data(development_project);
CREATE INDEX idx_xmt_operator ON public.xmt_data(operator);
CREATE INDEX idx_surf_year ON public.surf_data(year);
CREATE INDEX idx_surf_project ON public.surf_data(development_project);
CREATE INDEX idx_subsea_year ON public.subsea_unit_data(year);
CREATE INDEX idx_upcoming_year ON public.upcoming_awards(year);
CREATE INDEX idx_projects_country ON public.projects(country);
CREATE INDEX idx_projects_operator ON public.projects(operator);
CREATE INDEX idx_import_batches_status ON public.import_batches(status);

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xmt_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surf_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsea_unit_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upcoming_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.xmt_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.surf_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.subsea_unit_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.upcoming_awards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON public.projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated write" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON public.import_batches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated write" ON public.xmt_data FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.surf_data FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.subsea_unit_data FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.upcoming_awards FOR INSERT TO authenticated WITH CHECK (true);

-- Service role policies (for API routes)
CREATE POLICY "Service role full access" ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.import_batches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.xmt_data FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.surf_data FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.subsea_unit_data FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.upcoming_awards FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
