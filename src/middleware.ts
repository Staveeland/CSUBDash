import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isAllowedEmailDomain } from '@/lib/auth/allowlist'

const AUTH_ENTRY_PATHS = new Set(['/auth/login', '/auth/callback'])
const PUBLIC_PATHS = new Set(['/auth/logout'])
const PUBLIC_API_PATHS = new Set(['/api/import/process'])

function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.has(pathname)
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname)
}

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.has(pathname)
}

function buildRelativePath(request: NextRequest): string {
  const relative = `${request.nextUrl.pathname}${request.nextUrl.search}`
  if (!relative.startsWith('/')) return '/'
  return relative
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith('/api/')

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isPublicApiPath(pathname)) {
    return response
  }

  if (!user) {
    if (isAuthEntryPath(pathname) || isPublicPath(pathname)) {
      return response
    }

    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('next', buildRelativePath(request))
    return NextResponse.redirect(loginUrl)
  }

  if (!isAllowedEmailDomain(user.email)) {
    await supabase.auth.signOut()

    if (isApiRoute) {
      return NextResponse.json({ error: 'Forbidden: domain not allowed' }, { status: 403 })
    }

    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('error', 'domain_not_allowed')
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthEntryPath(pathname)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
