import { NextResponse } from 'next/server'
import { createAdminClient as createClient } from '@/lib/supabase/admin'

function parseYear(value: string | null | undefined): number | null {
  if (!value) return null
  const yearOnly = Number(value)
  if (!Number.isNaN(yearOnly) && yearOnly > 1900 && yearOnly < 2200) return yearOnly
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getUTCFullYear()
}

export async function GET() {
  try {
    const supabase = createClient()

    const [projectsRes, contractsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .order('first_year', { ascending: false })
        .limit(600),
      supabase
        .from('contracts')
        .select('*')
        .order('award_date', { ascending: false })
        .limit(600),
    ])

    if (projectsRes.error) throw projectsRes.error
    if (contractsRes.error) throw contractsRes.error

    const projects = (projectsRes.data || []).map((project) => {
      const firstYear = project.first_year || parseYear(project.created_at)
      const lastYear = project.last_year || firstYear
      return {
        ...project,
        first_year: firstYear,
        last_year: lastYear,
        data_source: 'project',
      }
    })

    const contracts = (contractsRes.data || []).map((contract) => {
      const contractYear = parseYear(contract.award_date) || parseYear(contract.created_at)
      const projectName = contract.project_name || contract.title || contract.contract_name || contract.description

      return {
        development_project: projectName || contract.contract_type || 'Contract',
        asset: contract.asset || contract.contract_type || 'Contract',
        country: contract.country || 'Unknown',
        continent: contract.region || 'Unknown',
        operator: contract.operator || '',
        surf_contractor: contract.contractor || '',
        facility_category: contract.contract_type || 'Contract',
        water_depth_category: contract.water_depth_category || 'Unknown',
        xmt_count: 0,
        surf_km: 0,
        first_year: contractYear,
        last_year: contractYear,
        award_date: contract.award_date || null,
        data_source: 'contract',
      }
    })

    const merged = [...projects, ...contracts].sort((a, b) => {
      const yearA = Number(a.first_year || a.last_year || 0)
      const yearB = Number(b.first_year || b.last_year || 0)
      return yearB - yearA
    })

    return NextResponse.json(merged)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
