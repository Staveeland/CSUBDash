import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

function parseStorageLocation(filePath: string | null | undefined): { bucket: string; objectPath: string } | null {
  if (!filePath) return null
  const normalized = filePath.replace(/^\/+/, '')
  const slashIndex = normalized.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = normalized.slice(0, slashIndex)
  const objectPath = normalized.slice(slashIndex + 1)
  if (!bucket || !objectPath) return null

  return { bucket, objectPath }
}

export async function GET() {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const [reportsRes, forecastsRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id, file_name, file_path, ai_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('forecasts')
        .select('year, metric, value, unit')
        .order('year', { ascending: true }),
    ])

    if (reportsRes.error) throw reportsRes.error
    if (forecastsRes.error) throw forecastsRes.error

    const reports = await Promise.all(
      (reportsRes.data || []).map(async (report) => {
        const storage = parseStorageLocation(report.file_path)
        let downloadUrl: string | null = null

        if (storage) {
          const signed = await supabase
            .storage
            .from(storage.bucket)
            .createSignedUrl(storage.objectPath, 60 * 60)

          if (!signed.error) {
            downloadUrl = signed.data?.signedUrl ?? null
          }
        }

        const reportPeriodMatch = report.ai_summary?.match(/^##\s+(.+)$/m)

        return {
          ...report,
          report_period: reportPeriodMatch?.[1]?.trim() ?? null,
          download_url: downloadUrl,
        }
      })
    )

    return NextResponse.json({
      reports,
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response

    const payload = await request.json().catch(() => ({}))
    const reportId = typeof payload?.report_id === 'string' ? payload.report_id.trim() : ''

    if (!reportId || !isUuid(reportId)) {
      return NextResponse.json({ error: 'Invalid report_id' }, { status: 400 })
    }

    const admin = createAdminClient()
    const reportRes = await admin
      .from('documents')
      .select('id, file_path, file_name')
      .eq('id', reportId)
      .maybeSingle()

    if (reportRes.error) throw reportRes.error
    if (!reportRes.data) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const storage = parseStorageLocation(reportRes.data.file_path)
    if (storage) {
      const storageDelete = await admin
        .storage
        .from(storage.bucket)
        .remove([storage.objectPath])

      if (storageDelete.error) {
        console.warn('Could not remove report file from storage:', storageDelete.error.message)
      }
    }

    const deleteRes = await admin
      .from('documents')
      .delete()
      .eq('id', reportId)

    if (deleteRes.error) throw deleteRes.error

    return NextResponse.json({ success: true, id: reportId })
  } catch (error) {
    console.error('Delete report API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete report' },
      { status: 500 }
    )
  }
}
