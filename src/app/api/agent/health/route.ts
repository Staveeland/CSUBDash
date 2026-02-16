import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

type TableHealth = {
  table: string
  count: number | null
  latency_ms: number
  error: string | null
}

export async function GET() {
  const auth = await requireAllowedApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const startedAt = Date.now()

  const tables = [
    'projects',
    'contracts',
    'xmt_data',
    'surf_data',
    'subsea_unit_data',
    'upcoming_awards',
    'forecasts',
    'documents',
    'ai_reports',
  ]

  try {
    const tableHealth: TableHealth[] = await Promise.all(tables.map(async (table) => {
      const t0 = Date.now()
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })

      return {
        table,
        count: error ? null : (count ?? 0),
        latency_ms: Date.now() - t0,
        error: error ? error.message : null,
      }
    }))

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      total_latency_ms: Date.now() - startedAt,
      openai_configured: Boolean(process.env.OPENAI_API_KEY),
      tables: tableHealth,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Agent health check failed',
      },
      { status: 500 }
    )
  }
}
