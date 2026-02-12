'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ImportBatch {
  id: string
  file_name: string
  file_type: string
  status: string
  records_total: number
  records_imported: number
  records_updated: number
  records_skipped: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

interface ImportResult {
  success: boolean
  stats?: { total: number; imported: number; skipped: number }
  rows_extracted?: number
  imported?: number
  skipped?: number
  error?: string
  detected_type?: string
  report_period?: string
  summary_length?: number
  forecasts_extracted?: number
  forecasts_imported?: number
  key_figures?: Record<string, unknown>
}

function UploadZone({ title, description, endpoint }: { title: string; description: string; endpoint: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ success: false, error: String(err) })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2 text-slate-800">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = endpoint.includes('excel') ? '.xlsx,.xls' : '.pdf'
          input.onchange = e => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) setFile(f)
          }
          input.click()
        }}
      >
        {file ? (
          <div>
            <p className="font-medium text-slate-700">{file.name}</p>
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
        {uploading ? 'Importing...' : 'Import'}
      </button>

      {result && (
        <div className={`mt-4 p-3 rounded text-sm ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {result.success ? (
            <div>
              <p className="font-medium">✅ Import complete</p>
              {result.stats && <p>Total: {result.stats.total} | Imported: {result.stats.imported} | Skipped: {result.stats.skipped}</p>}
              {result.rows_extracted !== undefined && <p>Rows extracted: {result.rows_extracted} | Imported: {result.imported} | Skipped: {result.skipped}</p>}
              {result.detected_type && <p>Auto-detected: {result.detected_type}</p>}
              {result.report_period && <p>Report: {result.report_period} | Summary: {result.summary_length} chars | Forecasts: {result.forecasts_extracted} extracted, {result.forecasts_imported} saved</p>}
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
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    // Initial fetch
    fetch('/api/import/status').then(r => r.json()).then(setBatches).catch(() => {})

    // Subscribe to realtime updates on import_batches
    const channel = supabaseRef.current
      .channel('import-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'import_batches' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setBatches(prev => [payload.new as ImportBatch, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setBatches(prev => prev.map(b => b.id === (payload.new as ImportBatch).id ? payload.new as ImportBatch : b))
        }
      })
      .subscribe()

    return () => {
      supabaseRef.current.removeChannel(channel)
    }
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6 text-slate-200">Data Import</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <UploadZone
          title="Rystad Excel (Forecast/EPC)"
          description="Upload XMTs, Surf lines, Subsea Units and Upcoming awards Excel file"
          endpoint="/api/import/excel"
        />
        <UploadZone
          title="PDF (Auto-detect)"
          description="Upload any PDF — auto-detects Contract Updates vs Market Reports"
          endpoint="/api/import/auto"
        />
        <UploadZone
          title="Market Reports"
          description="Upload Subsea Market Report PDFs for AI summary & forecast extraction"
          endpoint="/api/import/report"
        />
      </div>

      <h2 className="text-xl font-semibold mb-4 text-slate-200">Recent Imports</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800">
              <th className="text-left p-2 border border-slate-700 text-slate-300">File</th>
              <th className="text-left p-2 border border-slate-700 text-slate-300">Type</th>
              <th className="text-left p-2 border border-slate-700 text-slate-300">Status</th>
              <th className="text-right p-2 border border-slate-700 text-slate-300">Total</th>
              <th className="text-right p-2 border border-slate-700 text-slate-300">Imported</th>
              <th className="text-right p-2 border border-slate-700 text-slate-300">Skipped</th>
              <th className="text-left p-2 border border-slate-700 text-slate-300">Date</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id} className="hover:bg-slate-800/50">
                <td className="p-2 border border-slate-700 truncate max-w-[200px] text-slate-300">{b.file_name}</td>
                <td className="p-2 border border-slate-700 text-slate-300">{b.file_type}</td>
                <td className="p-2 border border-slate-700">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    b.status === 'completed' ? 'bg-green-600/20 text-green-400' :
                    b.status === 'failed' ? 'bg-red-600/20 text-red-400' :
                    b.status === 'processing' ? 'bg-yellow-600/20 text-yellow-400 animate-pulse' :
                    'bg-slate-600/20 text-slate-400'
                  }`}>{b.status}</span>
                </td>
                <td className="p-2 border border-slate-700 text-right text-slate-300">{b.records_total}</td>
                <td className="p-2 border border-slate-700 text-right text-slate-300">{b.records_imported}</td>
                <td className="p-2 border border-slate-700 text-right text-slate-300">{b.records_skipped}</td>
                <td className="p-2 border border-slate-700 text-slate-300">{new Date(b.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-slate-500">No imports yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
