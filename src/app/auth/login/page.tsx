import Image from 'next/image'
import MicrosoftLoginButton from '@/components/MicrosoftLoginButton'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: 'Kontoen din har ikke tilgang til denne losningen.',
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

  return (
    <main className="relative min-h-screen bg-[var(--bg-dark)] text-gray-100 grid place-items-center px-4 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-28 -right-20 h-80 w-80 rounded-full bg-[color:rgba(77,184,158,0.12)] blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[color:rgba(201,168,76,0.1)] blur-3xl" />
      </div>

      <section className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--csub-light-soft)] bg-[color:rgba(14,38,32,0.88)] p-8 md:p-10 shadow-[0_18px_70px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex justify-center">
          <Image
            src="/csub-logo.svg"
            alt="CSUB logo"
            width={220}
            height={60}
            priority
            className="h-10 w-auto"
          />
        </div>
        <h1 className="mt-6 text-center text-2xl text-white">Sales Intelligence Platform</h1>
        <p className="mt-2 text-center text-sm text-[var(--text-muted)]">
          Logg inn med Microsoft 365 for a fa tilgang til dashboardet.
        </p>

        {errorMessage && (
          <div className="mt-5 rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-200 text-center">
            {errorMessage}
          </div>
        )}

        <div className="mt-7 flex justify-center">
          <MicrosoftLoginButton nextPath={nextPath} />
        </div>
      </section>
    </main>
  )
}
