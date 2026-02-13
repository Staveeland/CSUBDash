import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmailDomain } from '@/lib/auth/allowlist'

type AuthSuccess = {
  ok: true
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
}

type AuthFailure = {
  ok: false
  response: NextResponse
}

export type RouteAuthResult = AuthSuccess | AuthFailure

export async function requireAllowedApiUser(): Promise<RouteAuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized access' }, { status: 401 }),
    }
  }

  if (!isAllowedEmailDomain(user.email)) {
    await supabase.auth.signOut()
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: user domain is not allowed' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    supabase,
    user,
  }
}
