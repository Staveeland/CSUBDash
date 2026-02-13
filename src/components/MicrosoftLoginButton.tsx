'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function normalizeNextPath(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}

export default function MicrosoftLoginButton({ nextPath }: { nextPath?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetPath = useMemo(() => normalizeNextPath(nextPath), [nextPath])

  const signIn = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (targetPath !== '/') {
      callbackUrl.searchParams.set('next', targetPath)
    }

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: 'select_account',
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="w-full rounded-lg bg-[var(--csub-light)] text-[var(--csub-dark)] font-semibold px-4 py-3 hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed transition cursor-pointer"
      >
        {loading ? 'Sender deg til Microsoft...' : 'Logg inn med Microsoft 365'}
      </button>
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </div>
  )
}
