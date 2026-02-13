import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmailDomain } from '@/lib/auth/allowlist'

function normalizeNextPath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextPath = normalizeNextPath(requestUrl.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', request.url))
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth_exchange_failed', request.url))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isAllowedEmailDomain(user.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/auth/login?error=domain_not_allowed', request.url))
  }

  return NextResponse.redirect(new URL(nextPath, request.url))
}
