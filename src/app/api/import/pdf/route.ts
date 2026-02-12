import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import OpenAI from 'openai'

const CHUNK_SIZE = 500

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

interface ContractRow {
  supplier: string
  operator: string
  value: string
  scope: string
  region: string
  segment: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const supabase = createAdminClient()
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    // Create import batch
    const { data: batch } = await supabase.from('import_batches').insert({
      file_name: file.name,
      file_type: 'pdf_contract_awards',
      status: 'processing',
    }).select().single()
    const batchId = batch!.id

    // Use pdf-parse to get page count, then send full PDF as base64 to GPT vision
    // GPT-5.2 supports PDF input directly via base64
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_data: `data:application/pdf;base64,${base64}`,
                filename: file.name,
              },
            } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPartText,
            {
              type: 'text',
              text: `Extract ALL contract rows from this PDF table. The table has columns: Leverandør (supplier), Operatør (operator), Verdi (value), Omfang (scope), Region/Prosjekt (region/project), Segment.

Return a JSON array of objects with these exact fields:
- supplier: string
- operator: string  
- value: string (keep original format, e.g. "NOK 500M" or "USD 1.2B")
- scope: string (full description)
- region: string
- segment: string

Extract EVERY row from ALL pages. Return ONLY the JSON array, no other text.`,
            },
          ],
        },
      ],
      temperature: 0,
      max_completion_tokens: 16000,
    })

    const content = response.choices[0]?.message?.content || '[]'
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    const rows: ContractRow[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    // Upsert into contracts table
    const contractRows = rows.map(r => ({
      date: new Date().toISOString().split('T')[0],
      supplier: r.supplier || 'Unknown',
      operator: r.operator || 'Unknown',
      project_name: r.region || 'Unknown',
      description: r.scope || '',
      contract_type: mapSegment(r.segment),
      region: r.region,
      source: 'rystad_awards' as const,
      pipeline_phase: 'awarded' as const,
      external_id: `rystad-pdf-${hashStr(r.supplier + r.operator + (r.scope || '').substring(0, 100))}`,
      estimated_value_usd: parseValue(r.value),
    }))

    let imported = 0, skipped = 0
    for (let i = 0; i < contractRows.length; i += CHUNK_SIZE) {
      const chunk = contractRows.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabase.from('contracts').upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: false }).select('id')
      if (error) {
        console.error('PDF contract upsert error:', error.message)
        skipped += chunk.length
      } else {
        imported += data?.length ?? chunk.length
      }
    }

    await supabase.from('import_batches').update({
      status: 'completed',
      records_total: rows.length,
      records_imported: imported,
      records_skipped: skipped,
      completed_at: new Date().toISOString(),
    }).eq('id', batchId)

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      rows_extracted: rows.length,
      imported,
      skipped,
    })
  } catch (error) {
    console.error('PDF import error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function mapSegment(segment: string): 'EPCI' | 'Subsea' | 'SURF' | 'SPS' | 'Other' {
  if (!segment) return 'Other'
  const s = segment.toLowerCase()
  if (s.includes('epci')) return 'EPCI'
  if (s.includes('subsea') || s.includes('sps')) return 'SPS'
  if (s.includes('surf')) return 'SURF'
  return 'Other'
}

function parseValue(value: string): number | null {
  if (!value) return null
  const cleaned = value.replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  const lower = value.toLowerCase()
  if (lower.includes('b')) return Math.round(n * 1_000_000_000)
  if (lower.includes('m')) return Math.round(n * 1_000_000)
  if (lower.includes('k')) return Math.round(n * 1_000)
  return Math.round(n)
}

function hashStr(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
