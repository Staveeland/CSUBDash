import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { queueImportJob, triggerImportProcessor, type ImportJobType } from '@/lib/import/jobs'

/**
 * Auto-detect PDF type and enqueue the correct processor.
 * - "OFS Contract" / "Contract Updates" => pdf_contract_awards
 * - "Subsea Market Report" / "Market Report" => pdf_market_report
 */
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

    const name = fileName.toLowerCase()

    let fileType: ImportJobType
    if (name.includes('market report') || name.includes('subsea market')) {
      fileType = 'pdf_market_report'
    } else {
      fileType = 'pdf_contract_awards'
    }

    const job = await queueImportJob({
      fileName,
      fileType,
      storageBucket,
      storagePath,
      fileSizeBytes,
    })

    after(async () => {
      await triggerImportProcessor(job.id, request.nextUrl.origin)
    })

    return NextResponse.json({
      success: true,
      job_id: job.id,
      status: job.status,
      detected_type: fileType,
    })
  } catch (error) {
    console.error('Auto-detect error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
