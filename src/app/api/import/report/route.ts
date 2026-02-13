import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { queueImportJob, triggerImportProcessor } from '@/lib/import/jobs'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { validateQueuedUploadInput } from '@/lib/import/validate-upload'

export async function POST(request: NextRequest) {
  const auth = await requireAllowedApiUser()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const validation = validateQueuedUploadInput(body ?? {}, {
      allowedExtensions: ['.pdf'],
      maxBytes: 25 * 1024 * 1024,
    })

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    const { fileName, storagePath, storageBucket, fileSizeBytes } = validation.normalized

    const job = await queueImportJob({
      fileName,
      fileType: 'pdf_market_report',
      storageBucket,
      storagePath,
      fileSizeBytes,
    })

    after(async () => {
      await triggerImportProcessor(job.id, request.nextUrl.origin)
    })

    return NextResponse.json({ success: true, job_id: job.id, status: job.status })
  } catch (error) {
    console.error('Report import queue error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
