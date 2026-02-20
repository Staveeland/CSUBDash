'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'

interface ImportJob {
  id: string
  file_name: string
  file_type: string
  status: string
  records_total: number
  records_imported: number
  records_skipped: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

interface ImportResult {
  success: boolean
  job_id?: string
  status?: string
  error?: string
  detected_type?: string
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-[rgba(228,160,16,0.15)] text-[#e4a010] border border-[rgba(228,160,16,0.3)]',
    processing: 'bg-[rgba(77,184,158,0.15)] text-[#4db89e] border border-[rgba(77,184,158,0.3)]',
    completed: 'bg-[rgba(34,197,94,0.15)] text-[#22c55e] border border-[rgba(34,197,94,0.3)]',
    failed: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] border border-[rgba(239,68,68,0.3)]',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  )
}

type QueueFileStatus = 'waiting' | 'uploading' | 'queued' | 'error'

interface QueueItem {
  file: File
  status: QueueFileStatus
  error?: string
  jobId?: string
  detectedType?: string
}

function UploadZone({
  title,
  description,
  endpoint,
  onQueued,
}: {
  title: string
  description: string
  endpoint: string
  onQueued: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const maxSizeBytes = endpoint.includes('excel') ? 10 * 1024 * 1024 : 25 * 1024 * 1024

  const addFiles = useCallback((files: FileList | File[]) => {
    const items: QueueItem[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (f.size > maxSizeBytes) {
        items.push({ file: f, status: 'error', error: `Too large (max ${Math.round(maxSizeBytes / 1024 / 1024)}MB)` })
      } else {
        items.push({ file: f, status: 'waiting' })
      }
    }
    setQueue((prev) => [...prev, ...items])
  }, [maxSizeBytes])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handleUploadAll = async () => {
    const waitingIndices = queue
      .map((item, i) => (item.status === 'waiting' ? i : -1))
      .filter((i) => i >= 0)

    if (waitingIndices.length === 0) return
    setUploading(true)

    for (const idx of waitingIndices) {
      setQueue((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'uploading' } : item))

      try {
        const file = queue[idx].file
        const supabase = createClient()
        const cleanName = sanitizeFileName(file.name)
        const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${cleanName}`

        const { error: uploadError } = await supabase
          .storage
          .from('imports')
          .upload(storagePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          })

        if (uploadError) throw new Error(uploadError.message)

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: file.name,
            file_size_bytes: file.size,
            storage_bucket: 'imports',
            storage_path: storagePath,
          }),
        })

        const data = (await res.json()) as ImportResult
        if (!res.ok || !data.success) throw new Error(data.error || `Request failed (${res.status})`)

        setQueue((prev) => prev.map((item, i) =>
          i === idx ? { ...item, status: 'queued', jobId: data.job_id, detectedType: data.detected_type } : item
        ))
        onQueued()
      } catch (err) {
        setQueue((prev) => prev.map((item, i) =>
          i === idx ? { ...item, status: 'error', error: String(err) } : item
        ))
      }
    }

    setUploading(false)
  }

  const waitingCount = queue.filter((i) => i.status === 'waiting').length

  const statusIcon: Record<QueueFileStatus, string> = {
    waiting: '⏳',
    uploading: '⬆️',
    queued: '✅',
    error: '❌',
  }

  return (
    <div className="bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] shadow-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">{description}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[var(--csub-light)] bg-[rgba(77,184,158,0.1)]'
            : 'border-[var(--csub-light-soft)] bg-[rgba(10,23,20,0.5)] hover:border-[var(--csub-light)]'
        }`}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.accept = endpoint.includes('excel') ? '.xlsx,.xlsb' : '.pdf'
          input.onchange = (event) => {
            const selected = (event.target as HTMLInputElement).files
            if (selected && selected.length > 0) addFiles(selected)
          }
          input.click()
        }}
      >
        {queue.length > 0 ? (
          <div>
            <p className="font-medium text-white">{queue.length} file{queue.length !== 1 ? 's' : ''} selected</p>
            <p className="text-sm text-[var(--text-muted)]">Drop more or click to add</p>
          </div>
        ) : (
          <p className="text-[var(--text-muted)]">Drop files here or click to select</p>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Max file size: {Math.round(maxSizeBytes / 1024 / 1024)}MB · Multiple files supported</p>

      {queue.length > 0 && (
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
          {queue.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-[rgba(10,23,20,0.5)]">
              <span>{statusIcon[item.status]}</span>
              <span className="truncate flex-1 text-white">{item.file.name}</span>
              <span className="text-[var(--text-muted)] whitespace-nowrap">{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
              {item.status === 'queued' && item.detectedType && (
                <span className="text-[#4db89e] whitespace-nowrap">{item.detectedType}</span>
              )}
              {item.status === 'error' && (
                <span className="text-[#ef4444] truncate max-w-[120px]" title={item.error}>{item.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleUploadAll}
          disabled={waitingCount === 0 || uploading}
          className="px-4 py-2 bg-[var(--csub-light)] text-[var(--csub-dark)] font-semibold rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {uploading ? 'Uploading...' : waitingCount > 1 ? `Import ${waitingCount} files` : 'Import'}
        </button>
        {queue.length > 0 && !uploading && (
          <button
            onClick={() => setQueue([])}
            className="px-4 py-2 text-[var(--text-muted)] hover:text-white transition-colors text-sm"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export default function ImportPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([])

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/import/status', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setJobs(Array.isArray(data) ? data : [])
    } catch {
      // no-op
    }
  }, [])

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void loadJobs()
    }, 0)
    const timer = window.setInterval(() => {
      void loadJobs()
    }, 3000)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
    }
  }, [loadJobs])

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] text-white">
      {/* Header */}
      <header className="border-b border-[var(--csub-light-faint)] bg-[var(--csub-dark)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="/csub-logo.svg" alt="CSUB" width={40} height={40} />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Data Import</h1>
              <p className="text-xs text-[var(--text-muted)]">Upload and manage data imports</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm text-[var(--csub-light)] hover:text-white transition-colors flex items-center gap-1"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Upload Zones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <UploadZone
            title="Rystad Excel (Kommende prosjekter)"
            description="Upload forecast Excel files (.xlsx/.xlsb) for upcoming projects only (not historical awards)"
            endpoint="/api/import/excel"
            onQueued={loadJobs}
          />
          <UploadZone
            title="PDF (Auto-detect)"
            description="Upload any PDF — auto-detects Contract Updates vs Market Reports"
            endpoint="/api/import/auto"
            onQueued={loadJobs}
          />
          <UploadZone
            title="Market Reports"
            description="Upload Subsea Market Report PDFs for AI summary & forecast extraction"
            endpoint="/api/import/report"
            onQueued={loadJobs}
          />
        </div>

        {/* Recent Imports Table */}
        <div className="bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--csub-light-faint)]">
            <h2 className="text-lg font-semibold">Recent Imports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--csub-light-faint)] text-[var(--text-muted)]">
                  <th className="text-left px-4 py-3 font-medium">File</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-4 py-3 font-medium">Imported</th>
                  <th className="text-right px-4 py-3 font-medium">Skipped</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[var(--csub-light-faint)] hover:bg-[rgba(77,184,158,0.05)] transition-colors">
                    <td className="px-4 py-3 truncate max-w-[220px] text-white">{job.file_name}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{job.file_type}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                      {job.error_message && (
                        <p className="text-[11px] text-[#ef4444] mt-1">{job.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{job.records_total || 0}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{job.records_imported || 0}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{job.records_skipped || 0}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(job.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">No imports yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
