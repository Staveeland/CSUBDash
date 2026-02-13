import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { queueImportJob, triggerImportProcessor, type ImportJobType } from '@/lib/import/jobs'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { validateQueuedUploadInput } from '@/lib/import/validate-upload'

/**
 * Auto-detect PDF type and enqueue the correct processor.
 * - "OFS Contract" / "Contract Updates" => pdf_contract_awards
 * - "Subsea Market Report" / "Market Report" => pdf_market_report
 */
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
