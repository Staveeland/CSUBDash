import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { fetchAll } from '@/lib/supabase/fetch-all'

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function buildProjectLookupKey(input: {
  development_project?: string | null
  asset?: string | null
  country?: string | null
}): string {
  return [
    normalizeKeyPart(input.development_project ?? input.asset),
    normalizeKeyPart(input.asset),
    normalizeKeyPart(input.country),
  ].join('|')
}

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
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const [projectsRes, contractsRes, xmtDataRes] = await Promise.all([
      fetchAll(supabase, 'projects', `
          development_project,
          asset,
          country,
          continent,
          operator,
          surf_contractor,
          facility_category,
          water_depth_category,
          xmt_count,
          surf_km,
          first_year,
          last_year,
          created_at
        `),
      fetchAll(supabase, 'contracts', `
          project_name,
          title,
          contract_name,
          description,
          contract_type,
          source,
          country,
          region,
          operator,
          contractor,
          award_date,
          created_at,
          water_depth_m
        `),
      fetchAll(supabase, 'xmt_data', `
          development_project,
          asset,
          country,
          surf_contractor,
          year
        `),
    ])

    if (projectsRes.error) {
      console.error('projects query failed:', projectsRes.error)
    }
    if (contractsRes.error) {
      console.error('contracts query failed:', contractsRes.error)
    }
    if (xmtDataRes.error) {
      console.error('xmt_data query failed:', xmtDataRes.error)
    }

    if (projectsRes.error && contractsRes.error) {
      throw new Error(`Both dashboard queries failed: projects=${projectsRes.error.message} contracts=${contractsRes.error.message}`)
    }

    const xmtProducerByProject = new Map<string, { producer: string; year: number }>()
    const xmtRows = xmtDataRes.error ? [] : (xmtDataRes.data || [])
    for (const row of xmtRows) {
      const producer = typeof row.surf_contractor === 'string' ? row.surf_contractor.trim() : ''
      if (!producer) continue
      const lookupKey = buildProjectLookupKey({
        development_project: row.development_project,
        asset: row.asset,
        country: row.country,
      })
      if (lookupKey === '||') continue
      const rowYear =
        typeof row.year === 'number' && Number.isFinite(row.year)
          ? row.year
          : parseYear(typeof row.year === 'string' ? row.year : null) ?? 0
      const existing = xmtProducerByProject.get(lookupKey)
      if (!existing || rowYear >= existing.year) {
        xmtProducerByProject.set(lookupKey, { producer, year: rowYear })
      }
    }

    const projects = (projectsRes.error ? [] : projectsRes.data || []).map((project) => {
      const firstYear = project.first_year || parseYear(project.created_at)
      const lastYear = project.last_year || firstYear
      const lookupKey = buildProjectLookupKey({
        development_project: project.development_project,
        asset: project.asset,
        country: project.country,
      })
      const xmtProducer = xmtProducerByProject.get(lookupKey)?.producer || project.surf_contractor || ''
      return {
        development_project: project.development_project || project.asset || 'Unknown project',
        asset: project.asset || '',
        country: project.country || 'Unknown',
        continent: project.continent || 'Unknown',
        operator: project.operator || '',
        surf_contractor: project.surf_contractor || '',
        xmt_producer: xmtProducer,
        facility_category: project.facility_category || 'Unknown',
        water_depth_category: project.water_depth_category || 'Unknown',
        xmt_count: project.xmt_count || 0,
        surf_km: project.surf_km || 0,
        first_year: firstYear,
        last_year: lastYear,
        created_at: project.created_at || null,
        data_source: 'project',
      }
    })

    const contracts = (contractsRes.error ? [] : contractsRes.data || []).map((contract) => {
      const contractYear = parseYear(contract.award_date) || parseYear(contract.created_at)
      const projectName = contract.project_name || contract.title || contract.contract_name || contract.description

      return {
        development_project: projectName || contract.contract_type || 'Contract',
        asset: contract.contract_type || 'Contract',
        country: contract.country || 'Unknown',
        continent: contract.region || 'Unknown',
        operator: contract.operator || '',
        surf_contractor: contract.contractor || '',
        xmt_producer: contract.contractor || '',
        facility_category: contract.contract_type || 'Contract',
        water_depth_category: typeof contract.water_depth_m === 'number' ? `${contract.water_depth_m} m` : 'Unknown',
        xmt_count: 0,
        surf_km: 0,
        first_year: contractYear,
        last_year: contractYear,
        award_date: contract.award_date || null,
        created_at: contract.created_at || null,
        source: contract.source || null,
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
