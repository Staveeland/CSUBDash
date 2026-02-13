import { getAllowedEmailDomains } from '@/lib/auth/allowlist'
import MicrosoftLoginButton from '@/components/MicrosoftLoginButton'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: 'Tilgang nektet: Kun @csub.com og @workflows.no er tillatt.',
  oauth_exchange_failed: 'Innlogging feilet under verifisering. Prøv igjen.',
  missing_code: 'Manglende autorisasjonskode fra Microsoft. Prøv igjen.',
}

function normalizeNextPath(path: string | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const nextPath = normalizeNextPath(params.next)
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? 'Ukjent innloggingsfeil.' : null
  const allowedDomains = getAllowedEmailDomains().map((domain) => `@${domain}`).join(' eller ')

  return (
    <main className="min-h-screen bg-[var(--bg-dark)] text-gray-100 grid place-items-center px-4">
      <section className="w-full max-w-xl rounded-2xl border border-[var(--csub-light-soft)] bg-[var(--csub-dark)] p-8 shadow-xl">
        <h1 className="text-2xl text-white">CSUB Sales Intelligence</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Logg inn med Microsoft 365 for a fa tilgang til dashboardet.
        </p>
        <p className="mt-1 text-xs text-[var(--csub-light)]">
          Tillatte domener: {allowedDomains}
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="mt-6">
          <MicrosoftLoginButton nextPath={nextPath} />
        </div>
      </section>
    </main>
  )
}
