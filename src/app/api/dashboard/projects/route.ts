import { NextResponse } from 'next/server'
import { createAdminClient as createClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('first_year', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
