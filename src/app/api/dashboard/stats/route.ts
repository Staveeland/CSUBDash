import { NextResponse } from 'next/server'
import { createAdminClient as createClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createClient()

    const [projectsRes, contractsRes] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('contracts').select('*'),
    ])

    const projects = projectsRes.data || []
    const contracts = contractsRes.data || []

    const totalProjects = projects.length + contracts.length
    const totalSurfKm = Math.round(projects.reduce((s, p) => s + (p.surf_km || 0), 0))
    const totalXmts = Math.round(projects.reduce((s, p) => s + (p.xmt_count || 0), 0))

    const regions = new Set<string>()
    projects.forEach(p => { if (p.continent) regions.add(p.continent) })
    contracts.forEach(c => { if (c.region) regions.add(c.region) })

    // New in last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recent = contracts.filter(c => {
      const d = c.created_at || c.award_date
      return d && new Date(d) >= thirtyDaysAgo
    }).length

    return NextResponse.json({
      totalProjects,
      totalSurfKm,
      totalXmts,
      upcomingAwards: recent,
      regionCount: regions.size,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
