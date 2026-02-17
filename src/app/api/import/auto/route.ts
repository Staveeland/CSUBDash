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
    const isContractAwards =
      name.includes('contract update') ||
      name.includes('contract award') ||
      name.includes('oilfield service contract') ||
      name.includes('ofs contract') ||
      name.includes('contract overview') ||
      name.includes('award update') ||
      name.includes('leverandør') ||
      name.includes('kontrakt')

    const isMarketReport =
      name.includes('market report') ||
      name.includes('subsea market') ||
      name.includes('quarterly report') ||
      name.includes('market update') ||
      name.includes('market outlook') ||
      // "report" + quarter indicator (Q1, Q2, 1Q, 2Q, etc.)
      (name.includes('report') && /[1-4]q|q[1-4]/i.test(name))

    if (isContractAwards) {
      fileType = 'pdf_contract_awards'
    } else if (isMarketReport) {
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
