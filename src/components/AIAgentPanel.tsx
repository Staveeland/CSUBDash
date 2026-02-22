'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  report: {
    id: string | null
    title: string
    fileName: string
    storagePath: string
    downloadUrl: string
    createdAt: string
  } | null
  followUps: string[]
}

type SavedReport = {
  id: string
  title: string
  summary: string | null
  request_text: string
  file_name: string
  created_at: string
  download_url: string | null
}

type AgentApiResponse = {
  answer?: unknown
  report?: {
    id?: unknown
    title?: unknown
    fileName?: unknown
    storagePath?: unknown
    downloadUrl?: unknown
    createdAt?: unknown
  } | null
  followUps?: unknown
  dataCoverage?: {
    warnings?: unknown
  }
  error?: unknown
}

type ThinkingMode = 'chat' | 'report'

type ThinkingState = {
  mode: ThinkingMode
  focusText: string
}

const QUICK_PROMPTS = [
  'Lag en rapport for prosjektet Johan Sverdrup for 2024-2026 som PDF.',
  'Gi meg en årsrapport for alle prosjekter i 2025 med topp operatører.',
  'Hvilke land og operatører har høyest XMT-volum i databasen?',
]

const GLOBE_NODE_YELLOW = '#ffd57a'
const GLOBE_NODE_YELLOW_ACTIVE = '#ffe8b3'

const THINKING_STEPS: Record<ThinkingMode, string[]> = {
  chat: [
    'Tolker spørsmålet og finner riktig analysemodus.',
    'Henter relevante datapunkter fra CSUB-databasen.',
    'Kryssjekker datadekning og validerer nøkkeltall.',
    'Formulerer svar og forbereder oppfølgingsforslag.',
  ],
  report: [
    'Tolker rapportforespørselen og avgrenser omfang.',
    'Henter relevante prosjekter, land og operatører.',
    'Bygger struktur for innsikt, funn og nøkkeltall.',
    'Genererer rapportinnhold og ferdigstiller svaret.',
  ],
}

const THINKING_DETAILS: Record<ThinkingMode, string[]> = {
  chat: [
    'Kalibrerer forespørselen mot historikken i denne samtalen.',
    'Prioriterer de mest relevante datasettene først.',
    'Vekter tallgrunnlag mot datadekning før svar.',
    'Sikrer at svaret holder samme kontekst som spørsmålet.',
  ],
  report: [
    'Bygger en disposisjon som passer rapportformatet.',
    'Samler datapunkter som kan inngå i PDF-rapporten.',
    'Syntetiserer funn til korte, tydelige konklusjoner.',
    'Klargjør innholdet for videre eksport og deling.',
  ],
}

function isoNow(): string {
  return new Date().toISOString()
}

function toDateText(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 4)
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function detectThinkingMode(value: string): ThinkingMode {
  const normalized = value.toLowerCase()
  if (
    normalized.includes('rapport') ||
    normalized.includes('årsrapport') ||
    normalized.includes('pdf') ||
    normalized.includes('report')
  ) {
    return 'report'
  }
  return 'chat'
}

function toThinkingFocus(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'CSUB-datagrunnlaget'
  if (normalized.length <= 90) return normalized
  return `${normalized.slice(0, 87)}...`
}

export default function AIAgentPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId('assistant'),
      role: 'assistant',
      content: 'Jeg er CSUB AI Agent. Jeg kan søke i databasen, svare på spørsmål og lage skreddersydde PDF-rapporter basert på forespørselen din.',
      createdAt: isoNow(),
      report: null,
      followUps: [],
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkingState, setThinkingState] = useState<ThinkingState | null>(null)
  const [thinkingElapsedSeconds, setThinkingElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)

  const conversationPayload = useMemo(
    () => messages.map((message) => ({ role: message.role, content: message.content })),
    [messages]
  )

  useEffect(() => {
    if (!open) return
    const target = listRef.current
    if (!target) return
    target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  useEffect(() => {
    if (!sending || !thinkingState) return
    const timer = window.setInterval(() => {
      setThinkingElapsedSeconds((current) => current + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [sending, thinkingState])

  const thinkingSteps = useMemo(
    () => (thinkingState ? THINKING_STEPS[thinkingState.mode] : []),
    [thinkingState]
  )

  const thinkingDetails = useMemo(
    () => (thinkingState ? THINKING_DETAILS[thinkingState.mode] : []),
    [thinkingState]
  )

  const activeThinkingStepIndex = thinkingSteps.length > 0
    ? Math.floor(thinkingElapsedSeconds / 2) % thinkingSteps.length
    : 0
  const activeThinkingStep = thinkingSteps[activeThinkingStepIndex] ?? null
  const nextThinkingStep = thinkingSteps.length > 1
    ? thinkingSteps[(activeThinkingStepIndex + 1) % thinkingSteps.length]
    : null
  const activeThinkingDetail = thinkingDetails.length > 0
    ? thinkingDetails[Math.floor(thinkingElapsedSeconds / 3) % thinkingDetails.length]
    : null
  const thinkingSweep = thinkingSteps.length > 0
    ? Math.floor(thinkingElapsedSeconds / Math.max(2, thinkingSteps.length * 2)) + 1
    : 1
  const thinkingSuffix = '.'.repeat((thinkingElapsedSeconds % 3) + 1)

  const sendPrompt = useCallback(async (promptText: string, isFollowUp = false) => {
    const content = promptText.trim()
    if (!content || sending) return

    setOpen(true)

    // Follow-ups are AI suggestions the user accepted — frame them as such
    const displayContent = isFollowUp ? content : content
    const apiContent = isFollowUp
      ? `Brukeren valgte dette oppfølgingsforslaget fra AI-agenten: "${content}". Gi et fullstendig og detaljert svar.`
      : content

    const userMessage: ChatMessage = {
      id: makeId('user'),
      role: 'user',
      content: displayContent,
      createdAt: isoNow(),
      report: null,
      followUps: [],
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setSending(true)
    setThinkingState({
      mode: detectThinkingMode(content),
      focusText: toThinkingFocus(content),
    })
    setThinkingElapsedSeconds(0)
    setError(null)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...conversationPayload, { role: 'user', content: apiContent }].slice(-20),
        }),
      })

      const payload = await response.json().catch(() => ({})) as AgentApiResponse

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : `Agent API failed (${response.status})`)
      }

      const answer = normalizeString(payload.answer, 'Kunne ikke generere svar akkurat nå.')
      const report = payload.report
        ? {
          id: normalizeString(payload.report.id) || null,
          title: normalizeString(payload.report.title, 'AI report'),
          fileName: normalizeString(payload.report.fileName, 'report.pdf'),
          storagePath: normalizeString(payload.report.storagePath),
          downloadUrl: normalizeString(payload.report.downloadUrl),
          createdAt: normalizeString(payload.report.createdAt, isoNow()),
        }
        : null

      const assistantMessage: ChatMessage = {
        id: makeId('assistant'),
        role: 'assistant',
        content: answer,
        createdAt: isoNow(),
        report,
        followUps: normalizeStringArray(payload.followUps),
      }

      setMessages((current) => [...current, assistantMessage])

      const warnings = normalizeStringArray(payload.dataCoverage?.warnings)
      if (warnings.length > 0) {
        setMessages((current) => [
          ...current,
          {
            id: makeId('assistant-warning'),
            role: 'assistant',
            content: `Datamerknad: ${warnings.join(' | ')}`,
            createdAt: isoNow(),
            report: null,
            followUps: [],
          },
        ])
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError)
      setError(message)
      setMessages((current) => [
        ...current,
        {
          id: makeId('assistant-error'),
          role: 'assistant',
          content: `Feil: ${message}`,
          createdAt: isoNow(),
          report: null,
          followUps: [],
        },
      ])
    } finally {
      setSending(false)
      setThinkingState(null)
      setThinkingElapsedSeconds(0)
    }
  }, [conversationPayload, sending])

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendPrompt(input)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[260] flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <section
          className="pointer-events-auto w-[min(460px,calc(100vw-1rem))] h-[min(82vh,760px)] bg-[var(--csub-dark)] rounded-xl border flex flex-col overflow-hidden"
          style={{
            borderColor: GLOBE_NODE_YELLOW,
            boxShadow: '0 18px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,232,179,0.2)',
          }}
        >
          <div
            className="px-4 py-3 border-b bg-[color:rgba(10,23,20,0.9)] flex items-start justify-between gap-3"
            style={{ borderColor: 'rgba(255, 213, 122, 0.4)' }}
          >
            <div>
              <h2 className="text-sm text-white">CSUB AI Agent</h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Databasesok, analyser og PDF-rapporter</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]"
                style={{
                  borderColor: sending ? 'rgba(255, 213, 122, 0.55)' : 'var(--csub-light-soft)',
                  color: sending ? GLOBE_NODE_YELLOW_ACTIVE : 'var(--text-muted)',
                  backgroundColor: sending ? 'rgba(255, 213, 122, 0.08)' : 'rgba(10,23,20,0.45)',
                }}
              >
                {sending && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffe8b3] opacity-80" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ffd57a]" />
                  </span>
                )}
                {sending ? 'AI jobber' : 'Klar'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs rounded-md border px-2 py-1 text-[var(--text-muted)] hover:text-white cursor-pointer"
                style={{ borderColor: 'rgba(255, 213, 122, 0.45)' }}
              >
                Lukk
              </button>
            </div>
          </div>

          <div
            className="px-3 py-2 border-b grid grid-cols-1 gap-1.5"
            style={{ borderColor: 'rgba(255, 213, 122, 0.18)' }}
          >
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendPrompt(prompt)}
                disabled={sending}
                className="text-left rounded-md border bg-[color:rgba(10,23,20,0.45)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'rgba(255, 213, 122, 0.22)' }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 px-3 py-3 flex flex-col gap-3">
            <div
              ref={listRef}
              className="rounded-lg border bg-[color:rgba(10,23,20,0.35)] p-2.5 flex-1 overflow-y-auto"
              style={{ borderColor: 'rgba(255, 213, 122, 0.2)' }}
            >
              <div className="space-y-2.5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border px-2.5 py-2 ${message.role === 'user'
                      ? 'border-[var(--csub-gold-soft)] bg-[color:rgba(228,160,16,0.13)]'
                      : 'border-[var(--csub-light-soft)] bg-[color:rgba(77,184,158,0.09)]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] uppercase tracking-wider ${message.role === 'user' ? 'text-[var(--csub-gold)]' : 'text-[var(--csub-light)]'}`}>
                        {message.role === 'user' ? 'Deg' : 'AI Agent'}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">{toDateText(message.createdAt)}</span>
                    </div>

                    <p className="text-xs text-white whitespace-pre-wrap leading-relaxed mt-1">{message.content}</p>

                    {message.report?.downloadUrl && (
                      <div className="mt-2 rounded-md border border-[var(--csub-gold-soft)] bg-[color:rgba(10,23,20,0.5)] px-2 py-1.5">
                        <p className="text-[11px] text-[var(--csub-gold)]">PDF rapport generert</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{message.report.title}</p>
                        <a
                          href={message.report.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block mt-1.5 text-[11px] text-white rounded border border-[var(--csub-light-soft)] px-2 py-1 hover:border-[var(--csub-light)]"
                        >
                          Åpne PDF
                        </a>
                      </div>
                    )}

                    {message.followUps.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.followUps.map((followUp) => (
                          <button
                            key={`${message.id}-${followUp}`}
                            type="button"
                            onClick={() => void sendPrompt(followUp, true)}
                            className="text-[10px] rounded-md border border-[var(--csub-light-soft)] px-2 py-1 text-[var(--text-muted)] hover:text-white hover:border-[var(--csub-light)] cursor-pointer"
                          >
                            {followUp}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {sending && (
                  <div
                    className="rounded-lg border px-2.5 py-2.5 text-xs"
                    style={{
                      borderColor: GLOBE_NODE_YELLOW,
                      background: 'linear-gradient(135deg, rgba(255, 213, 122, 0.12), rgba(10, 23, 20, 0.62))',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffe8b3] opacity-85" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ffd57a]" />
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-[#ffd57a]">LLM tenker{thinkingSuffix}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">{thinkingElapsedSeconds}s</span>
                    </div>

                    {thinkingState && (
                      <p className="mt-1 text-[11px] leading-snug text-white">
                        Fokus: <span style={{ color: GLOBE_NODE_YELLOW_ACTIVE }}>{thinkingState.focusText}</span>
                      </p>
                    )}
                    {activeThinkingStep && (
                      <p className="mt-1 text-[11px] leading-snug text-white/95">
                        Nå: {activeThinkingStep}
                      </p>
                    )}
                    {activeThinkingDetail && (
                      <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]">
                        Detalj: {activeThinkingDetail}
                      </p>
                    )}

                    <div className="mt-2 rounded-md border border-[rgba(255,213,122,0.28)] bg-[rgba(10,23,20,0.45)] px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Arbeidssyklus #{thinkingSweep}
                      </div>
                      {activeThinkingStep && (
                        <div className="mt-1 flex items-start gap-1.5">
                          <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-[#ffe8b3] animate-pulse" />
                          <p className="text-[10px] leading-snug text-white/95">Aktiv nå: {activeThinkingStep}</p>
                        </div>
                      )}
                      {nextThinkingStep && (
                        <div className="mt-1 flex items-start gap-1.5">
                          <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full border border-[rgba(255,213,122,0.75)]" />
                          <p className="text-[10px] leading-snug text-[var(--text-muted)]">Neste: {nextThinkingStep}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={3}
                placeholder="Spør om alt i databasen, eller be om en skreddersydd PDF-rapport..."
                className="w-full rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-2.5 py-2 text-xs text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--csub-gold)] resize-y"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--text-muted)]">Svar baseres kun på data som finnes.</span>
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="rounded-md border border-[var(--csub-light-soft)] bg-[color:rgba(77,184,158,0.14)] px-2.5 py-1.5 text-[11px] text-white hover:border-[var(--csub-light)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {sending ? 'AI jobber...' : 'Send'}
                </button>
              </div>
              {error && <p className="text-[11px] text-red-300">{error}</p>}
            </form>

          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto rounded-full border bg-[color:rgba(10,23,20,0.95)] px-4 py-3 text-xs text-white shadow-[0_12px_24px_rgba(0,0,0,0.45)] transition-colors cursor-pointer"
        style={{ borderColor: GLOBE_NODE_YELLOW }}
      >
        {open ? 'Skjul AI Agent' : 'AI Agent'}
      </button>
    </div>
  )
}
