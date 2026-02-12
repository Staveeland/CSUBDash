import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const [projectsRes, upcomingRes, xmtRes, surfRes] = await Promise.all([
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('upcoming_awards').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('xmt_count'),
    supabase.from('projects').select('surf_km'),
  ])

  const totalProjects = projectsRes.count ?? 0
  const upcomingAwards = upcomingRes.count ?? 0
  const totalXmts = (xmtRes.data ?? []).reduce((sum, r) => sum + (r.xmt_count ?? 0), 0)
  const totalSurfKm = (surfRes.data ?? []).reduce((sum, r) => sum + (r.surf_km ?? 0), 0)

  return NextResponse.json({ totalProjects, upcomingAwards, totalXmts, totalSurfKm: Math.round(totalSurfKm * 10) / 10 })
}
