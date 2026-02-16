import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

interface ReportRow {
  id: string
  title: string
  summary: string | null
  request_text: string
  file_name: string
  storage_bucket: string
  storage_path: string
  created_at: string
}

function toReportRow(input: unknown): ReportRow | null {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
  if (!row) return null

  const id = typeof row.id === 'string' ? row.id : ''
  const title = typeof row.title === 'string' ? row.title : ''
  const fileName = typeof row.file_name === 'string' ? row.file_name : ''
  const storageBucket = typeof row.storage_bucket === 'string' ? row.storage_bucket : ''
  const storagePath = typeof row.storage_path === 'string' ? row.storage_path : ''
  const createdAt = typeof row.created_at === 'string' ? row.created_at : ''

  if (!id || !title || !fileName || !storageBucket || !storagePath || !createdAt) return null

  return {
    id,
    title,
    summary: typeof row.summary === 'string' ? row.summary : null,
    request_text: typeof row.request_text === 'string' ? row.request_text : '',
    file_name: fileName,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    created_at: createdAt,
  }
}

export async function GET() {
  const auth = await requireAllowedApiUser()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ai_reports')
      .select('id, title, summary, request_text, file_name, storage_bucket, storage_path, created_at')
      .eq('created_by', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      // Graceful fallback if migration is not applied yet.
      if (/ai_reports/i.test(error.message) && /does not exist|relation/i.test(error.message)) {
        return NextResponse.json({ reports: [], warning: 'ai_reports table not available yet' })
      }
      throw error
    }

    const rows = Array.isArray(data)
      ? data.map((entry) => toReportRow(entry)).filter((entry): entry is ReportRow => Boolean(entry))
      : []

    const reports = await Promise.all(rows.map(async (row) => {
      const signed = await admin
        .storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, 60 * 60 * 24 * 14)

      return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        request_text: row.request_text,
        file_name: row.file_name,
        created_at: row.created_at,
        download_url: signed.error ? null : signed.data?.signedUrl ?? null,
      }
    }))

    return NextResponse.json({ reports })
  } catch (error) {
    console.error('Agent reports fetch failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}
