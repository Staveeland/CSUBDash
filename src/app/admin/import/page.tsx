'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [stage, setStage] = useState<string>('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }, [])

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const supabase = createClient()
      const cleanName = sanitizeFileName(file.name)
      const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${cleanName}`

      setStage('Laster opp fil til storage...')
      const { error: uploadError } = await supabase
        .storage
        .from('imports')
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      setStage('Oppretter importjobb...')
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
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`)
      }

      setResult(data)
      setStage('Importjobb er satt i kø')
      onQueued()
    } catch (err) {
      setResult({ success: false, error: String(err) })
      setStage('')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = endpoint.includes('excel') ? '.xlsx,.xls' : '.pdf'
          input.onchange = (event) => {
            const selected = (event.target as HTMLInputElement).files?.[0]
            if (selected) setFile(selected)
          }
          input.click()
        }}
      >
        {file ? (
          <div>
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        ) : (
          <p className="text-gray-400">Drop file here or click to select</p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? 'Uploading...' : 'Import'}
      </button>

      {stage && <p className="mt-3 text-xs text-gray-500">{stage}</p>}

      {result && (
        <div className={`mt-4 p-3 rounded text-sm ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {result.success ? (
            <div>
              <p className="font-medium">✅ Job queued</p>
              <p>Job ID: {result.job_id}</p>
              {result.detected_type && <p>Detected: {result.detected_type}</p>}
            </div>
          ) : (
            <p>❌ {result.error}</p>
          )}
        </div>
      )}
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
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Data Import</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <UploadZone
          title="Rystad Excel (Forecast/EPC)"
          description="Upload XMTs, Surf lines, Subsea Units and Upcoming awards Excel file"
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

      <h2 className="text-xl font-semibold mb-4">Recent Imports</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-2 border">File</th>
              <th className="text-left p-2 border">Type</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-right p-2 border">Total</th>
              <th className="text-right p-2 border">Imported</th>
              <th className="text-right p-2 border">Skipped</th>
              <th className="text-left p-2 border">Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="p-2 border truncate max-w-[220px]">{job.file_name}</td>
                <td className="p-2 border">{job.file_type}</td>
                <td className="p-2 border">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      job.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : job.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : job.status === 'processing'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {job.status}
                  </span>
                  {job.error_message && <p className="text-[11px] text-red-700 mt-1">{job.error_message}</p>}
                </td>
                <td className="p-2 border text-right">{job.records_total || 0}</td>
                <td className="p-2 border text-right">{job.records_imported || 0}</td>
                <td className="p-2 border text-right">{job.records_skipped || 0}</td>
                <td className="p-2 border">{new Date(job.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">No imports yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
