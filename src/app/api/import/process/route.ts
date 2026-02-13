import { NextRequest, NextResponse } from 'next/server'
import { processImportJob } from '@/lib/import/processors'
import { requireAllowedApiUser } from '@/lib/auth/require-user'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.IMPORT_WORKER_SECRET
  const providedSecret = request.headers.get('x-import-secret')
  const isTrustedWorkerRequest = Boolean(expectedSecret && providedSecret === expectedSecret)

  if (!isTrustedWorkerRequest) {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
  }

  try {
    const body = await request.json()
    const jobId = body?.job_id as string | undefined

    if (!jobId) {
      return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
    }

    const result = await processImportJob(jobId)
    return NextResponse.json({ success: true, job_id: jobId, ...result })
  } catch (error) {
    console.error('Import processor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
