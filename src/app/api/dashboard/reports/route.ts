import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'

export async function GET() {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const [reportsRes, forecastsRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id, file_name, ai_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('forecasts')
        .select('year, metric, value, unit')
        .order('year', { ascending: true }),
    ])

    if (reportsRes.error) throw reportsRes.error
    if (forecastsRes.error) throw forecastsRes.error

    return NextResponse.json({
      reports: reportsRes.data || [],
      forecasts: forecastsRes.data || [],
    })
  } catch (error) {
    console.error('Reports API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}
