import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'

export async function GET(request: Request) {
  const auth = await requireAllowedApiUser()
  if (!auth.ok) return auth.response

  const supabase = auth.supabase
  const url = new URL(request.url)
  const jobId = url.searchParams.get('job_id')?.trim() || null

  let query = supabase
    .from('import_jobs')
    .select(`
      id,
      file_name,
      file_type,
      status,
      records_total,
      records_imported,
      records_skipped,
      error_message,
      created_at,
      completed_at,
      import_batch_id
    `)
    .order('created_at', { ascending: false })

  if (jobId) {
    query = query.eq('id', jobId).limit(1)
  } else {
    query = query.limit(40)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
