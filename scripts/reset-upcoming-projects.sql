-- Wipe ONLY the forecast dataset used by "Kommende prosjekter".
-- Safe to run in Supabase SQL Editor.
-- This does NOT delete historical contract awards (source = 'rystad_awards').

begin;

delete from public.contracts
where source = 'rystad_forecast';

delete from public.projects;
delete from public.upcoming_awards;
delete from public.xmt_data;
delete from public.surf_data;
delete from public.subsea_unit_data;

commit;

-- Optional verification
select
  (select count(*) from public.projects) as projects_rows,
  (select count(*) from public.upcoming_awards) as upcoming_awards_rows,
  (select count(*) from public.xmt_data) as xmt_rows,
  (select count(*) from public.surf_data) as surf_rows,
  (select count(*) from public.subsea_unit_data) as subsea_rows,
  (select count(*) from public.contracts where source = 'rystad_forecast') as forecast_contract_rows;
