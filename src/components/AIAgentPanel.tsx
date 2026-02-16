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

const QUICK_PROMPTS = [
  'Lag en rapport for prosjektet Johan Sverdrup for 2024-2026 som PDF.',
  'Gi meg en årsrapport for alle prosjekter i 2025 med topp operatører.',
  'Hvilke land og operatører har høyest XMT-volum i databasen?',
]

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
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
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

  const loadReportHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await fetch('/api/agent/reports', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { reports?: unknown; error?: unknown }

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : `Report API failed (${response.status})`)
      }

      const reports = Array.isArray(payload.reports)
        ? payload.reports
          .map((entry) => {
            const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
            if (!row) return null

            const id = normalizeString(row.id)
            const title = normalizeString(row.title)
            const fileName = normalizeString(row.file_name)
            const createdAt = normalizeString(row.created_at)
            if (!id || !title || !fileName || !createdAt) return null

            return {
              id,
              title,
              summary: typeof row.summary === 'string' ? row.summary : null,
              request_text: normalizeString(row.request_text),
              file_name: fileName,
              created_at: createdAt,
              download_url: typeof row.download_url === 'string' ? row.download_url : null,
            } satisfies SavedReport
          })
          .filter((row): row is SavedReport => Boolean(row))
        : []

      setSavedReports(reports)
    } catch (loadError) {
      console.error('Could not load agent report history:', loadError)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadReportHistory()
  }, [open, loadReportHistory])

  const sendPrompt = useCallback(async (promptText: string) => {
    const content = promptText.trim()
    if (!content || sending) return

    setOpen(true)

    const userMessage: ChatMessage = {
      id: makeId('user'),
      role: 'user',
      content,
      createdAt: isoNow(),
      report: null,
      followUps: [],
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...conversationPayload, { role: 'user', content }].slice(-20),
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

      if (report?.downloadUrl) {
        setSavedReports((current) => [
          {
            id: report.id ?? report.fileName,
            title: report.title,
            summary: null,
            request_text: content,
            file_name: report.fileName,
            created_at: report.createdAt,
            download_url: report.downloadUrl,
          },
          ...current,
        ])
      }

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
    }
  }, [conversationPayload, sending])

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendPrompt(input)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[260] flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <section className="pointer-events-auto w-[min(460px,calc(100vw-1rem))] h-[min(82vh,760px)] bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] shadow-[0_18px_40px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.9)] flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm text-white">CSUB AI Agent</h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Databasesok, analyser og PDF-rapporter</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs rounded-md border border-[var(--csub-light-soft)] px-2 py-1 text-[var(--text-muted)] hover:text-white hover:border-[var(--csub-light)] cursor-pointer"
            >
              Lukk
            </button>
          </div>

          <div className="px-3 py-2 border-b border-[var(--csub-light-faint)] grid grid-cols-1 gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendPrompt(prompt)}
                disabled={sending}
                className="text-left rounded-md border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-white hover:border-[var(--csub-gold-soft)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 px-3 py-3 flex flex-col gap-3">
            <div
              ref={listRef}
              className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] p-2.5 flex-1 overflow-y-auto"
            >
              <div className="space-y-2.5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border px-2.5 py-2 ${message.role === 'user'
                      ? 'border-[var(--csub-gold-soft)] bg-[color:rgba(201,168,76,0.13)]'
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
                            onClick={() => void sendPrompt(followUp)}
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
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(77,184,158,0.08)] px-2.5 py-2 text-xs text-[var(--text-muted)] animate-pulse">
                    AI-agent jobber med databasen og skriver svar...
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
                  {sending ? 'Sender...' : 'Send'}
                </button>
              </div>
              {error && <p className="text-[11px] text-red-300">{error}</p>}
            </form>

            <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Siste AI-rapporter</p>
                {historyLoading && <span className="text-[10px] text-[var(--text-muted)]">Laster...</span>}
              </div>

              {!savedReports.length ? (
                <p className="text-[11px] text-[var(--text-muted)]">Ingen lagrede AI-rapporter ennå.</p>
              ) : (
                <div className="space-y-1.5 max-h-[130px] overflow-y-auto pr-1">
                  {savedReports.slice(0, 8).map((report) => (
                    <div key={report.id} className="rounded-md border border-[var(--csub-light-soft)] px-2 py-1.5 bg-[color:rgba(10,23,20,0.45)]">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-white truncate">{report.title}</p>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">{toDateText(report.created_at)}</span>
                      </div>
                      {report.download_url ? (
                        <a
                          href={report.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block mt-1 text-[11px] text-[var(--csub-light)] hover:text-white"
                        >
                          Åpne PDF
                        </a>
                      ) : (
                        <span className="inline-block mt-1 text-[11px] text-[var(--text-muted)]">Link utløpt</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto rounded-full border border-[var(--csub-gold-soft)] bg-[color:rgba(10,23,20,0.95)] px-4 py-3 text-xs text-white shadow-[0_12px_24px_rgba(0,0,0,0.45)] hover:border-[var(--csub-light)] transition-colors cursor-pointer"
      >
        {open ? 'Skjul AI Agent' : 'AI Agent'}
      </button>
    </div>
  )
}
