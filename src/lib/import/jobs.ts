import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type ImportJobType = 'excel_rystad' | 'pdf_contract_awards' | 'pdf_market_report'

export type QueuedImportJob = {
  id: string
  file_name: string
  file_type: ImportJobType
  status: 'pending'
  storage_bucket: string
  storage_path: string
  file_size_bytes: number | null
}

export async function queueImportJob(input: {
  fileName: string
  fileType: ImportJobType
  storageBucket: string
  storagePath: string
  fileSizeBytes?: number | null
}): Promise<QueuedImportJob> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('import_jobs')
    .insert({
      file_name: input.fileName,
      file_type: input.fileType,
      status: 'pending',
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      file_size_bytes: input.fileSizeBytes ?? null,
    })
    .select('id, file_name, file_type, status, storage_bucket, storage_path, file_size_bytes')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Could not create import job')
  }

  return data as QueuedImportJob
}

export async function triggerImportProcessor(jobId: string, origin: string): Promise<void> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (serviceRoleKey && supabaseUrl) {
    try {
      const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/process-import-job`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_id: jobId }),
      })

      if (edgeResponse.ok) {
        return
      }

      console.error('Edge worker trigger failed:', edgeResponse.status, await edgeResponse.text())
    } catch (error) {
      console.error('Edge worker trigger error:', error)
    }
  }

  try {
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (process.env.IMPORT_WORKER_SECRET) {
      headers['x-import-secret'] = process.env.IMPORT_WORKER_SECRET
    }

    const localResponse = await fetch(`${origin}/api/import/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id: jobId }),
    })

    if (!localResponse.ok) {
      console.error('Local import processor failed:', localResponse.status, await localResponse.text())
    }
  } catch (error) {
    console.error('Local import processor error:', error)
  }
}
