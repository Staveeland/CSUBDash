import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { queueImportJob, triggerImportProcessor } from '@/lib/import/jobs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const fileName = body?.file_name as string | undefined
    const storagePath = body?.storage_path as string | undefined
    const storageBucket = (body?.storage_bucket as string | undefined) || 'imports'
    const fileSizeBytes = (body?.file_size_bytes as number | undefined) ?? null

    if (!fileName || !storagePath) {
      return NextResponse.json({ error: 'Missing file_name or storage_path' }, { status: 400 })
    }

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
