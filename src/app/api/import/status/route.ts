import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
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
    .limit(40)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
