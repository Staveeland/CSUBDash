import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const { data: projects } = await supabase.from('projects').select('surf_contractor, operator, development_project')
  const rows = projects ?? []

  // SURF contractors
  const contractorMap: Record<string, Set<string>> = {}
  rows.forEach(r => {
    const k = r.surf_contractor || 'Ukjent'
    if (!contractorMap[k]) contractorMap[k] = new Set()
    contractorMap[k].add(r.development_project)
  })
  const contractors = Object.entries(contractorMap)
    .map(([name, projects]) => ({ name, projectCount: projects.size }))
    .sort((a, b) => b.projectCount - a.projectCount)

  // Operators
  const operatorMap: Record<string, Set<string>> = {}
  rows.forEach(r => {
    const k = r.operator || 'Ukjent'
    if (!operatorMap[k]) operatorMap[k] = new Set()
    operatorMap[k].add(r.development_project)
  })
  const operators = Object.entries(operatorMap)
    .map(([name, projects]) => ({ name, projectCount: projects.size }))
    .sort((a, b) => b.projectCount - a.projectCount)

  return NextResponse.json({ contractors, operators })
}
