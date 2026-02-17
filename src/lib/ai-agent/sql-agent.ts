import 'server-only'

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReportPdfBuffer } from '@/lib/ai-agent/pdf'
import type { AgentMessage, AgentResponsePayload, AgentReportResult } from '@/lib/ai-agent/types'
import { randomUUID } from 'crypto'

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 6
const MAX_ROWS = 200
const MODEL = 'gpt-5.2'

// ─── Database Schema ──────────────────────────────────────────────────────────

const DB_SCHEMA = `
## Database Tables (Supabase/PostgREST)

### xmt_data (~2574 rows) — XMT (Christmas Tree) installations per project per year
Columns: year (int), continent, country, development_project, asset, operator, surf_contractor, facility_category, field_type, water_depth_category, distance_group, contract_award_year, contract_type, purpose, state, xmt_count (numeric)

### surf_data (~5845 rows) — SURF km per project per year
Columns: year (int), continent, country, development_project, asset, operator, surf_contractor, facility_category, field_type, water_depth_category, distance_group, design_category, line_group, km_surf_lines (numeric)

### subsea_unit_data (~7549 rows) — Subsea units per project per year
Columns: year (int), continent, country, development_project, asset, operator, surf_contractor, facility_category, field_type, water_depth_category, distance_group, unit_category, unit_count (numeric)

### projects (~1810 rows) — Aggregated project summaries
Columns: development_project, asset, country, continent, operator, surf_contractor, facility_category, field_type, water_depth_category, field_size_category, xmt_count (numeric), surf_km (numeric), subsea_unit_count (numeric), first_year (int), last_year (int)

### forecasts (~344 rows) — Market forecasts
Columns: year (int), metric (text), value (numeric), unit (text), source (text)

### documents — Imported reports/PDFs
Columns: file_name, file_type, file_size_bytes, ai_summary, created_at
`

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are CSUB AI Agent — an expert subsea market intelligence analyst with direct database access.

${DB_SCHEMA}

## Your tool: query_table
You can query any table with filters, sorting, column selection, and limits.

Parameters:
- table: table name (required)
- select: comma-separated columns, or use aggregation like "country,xmt_count.sum()" (default: *)
- filters: object of column filters using PostgREST syntax:
  - eq: equals, neq: not equals
  - gt/gte/lt/lte: comparisons
  - like/ilike: pattern matching (use * as wildcard)
  - in: array of values
  Example: { "year": { "eq": 2026 }, "country": { "ilike": "*norway*" } }
- order: column to sort by, prefix with - for descending (e.g. "-xmt_count")
- limit: max rows (default 100, max ${MAX_ROWS})

## Strategy
1. ALWAYS query the database before answering. Never guess or fabricate data.
2. Start broad, then drill down. Run multiple queries to build a complete picture.
3. For "top X" questions: query with order and limit.
4. For aggregations: query the raw data and compute totals yourself.
5. For year ranges: use gte/lte filters on the year column.
6. Cross-reference tables: e.g. check xmt_data AND projects for the same project.
7. You can run up to ${MAX_TOOL_ROUNDS} query rounds.

## Response rules
- Respond in the SAME LANGUAGE as the user (Norwegian or English).
- Be specific: include project names, numbers, countries, operators.
- When asked for a rapport/report/PDF, structure your answer as a full markdown report with # headers, ## sections, and markdown tables.
- Use markdown tables (| col1 | col2 |) for structured data — they will be rendered as proper tables in the PDF.
- NEVER mention tool limitations, query constraints, or technical issues in your answer. Present findings confidently.
- NEVER include raw technical details like table names, SQL, or API details in user-facing answers.
- Always suggest 2-3 follow-up questions at the end (start each with "Vil du" or "Ønsker du" for Norwegian).
`

// ─── OpenAI Client ────────────────────────────────────────────────────────────

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
  return new OpenAI({ apiKey })
}

// ─── Table Query Execution ────────────────────────────────────────────────────

type QueryFilter = Record<string, Record<string, unknown>>

async function queryTable(params: {
  table: string
  select?: string
  filters?: QueryFilter
  order?: string
  limit?: number
}): Promise<{ rows: Record<string, unknown>[]; rowCount: number; error: string | null }> {
  const allowedTables = ['xmt_data', 'surf_data', 'subsea_unit_data', 'projects', 'forecasts', 'contracts', 'upcoming_awards', 'documents']
  
  if (!allowedTables.includes(params.table)) {
    return { rows: [], rowCount: 0, error: `Table "${params.table}" not found. Allowed: ${allowedTables.join(', ')}` }
  }

  try {
    const supabase = createAdminClient()
    const limit = Math.min(params.limit ?? 100, MAX_ROWS)
    
    let query = supabase.from(params.table).select(params.select || '*')

    // Apply filters
    if (params.filters) {
      for (const [column, ops] of Object.entries(params.filters)) {
        for (const [op, value] of Object.entries(ops)) {
          switch (op) {
            case 'eq': query = query.eq(column, value); break
            case 'neq': query = query.neq(column, value); break
            case 'gt': query = query.gt(column, value); break
            case 'gte': query = query.gte(column, value); break
            case 'lt': query = query.lt(column, value); break
            case 'lte': query = query.lte(column, value); break
            case 'like': query = query.like(column, String(value)); break
            case 'ilike': query = query.ilike(column, String(value)); break
            case 'in': query = query.in(column, value as unknown[]); break
          }
        }
      }
    }

    // Apply ordering
    if (params.order) {
      const desc = params.order.startsWith('-')
      const col = desc ? params.order.slice(1) : params.order
      query = query.order(col, { ascending: !desc })
    }

    query = query.limit(limit)

    const { data, error } = await query
    
    if (error) {
      return { rows: [], rowCount: 0, error: error.message }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, unknown>[] = Array.isArray(data) ? (data as any[]) : []
    return { rows, rowCount: rows.length, error: null }
  } catch (err) {
    return { rows: [], rowCount: 0, error: err instanceof Error ? err.message : 'Query failed' }
  }
}

// ─── Tool Definition ──────────────────────────────────────────────────────────

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_table',
      description: 'Query a database table with filters, sorting and column selection. Returns up to 200 rows.',
      parameters: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name: xmt_data, surf_data, subsea_unit_data, projects, forecasts, contracts, upcoming_awards, documents',
          },
          select: {
            type: 'string',
            description: 'Comma-separated columns to return. Default: * (all columns). Example: "development_project,country,operator,xmt_count"',
          },
          filters: {
            type: 'object',
            description: 'Filter object. Keys are column names, values are objects with operator:value. Operators: eq, neq, gt, gte, lt, lte, like, ilike, in. Example: {"year":{"eq":2026},"country":{"ilike":"*norway*"}}',
          },
          order: {
            type: 'string',
            description: 'Column to sort by. Prefix with - for descending. Example: "-xmt_count"',
          },
          limit: {
            type: 'number',
            description: 'Max rows to return (default 100, max 200)',
          },
          purpose: {
            type: 'string',
            description: 'Brief description of why you are running this query.',
          },
        },
        required: ['table'],
      },
    },
  },
]

// ─── Main Agent Loop ──────────────────────────────────────────────────────────

export async function runSqlAgent(input: {
  messages: AgentMessage[]
  userId: string
  userEmail: string
}): Promise<AgentResponsePayload> {
  const client = getClient()
  let queriesRun = 0

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...input.messages.slice(-14).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  let toolRounds = 0

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_completion_tokens: 12000,
      tools: TOOLS,
      messages: chatMessages,
    })

    const message = response.choices[0]?.message
    if (!message) break

    if (!message.tool_calls || message.tool_calls.length === 0) {
      const answer = message.content ?? 'Kunne ikke generere svar.'
      return buildResponse(answer, queriesRun, input)
    }

    chatMessages.push(message)

    for (const toolCall of message.tool_calls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tc = toolCall as any
      const args = JSON.parse(tc.function.arguments) as {
        table?: string
        select?: string
        filters?: QueryFilter
        order?: string
        limit?: number
        purpose?: string
      }

      const result = await queryTable({
        table: args.table ?? '',
        select: args.select,
        filters: args.filters,
        order: args.order,
        limit: args.limit,
      })

      queriesRun++

      chatMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify({
          rowCount: result.rowCount,
          error: result.error,
          rows: result.rows,
        }),
      })
    }

    toolRounds++
  }

  // Final answer if tool rounds exhausted
  const finalResponse = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    max_completion_tokens: 12000,
    messages: [
      ...chatMessages,
      { role: 'user', content: 'Provide your final comprehensive answer now based on all collected data.' },
    ],
  })

  const answer = finalResponse.choices[0]?.message?.content ?? 'Analyse fullført.'
  return buildResponse(answer, queriesRun, input)
}

// ─── Response Builder ─────────────────────────────────────────────────────────

async function buildResponse(
  rawAnswer: string,
  queriesRun: number,
  input: { messages: AgentMessage[]; userId: string; userEmail: string }
): Promise<AgentResponsePayload> {
  const latestUser = [...input.messages].reverse().find((m) => m.role === 'user')
  const userRequest = latestUser?.content ?? ''
  const isNorwegian = /[æøåÆØÅ]|(\b(lag|rapport|hva|hvordan|vis|gi meg|prosjekt|topp|største)\b)/i.test(userRequest)
  const wantsReport = /\b(rapport|report|pdf)\b/i.test(userRequest)
  const hasReportContent = rawAnswer.includes('# ') && rawAnswer.length > 500

  const followUps = extractFollowUps(rawAnswer)

  let cleanAnswer = rawAnswer
  let report: AgentReportResult | null = null

  if (wantsReport && hasReportContent) {
    try {
      report = await generatePdfReport(rawAnswer, userRequest, input.userId, input.userEmail, isNorwegian)
      // Keep a shorter version for chat
      const lines = rawAnswer.split('\n')
      const summaryLines: string[] = []
      let foundFirstSection = false
      for (const line of lines) {
        if (line.startsWith('# ') && foundFirstSection) break
        if (line.startsWith('# ') || line.startsWith('## ')) foundFirstSection = true
        summaryLines.push(line)
        if (summaryLines.length > 30) break
      }
      cleanAnswer = summaryLines.join('\n') + '\n\nFull rapport tilgjengelig som PDF.'
    } catch (err) {
      console.error('PDF generation failed:', err)
    }
  }

  // Strip markdown for chat
  cleanAnswer = cleanAnswer
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    answer: cleanAnswer,
    report,
    followUps,
    plan: {
      intent: wantsReport ? 'report' : 'question',
      reportScope: 'custom',
      language: isNorwegian ? 'no' : 'en',
      projectKeywords: [],
      countries: [],
      operators: [],
      fromYear: null,
      toYear: null,
      includeHistorical: true,
      includeFuture: true,
      includeTables: [],
      focusPoints: [],
    },
    dataCoverage: {
      fromYear: null,
      toYear: null,
      counts: { sql_queries: queriesRun },
      warnings: [],
    },
  }
}

// ─── Follow-up Extraction ─────────────────────────────────────────────────────

function extractFollowUps(answer: string): string[] {
  const lines = answer.split('\n')
  const followUps: string[] = []

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-•*]\s*/, '')
    if (/^(Vil du|Would you|Skal jeg|Want me|Ønsker du|Trenger du)/i.test(trimmed)) {
      followUps.push(trimmed)
    }
  }

  return followUps.slice(0, 4)
}

// ─── PDF Report Generation ────────────────────────────────────────────────────

async function generatePdfReport(
  markdown: string,
  userRequest: string,
  userId: string,
  userEmail: string,
  isNorwegian: boolean
): Promise<AgentReportResult> {
  const admin = createAdminClient()
  const createdAt = new Date().toISOString()
  const dayStamp = createdAt.slice(0, 10)

  const titleMatch = markdown.match(/^#\s+(.+)$/m)
  const title = titleMatch?.[1]?.trim() ?? (isNorwegian ? 'CSUB AI Rapport' : 'CSUB AI Report')

  const slug = title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 64) || 'csub-report'

  const fileName = `${slug}-${dayStamp}.pdf`
  const storagePath = `ai-reports/${dayStamp}/${randomUUID()}-${fileName}`

  const pdfBuffer = await buildReportPdfBuffer({
    title,
    subtitle: isNorwegian ? 'AI-generert markedsanalyse' : 'AI-generated market intelligence',
    requestText: userRequest,
    markdown,
    generatedAt: dayStamp,
  })

  const uploadRes = await admin.storage.from('imports').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (uploadRes.error) throw new Error(`Upload failed: ${uploadRes.error.message}`)

  const signedRes = await admin.storage.from('imports').createSignedUrl(storagePath, 60 * 60 * 24 * 14)
  if (signedRes.error || !signedRes.data?.signedUrl) throw new Error('Could not create signed URL')

  await admin.from('ai_reports').insert({
    created_by: userId,
    created_by_email: userEmail,
    request_text: userRequest,
    title,
    report_markdown: markdown,
    report_json: {},
    storage_bucket: 'imports',
    storage_path: storagePath,
    file_name: fileName,
  }).maybeSingle()

  return {
    id: randomUUID(),
    title,
    fileName,
    storagePath,
    downloadUrl: signedRes.data.signedUrl,
    createdAt,
  }
}
