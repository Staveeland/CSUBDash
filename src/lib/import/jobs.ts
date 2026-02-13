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

export async function triggerImportProcessor(jobId: string, _origin?: string): Promise<void> {
  // Import dynamically to avoid circular deps at module load time
  const { processImportJob } = await import('@/lib/import/processors')

  try {
    const result = await processImportJob(jobId)
    console.log(`Import job ${jobId} completed: ${result.recordsImported}/${result.recordsTotal} records`)
  } catch (error) {
    console.error(`Import job ${jobId} failed:`, error)
  }
}
