import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const params = request.nextUrl.searchParams
  const search = params.get('search') || ''
  const contractor = params.get('contractor') || ''
  const operator = params.get('operator') || ''
  const country = params.get('country') || ''

  let query = supabase
    .from('projects')
    .select('id, development_project, country, operator, surf_contractor, water_depth_category, xmt_count, surf_km')
    .order('xmt_count', { ascending: false })
    .limit(200)

  if (search) query = query.or(`development_project.ilike.%${search}%,operator.ilike.%${search}%,country.ilike.%${search}%`)
  if (contractor) query = query.eq('surf_contractor', contractor)
  if (operator) query = query.eq('operator', operator)
  if (country) query = query.eq('country', country)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
