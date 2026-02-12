import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { userIdentifier, entityType, entityId } = body
  if (!userIdentifier || !entityType || !entityId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('watchlist').upsert(
    { user_identifier: userIdentifier, entity_type: entityType, entity_id: entityId },
    { onConflict: 'user_identifier,entity_type,entity_id' }
  ).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  const user = request.nextUrl.searchParams.get('user')
  if (!id || !user) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('watchlist').delete().eq('id', id).eq('user_identifier', user)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
