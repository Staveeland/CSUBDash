-- Allow server-side anon client (SSR without Supabase auth session) to read dashboard data
DROP POLICY IF EXISTS "Anon read projects" ON public.projects;
CREATE POLICY "Anon read projects" ON public.projects
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon read upcoming awards" ON public.upcoming_awards;
CREATE POLICY "Anon read upcoming awards" ON public.upcoming_awards
  FOR SELECT TO anon USING (true);
