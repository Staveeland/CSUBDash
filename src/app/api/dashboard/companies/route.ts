import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { fetchAll } from '@/lib/supabase/fetch-all'

export async function GET() {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const [projectsRes, contractsRes] = await Promise.all([
      fetchAll(supabase, 'projects', 'surf_contractor, operator'),
      fetchAll(supabase, 'contracts', 'contractor, operator'),
    ])

    if (projectsRes.error) throw projectsRes.error
    if (contractsRes.error) throw contractsRes.error

    const projects = projectsRes.data || []
    const contracts = contractsRes.data || []

    // Contractors (installasjonsselskaper)
    const contractorMap = new Map<string, number>()
    projects.forEach(p => { if (p.surf_contractor) contractorMap.set(p.surf_contractor, (contractorMap.get(p.surf_contractor) || 0) + 1) })
    contracts.forEach(c => { if (c.contractor) contractorMap.set(c.contractor, (contractorMap.get(c.contractor) || 0) + 1) })
    const contractors = Array.from(contractorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    // Operators
    const operatorMap = new Map<string, number>()
    projects.forEach(p => { if (p.operator) operatorMap.set(p.operator, (operatorMap.get(p.operator) || 0) + 1) })
    contracts.forEach(c => { if (c.operator) operatorMap.set(c.operator, (operatorMap.get(c.operator) || 0) + 1) })
    const operators = Array.from(operatorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ contractors, operators })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
