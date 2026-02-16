import 'server-only'

import { randomUUID } from 'crypto'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReportPdfBuffer } from '@/lib/ai-agent/pdf'
import { parseJsonObject } from '@/lib/ai-agent/json'
import type { AgentMessage, AgentPlan, AgentResponsePayload, AgentReportResult } from '@/lib/ai-agent/types'

type ProjectRow = {
  development_project: string
  asset: string
  country: string
  continent: string
  operator: string
  surf_contractor: string
  facility_category: string
  field_type: string
  water_depth_category: string
  field_size_category: string
  xmt_count: number
  surf_km: number
  subsea_unit_count: number
  first_year: number | null
  last_year: number | null
}

type ContractRow = {
  project_name: string
  supplier: string
  operator: string
  contract_type: string
  region: string
  country: string
  pipeline_phase: string
  date: string | null
  announced_at: string | null
  estimated_value_usd: number | null
  description: string
}

type ForecastRow = {
  year: number
  metric: string
  value: number
  unit: string
  source: string
}

type UpcomingAwardRow = {
  year: number | null
  country: string
  development_project: string
  asset: string
  operator: string
  surf_contractor: string
  xmts_awarded: number
}

type XmtRow = {
  year: number | null
  country: string
  development_project: string
  operator: string
  surf_contractor: string
  xmt_count: number
}

type SurfRow = {
  year: number | null
  country: string
  development_project: string
  operator: string
  surf_contractor: string
  km_surf_lines: number
}

type SubseaUnitRow = {
  year: number | null
  country: string
  development_project: string
  operator: string
  surf_contractor: string
  unit_count: number
}

type ReportDocRow = {
  file_name: string
  ai_summary: string
  created_at: string | null
}

type DataSummary = {
  fromYear: number | null
  toYear: number | null
  counts: Record<string, number>
  warnings: string[]
  contextPayload: Record<string, unknown>
}

type ModelAgentOutput = {
  answerMarkdown: string
  reportTitle: string | null
  reportMarkdown: string | null
  reportSummary: string | null
  followUps: string[]
}

const SUPPORTED_TABLES = [
  'projects',
  'contracts',
  'forecasts',
  'upcoming_awards',
  'xmt_data',
  'surf_data',
  'subsea_unit_data',
  'documents',
] as const

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'you',
  'need',
  'about',
  'what',
  'which',
  'when',
  'where',
  'have',
  'will',
  'want',
  'please',
  'could',
  'would',
  'report',
  'rapport',
  'prosjekt',
  'project',
  'periode',
  'period',
  'show',
  'give',
  'lag',
  'lage',
  'hele',
  'all',
  'over',
  'year',
  'ar',
  'forrige',
  'neste',
  'kan',
  'hva',
  'hvordan',
  'som',
  'det',
  'jeg',
  'oss',
  'til',
  'fra',
  'på',
  'med',
  'og',
  'en',
  'et',
  'av',
])

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY')
  }
  return new OpenAI({ apiKey })
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

function asString(input: unknown, fallback = ''): string {
  if (typeof input === 'string') return input.trim()
  if (typeof input === 'number' && Number.isFinite(input)) return String(input)
  return fallback
}

function asNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input === 'string') {
    const cleaned = input.replace(/,/g, '').trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asInt(input: unknown): number | null {
  const parsed = asNumber(input)
  if (parsed === null) return null
  const rounded = Math.round(parsed)
  return rounded >= 1900 && rounded <= 2200 ? rounded : null
}

function asIsoDate(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function yearFromDate(input: string | null): number | null {
  if (!input) return null
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getUTCFullYear()
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase()
}

function uniqStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  values.forEach((value) => {
    const normalized = normalizeText(value)
    if (!normalized) return
    if (seen.has(normalized)) return
    seen.add(normalized)
    output.push(value.trim())
  })

  return output
}

function normalizeMetric(metric: string): string {
  return metric
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isNorwegianText(input: string): boolean {
  const lowered = normalizeText(input)
  return /\b(hva|hvordan|lag|rapport|prosjekt|periode|år|for|til|fra|oversikt|analyse|vis)\b/.test(lowered)
}

function extractYearHints(input: string): { fromYear: number | null; toYear: number | null } {
  const years = Array.from(input.matchAll(/\b(19|20)\d{2}\b/g)).map((match) => Number(match[0]))
  if (!years.length) return { fromYear: null, toYear: null }

  if (years.length >= 2) {
    const sorted = [...years].sort((a, b) => a - b)
    return { fromYear: sorted[0], toYear: sorted[sorted.length - 1] }
  }

  return { fromYear: years[0], toYear: years[0] }
}

function extractKeywordHints(input: string): string[] {
  return uniqStrings(
    input
      .toLowerCase()
      .replace(/[^a-z0-9æøå\s-]/gi, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOPWORDS.has(token))
  )
}

function keywordScore(haystack: string, keywords: string[]): number {
  const normalized = normalizeText(haystack)
  return keywords.reduce((score, keyword) => {
    const candidate = normalizeText(keyword)
    if (!candidate) return score
    return normalized.includes(candidate) ? score + 1 : score
  }, 0)
}

function toSlug(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()

  return cleaned.slice(0, 64) || 'csub-report'
}

function toPlainChatText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/```[a-z0-9_-]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatDateForHumans(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toISOString().slice(0, 10)
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return uniqStrings(input.map((entry) => asString(entry)).filter(Boolean))
}

function parseIncludeTables(input: unknown): string[] {
  const tableCandidates = parseStringArray(input).map((value) => normalizeText(value))
  const allowed = new Set(SUPPORTED_TABLES)
  const normalized = tableCandidates.filter((value) => allowed.has(value as (typeof SUPPORTED_TABLES)[number]))
  return normalized.length > 0 ? normalized : [...SUPPORTED_TABLES]
}

function coercePlan(raw: Record<string, unknown>, latestUserText: string): AgentPlan {
  const nowYear = new Date().getUTCFullYear()
  const heuristicYears = extractYearHints(latestUserText)
  const heuristicKeywords = extractKeywordHints(latestUserText)
  const lowered = normalizeText(latestUserText)

  const rawIntent = asString(raw.intent).toLowerCase()
  const reportIntentFromText = /\b(rapport|report|pdf|analysis report|årsrapport|annual report)\b/.test(lowered)
  const intent: AgentPlan['intent'] = rawIntent === 'report' || reportIntentFromText ? 'report' : 'question'

  const rawScope = asString(raw.report_scope || raw.reportScope).toLowerCase()
  const reportScope: AgentPlan['reportScope'] =
    rawScope === 'project_period' || rawScope === 'annual_all' || rawScope === 'custom' || rawScope === 'none'
      ? rawScope
      : intent === 'report'
        ? reportIntentFromText && /\b(alle|all|global|hele)\b/.test(lowered)
          ? 'annual_all'
          : 'custom'
        : 'none'

  const rawLanguage = asString(raw.language).toLowerCase()
  const language: AgentPlan['language'] = rawLanguage === 'no' || rawLanguage === 'en'
    ? rawLanguage
    : isNorwegianText(latestUserText)
      ? 'no'
      : 'en'

  const fromYearCandidate = asInt(raw.from_year ?? raw.fromYear)
  const toYearCandidate = asInt(raw.to_year ?? raw.toYear)

  const fromYear = fromYearCandidate ?? heuristicYears.fromYear
  const toYear = toYearCandidate ?? heuristicYears.toYear

  const normalizedFromYear = fromYear && fromYear >= 1900 && fromYear <= nowYear + 15 ? fromYear : null
  const normalizedToYear = toYear && toYear >= 1900 && toYear <= nowYear + 15 ? toYear : null

  const computedFromYear = normalizedFromYear !== null && normalizedToYear !== null
    ? Math.min(normalizedFromYear, normalizedToYear)
    : normalizedFromYear

  const computedToYear = normalizedFromYear !== null && normalizedToYear !== null
    ? Math.max(normalizedFromYear, normalizedToYear)
    : normalizedToYear

  const projectKeywords = uniqStrings([
    ...parseStringArray(raw.project_keywords ?? raw.projectKeywords),
    ...heuristicKeywords.filter((keyword) => keyword.length > 3).slice(0, 8),
  ]).slice(0, 12)

  const focusPoints = uniqStrings([
    ...parseStringArray(raw.focus_points ?? raw.focusPoints),
    ...extractKeywordHints(latestUserText).slice(0, 12),
  ]).slice(0, 14)

  return {
    intent,
    reportScope,
    language,
    projectKeywords,
    countries: parseStringArray(raw.countries),
    operators: parseStringArray(raw.operators),
    fromYear: computedFromYear,
    toYear: computedToYear,
    includeHistorical: raw.include_historical === false ? false : true,
    includeFuture: raw.include_future === false ? false : true,
    includeTables: parseIncludeTables(raw.include_tables ?? raw.includeTables),
    focusPoints,
  }
}

function fallbackPlan(latestUserText: string): AgentPlan {
  return coercePlan({}, latestUserText)
}

async function buildAgentPlan(messages: AgentMessage[]): Promise<AgentPlan> {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')
  if (!latestUser) {
    return fallbackPlan('')
  }

  const trimmedHistory = messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n')

  const plannerPrompt = [
    'You are a strict JSON planner for a subsea intelligence AI agent.',
    'Return one JSON object only.',
    'Schema:',
    '{',
    '  "intent": "question" | "report",',
    '  "report_scope": "project_period" | "annual_all" | "custom" | "none",',
    '  "language": "no" | "en",',
    '  "project_keywords": ["..."],',
    '  "countries": ["..."],',
    '  "operators": ["..."],',
    '  "from_year": 2024 | null,',
    '  "to_year": 2026 | null,',
    '  "include_historical": true | false,',
    '  "include_future": true | false,',
    '  "include_tables": ["projects","contracts","forecasts","upcoming_awards","xmt_data","surf_data","subsea_unit_data","documents"],',
    '  "focus_points": ["..."]',
    '}',
    'Rules:',
    '- If user asks for a report, set intent="report".',
    '- If user asks for annual/all-project report, use report_scope="annual_all".',
    '- If user asks for one project in a period, use report_scope="project_period".',
    '- Always include all relevant tables.',
    '- Do not include commentary, markdown, or prose outside JSON.',
    '',
    `Conversation:\n${trimmedHistory}`,
  ].join('\n')

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-5.2',
      temperature: 0,
      max_completion_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: plannerPrompt,
        },
      ],
    })

    const content = response.choices[0]?.message?.content ?? '{}'
    const parsed = parseJsonObject(content)
    return coercePlan(parsed, latestUser.content)
  } catch {
    return fallbackPlan(latestUser.content)
  }
}

function matchesOptionalFilters(
  country: string,
  operator: string,
  countries: string[],
  operators: string[]
): boolean {
  const normalizedCountry = normalizeText(country)
  const normalizedOperator = normalizeText(operator)

  const countryMatch =
    countries.length === 0 ||
    countries.some((candidate) => normalizedCountry.includes(normalizeText(candidate)))

  const operatorMatch =
    operators.length === 0 ||
    operators.some((candidate) => normalizedOperator.includes(normalizeText(candidate)))

  return countryMatch && operatorMatch
}

function rowWithinYear(year: number | null, fromYear: number | null, toYear: number | null): boolean {
  if (year === null) return true
  if (fromYear !== null && year < fromYear) return false
  if (toYear !== null && year > toYear) return false
  return true
}

function projectWithinYear(project: ProjectRow, fromYear: number | null, toYear: number | null): boolean {
  if (fromYear === null && toYear === null) return true
  const first = project.first_year ?? project.last_year
  const last = project.last_year ?? project.first_year

  if (first === null && last === null) return true

  const rangeStart = first ?? last ?? 0
  const rangeEnd = last ?? first ?? 0

  if (fromYear !== null && rangeEnd < fromYear) return false
  if (toYear !== null && rangeStart > toYear) return false
  return true
}

function sortByScoreAndYear<T>(
  rows: T[],
  getScore: (row: T) => number,
  getYear: (row: T) => number | null,
  limit = 400
): T[] {
  return [...rows]
    .sort((a, b) => {
      const scoreDiff = getScore(b) - getScore(a)
      if (scoreDiff !== 0) return scoreDiff
      const yearA = getYear(a) ?? 0
      const yearB = getYear(b) ?? 0
      return yearB - yearA
    })
    .slice(0, limit)
}

function sumNumber<T>(rows: T[], getter: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + getter(row), 0)
}

function topCounts(values: string[], limit = 8): Array<{ label: string; count: number }> {
  const map = new Map<string, { label: string; count: number }>()

  values.forEach((value) => {
    const label = value.trim()
    if (!label) return
    const key = label.toLowerCase()
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { label, count: 1 })
      return
    }
    existing.count += 1
  })

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function summarizeDocs(docs: ReportDocRow[]): Array<{ file_name: string; created_at: string | null; excerpt: string }> {
  return docs.slice(0, 20).map((doc) => {
    const excerpt = doc.ai_summary
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180)

    return {
      file_name: doc.file_name,
      created_at: doc.created_at,
      excerpt,
    }
  })
}

function aggregateByYear<T extends { year: number | null }>(
  rows: T[],
  valueGetter: (row: T) => number
): Array<{ year: number; value: number }> {
  const map = new Map<number, number>()

  rows.forEach((row) => {
    if (row.year === null || !Number.isFinite(row.year)) return
    map.set(row.year, (map.get(row.year) ?? 0) + valueGetter(row))
  })

  return Array.from(map.entries())
    .map(([year, value]) => ({ year, value: Number(value.toFixed(2)) }))
    .sort((a, b) => a.year - b.year)
}

function normalizeProjectRows(rows: Record<string, unknown>[]): ProjectRow[] {
  return rows.map((row) => ({
    development_project: asString(row.development_project || row.project_name || row.asset, 'Unknown project'),
    asset: asString(row.asset),
    country: asString(row.country, 'Unknown'),
    continent: asString(row.continent),
    operator: asString(row.operator),
    surf_contractor: asString(row.surf_contractor || row.contractor),
    facility_category: asString(row.facility_category),
    field_type: asString(row.field_type),
    water_depth_category: asString(row.water_depth_category),
    field_size_category: asString(row.field_size_category),
    xmt_count: asNumber(row.xmt_count) ?? 0,
    surf_km: asNumber(row.surf_km) ?? 0,
    subsea_unit_count: asNumber(row.subsea_unit_count) ?? 0,
    first_year: asInt(row.first_year),
    last_year: asInt(row.last_year),
  }))
}

function normalizeContractRows(rows: Record<string, unknown>[]): ContractRow[] {
  return rows.map((row) => ({
    project_name: asString(row.project_name || row.description, 'Unknown contract'),
    supplier: asString(row.supplier),
    operator: asString(row.operator),
    contract_type: asString(row.contract_type),
    region: asString(row.region),
    country: asString(row.country, 'Unknown'),
    pipeline_phase: asString(row.pipeline_phase),
    date: asIsoDate(row.date),
    announced_at: asIsoDate(row.announced_at),
    estimated_value_usd: asNumber(row.estimated_value_usd),
    description: asString(row.description),
  }))
}

function normalizeForecastRows(rows: Record<string, unknown>[]): ForecastRow[] {
  return rows
    .map((row) => ({
      year: asInt(row.year) ?? 0,
      metric: normalizeMetric(asString(row.metric)),
      value: asNumber(row.value) ?? Number.NaN,
      unit: asString(row.unit),
      source: asString(row.source),
    }))
    .filter((row) => row.year > 0 && Number.isFinite(row.value) && row.metric.length > 0)
}

function normalizeAwardRows(rows: Record<string, unknown>[]): UpcomingAwardRow[] {
  return rows.map((row) => ({
    year: asInt(row.year),
    country: asString(row.country),
    development_project: asString(row.development_project || row.asset, 'Unknown'),
    asset: asString(row.asset),
    operator: asString(row.operator),
    surf_contractor: asString(row.surf_contractor),
    xmts_awarded: asNumber(row.xmts_awarded) ?? 0,
  }))
}

function normalizeXmtRows(rows: Record<string, unknown>[]): XmtRow[] {
  return rows.map((row) => ({
    year: asInt(row.year),
    country: asString(row.country),
    development_project: asString(row.development_project || row.asset, 'Unknown'),
    operator: asString(row.operator),
    surf_contractor: asString(row.surf_contractor),
    xmt_count: asNumber(row.xmt_count) ?? 0,
  }))
}

function normalizeSurfRows(rows: Record<string, unknown>[]): SurfRow[] {
  return rows.map((row) => ({
    year: asInt(row.year),
    country: asString(row.country),
    development_project: asString(row.development_project || row.asset, 'Unknown'),
    operator: asString(row.operator),
    surf_contractor: asString(row.surf_contractor),
    km_surf_lines: asNumber(row.km_surf_lines) ?? 0,
  }))
}

function normalizeSubseaRows(rows: Record<string, unknown>[]): SubseaUnitRow[] {
  return rows.map((row) => ({
    year: asInt(row.year),
    country: asString(row.country),
    development_project: asString(row.development_project || row.asset, 'Unknown'),
    operator: asString(row.operator),
    surf_contractor: asString(row.surf_contractor),
    unit_count: asNumber(row.unit_count) ?? 0,
  }))
}

function normalizeReportRows(rows: Record<string, unknown>[]): ReportDocRow[] {
  return rows.map((row) => ({
    file_name: asString(row.file_name, 'Unknown file'),
    ai_summary: asString(row.ai_summary),
    created_at: asIsoDate(row.created_at),
  }))
}

function extractRows(
  label: string,
  result: { data: unknown[] | null; error: { message: string } | null },
  warnings: string[]
): Record<string, unknown>[] {
  if (result.error) {
    warnings.push(`${label}: ${result.error.message}`)
    return []
  }

  if (!Array.isArray(result.data)) return []
  return result.data.map((row) => asRecord(row))
}

async function collectAndFilterData(plan: AgentPlan): Promise<DataSummary> {
  const warnings: string[] = []
  const admin = createAdminClient()
  const includeTables = new Set(plan.includeTables)

  const [projectsRes, contractsRes, forecastsRes, awardsRes, xmtRes, surfRes, subseaRes, docsRes] = await Promise.all([
    includeTables.has('projects')
      ? admin
        .from('projects')
        .select('development_project, asset, country, continent, operator, surf_contractor, facility_category, field_type, water_depth_category, field_size_category, xmt_count, surf_km, subsea_unit_count, first_year, last_year')
        .limit(10000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('contracts')
      ? admin
        .from('contracts')
        .select('project_name, supplier, operator, contract_type, region, country, pipeline_phase, date, announced_at, estimated_value_usd, description')
        .limit(10000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('forecasts')
      ? admin
        .from('forecasts')
        .select('year, metric, value, unit, source')
        .order('year', { ascending: true })
        .limit(12000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('upcoming_awards')
      ? admin
        .from('upcoming_awards')
        .select('year, country, development_project, asset, operator, surf_contractor, xmts_awarded')
        .limit(10000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('xmt_data')
      ? admin
        .from('xmt_data')
        .select('year, country, development_project, operator, surf_contractor, xmt_count')
        .limit(12000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('surf_data')
      ? admin
        .from('surf_data')
        .select('year, country, development_project, operator, surf_contractor, km_surf_lines')
        .limit(12000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('subsea_unit_data')
      ? admin
        .from('subsea_unit_data')
        .select('year, country, development_project, operator, surf_contractor, unit_count')
        .limit(12000)
      : Promise.resolve({ data: [], error: null }),
    includeTables.has('documents')
      ? admin
        .from('documents')
        .select('file_name, ai_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(120)
      : Promise.resolve({ data: [], error: null }),
  ])

  const projects = normalizeProjectRows(extractRows('projects', projectsRes, warnings))
  const contracts = normalizeContractRows(extractRows('contracts', contractsRes, warnings))
  const forecasts = normalizeForecastRows(extractRows('forecasts', forecastsRes, warnings))
  const awards = normalizeAwardRows(extractRows('upcoming_awards', awardsRes, warnings))
  const xmtRows = normalizeXmtRows(extractRows('xmt_data', xmtRes, warnings))
  const surfRows = normalizeSurfRows(extractRows('surf_data', surfRes, warnings))
  const subseaRows = normalizeSubseaRows(extractRows('subsea_unit_data', subseaRes, warnings))
  const docs = normalizeReportRows(extractRows('documents', docsRes, warnings))

  const combinedKeywords = uniqStrings([...plan.projectKeywords, ...plan.focusPoints]).map((value) => normalizeText(value))
  const hasKeywordFilter = combinedKeywords.length > 0

  const filteredProjects = sortByScoreAndYear(
    projects.filter((project) => {
      if (!projectWithinYear(project, plan.fromYear, plan.toYear)) return false
      if (!matchesOptionalFilters(project.country, project.operator, plan.countries, plan.operators)) return false
      if (!hasKeywordFilter) return true

      const haystack = [
        project.development_project,
        project.asset,
        project.country,
        project.operator,
        project.surf_contractor,
        project.facility_category,
      ].join(' ')

      return keywordScore(haystack, combinedKeywords) > 0
    }),
    (project) => keywordScore([
      project.development_project,
      project.asset,
      project.country,
      project.operator,
      project.surf_contractor,
    ].join(' '), combinedKeywords),
    (project) => project.last_year ?? project.first_year,
    480
  )

  const filteredContracts = sortByScoreAndYear(
    contracts.filter((contract) => {
      const contractYear = yearFromDate(contract.date) ?? yearFromDate(contract.announced_at)
      if (!rowWithinYear(contractYear, plan.fromYear, plan.toYear)) return false
      if (!matchesOptionalFilters(contract.country, contract.operator, plan.countries, plan.operators)) return false
      if (!hasKeywordFilter) return true

      const haystack = [
        contract.project_name,
        contract.description,
        contract.country,
        contract.operator,
        contract.supplier,
        contract.contract_type,
      ].join(' ')

      return keywordScore(haystack, combinedKeywords) > 0
    }),
    (contract) => keywordScore([
      contract.project_name,
      contract.description,
      contract.country,
      contract.operator,
      contract.supplier,
      contract.contract_type,
    ].join(' '), combinedKeywords),
    (contract) => yearFromDate(contract.date) ?? yearFromDate(contract.announced_at),
    480
  )

  const filteredForecasts = sortByScoreAndYear(
    forecasts.filter((forecast) => {
      if (!rowWithinYear(forecast.year, plan.fromYear, plan.toYear)) return false
      if (!hasKeywordFilter) return true
      const haystack = `${forecast.metric} ${forecast.unit} ${forecast.source}`
      return keywordScore(haystack, combinedKeywords) > 0
    }),
    (forecast) => keywordScore(`${forecast.metric} ${forecast.unit} ${forecast.source}`, combinedKeywords),
    (forecast) => forecast.year,
    600
  )

  const filteredAwards = sortByScoreAndYear(
    awards.filter((award) => {
      if (!rowWithinYear(award.year, plan.fromYear, plan.toYear)) return false
      if (!matchesOptionalFilters(award.country, award.operator, plan.countries, plan.operators)) return false
      if (!hasKeywordFilter) return true
      const haystack = `${award.development_project} ${award.asset} ${award.country} ${award.operator}`
      return keywordScore(haystack, combinedKeywords) > 0
    }),
    (award) => keywordScore(`${award.development_project} ${award.asset} ${award.country} ${award.operator}`, combinedKeywords),
    (award) => award.year,
    420
  )

  const filteredXmt = sortByScoreAndYear(
    xmtRows.filter((row) => {
      if (!rowWithinYear(row.year, plan.fromYear, plan.toYear)) return false
      if (!matchesOptionalFilters(row.country, row.operator, plan.countries, plan.operators)) return false
      if (!hasKeywordFilter) return true
      return keywordScore(`${row.development_project} ${row.country} ${row.operator} ${row.surf_contractor}`, combinedKeywords) > 0
    }),
    (row) => keywordScore(`${row.development_project} ${row.country} ${row.operator} ${row.surf_contractor}`, combinedKeywords),
    (row) => row.year,
    900
  )

  const filteredSurf = sortByScoreAndYear(
    surfRows.filter((row) => {
      if (!rowWithinYear(row.year, plan.fromYear, plan.toYear)) return false
      if (!matchesOptionalFilters(row.country, row.operator, plan.countries, plan.operators)) return false
      if (!hasKeywordFilter) return true
      return keywordScore(`${row.development_project} ${row.country} ${row.operator} ${row.surf_contractor}`, combinedKeywords) > 0
    }),
    (row) => keywordScore(`${row.development_project} ${row.country} ${row.operator} ${row.surf_contractor}`, combinedKeywords),
    (row) => row.year,
    900
  )

  const filteredSubsea = sortByScoreAndYear(
    subseaRows.filter((row) => {
      if (!rowWithinYear(row.year, plan.fromYear, plan.toYear)) return false
      if (!matchesOptionalFilters(row.country, row.operator, plan.countries, plan.operators)) return false
      if (!hasKeywordFilter) return true
      return keywordScore(`${row.development_project} ${row.country} ${row.operator} ${row.surf_contractor}`, combinedKeywords) > 0
    }),
    (row) => keywordScore(`${row.development_project} ${row.country} ${row.operator} ${row.surf_contractor}`, combinedKeywords),
    (row) => row.year,
    900
  )

  const filteredDocs = docs.filter((doc) => {
    if (!hasKeywordFilter) return true
    const haystack = `${doc.file_name} ${doc.ai_summary}`
    return keywordScore(haystack, combinedKeywords) > 0
  }).slice(0, 30)

  const countryRank = topCounts([
    ...filteredProjects.map((row) => row.country),
    ...filteredContracts.map((row) => row.country),
    ...filteredAwards.map((row) => row.country),
  ])

  const operatorRank = topCounts([
    ...filteredProjects.map((row) => row.operator),
    ...filteredContracts.map((row) => row.operator),
    ...filteredAwards.map((row) => row.operator),
  ])

  const projectHighlights = filteredProjects
    .slice(0, 20)
    .map((project) => ({
      project: project.development_project,
      country: project.country,
      operator: project.operator,
      contractor: project.surf_contractor,
      period: `${project.first_year ?? '?'}-${project.last_year ?? '?'}`,
      xmt_count: Number(project.xmt_count.toFixed(0)),
      surf_km: Number(project.surf_km.toFixed(1)),
      subsea_units: Number(project.subsea_unit_count.toFixed(0)),
    }))

  const contractHighlights = filteredContracts
    .slice(0, 20)
    .map((contract) => ({
      project: contract.project_name,
      country: contract.country,
      operator: contract.operator,
      supplier: contract.supplier,
      contract_type: contract.contract_type,
      phase: contract.pipeline_phase,
      date: contract.date ?? contract.announced_at,
      estimated_value_usd: contract.estimated_value_usd,
    }))

  const forecastsByMetric = Array.from(
    filteredForecasts.reduce((map, row) => {
      if (!map.has(row.metric)) map.set(row.metric, [])
      map.get(row.metric)!.push({ year: row.year, value: row.value, unit: row.unit, source: row.source })
      return map
    }, new Map<string, Array<{ year: number; value: number; unit: string; source: string }>>())
      .entries()
  )
    .map(([metric, series]) => ({
      metric,
      latest: series.sort((a, b) => b.year - a.year)[0] ?? null,
      series: series
        .sort((a, b) => a.year - b.year)
        .slice(-12),
    }))
    .slice(0, 20)

  const xmtYearly = aggregateByYear(filteredXmt, (row) => row.xmt_count)
  const surfYearly = aggregateByYear(filteredSurf, (row) => row.km_surf_lines)
  const subseaYearly = aggregateByYear(filteredSubsea, (row) => row.unit_count)
  const awardYearly = aggregateByYear(filteredAwards, (row) => row.xmts_awarded)

  const counts = {
    projects: filteredProjects.length,
    contracts: filteredContracts.length,
    forecasts: filteredForecasts.length,
    upcoming_awards: filteredAwards.length,
    xmt_data: filteredXmt.length,
    surf_data: filteredSurf.length,
    subsea_unit_data: filteredSubsea.length,
    documents: filteredDocs.length,
  }

  const inferredYears = [
    ...filteredProjects.flatMap((project) => [project.first_year, project.last_year]),
    ...filteredContracts.map((contract) => yearFromDate(contract.date) ?? yearFromDate(contract.announced_at)),
    ...filteredForecasts.map((forecast) => forecast.year),
    ...filteredAwards.map((award) => award.year),
  ].filter((year): year is number => typeof year === 'number' && Number.isFinite(year))

  const inferredFromYear = inferredYears.length ? Math.min(...inferredYears) : null
  const inferredToYear = inferredYears.length ? Math.max(...inferredYears) : null

  const fromYear = plan.fromYear ?? inferredFromYear
  const toYear = plan.toYear ?? inferredToYear

  const contextPayload: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    requested_period: {
      from_year: fromYear,
      to_year: toYear,
    },
    applied_filters: {
      countries: plan.countries,
      operators: plan.operators,
      keywords: combinedKeywords,
    },
    counts,
    totals: {
      project_xmt_count: Number(sumNumber(filteredProjects, (project) => project.xmt_count).toFixed(0)),
      project_surf_km: Number(sumNumber(filteredProjects, (project) => project.surf_km).toFixed(1)),
      project_subsea_units: Number(sumNumber(filteredProjects, (project) => project.subsea_unit_count).toFixed(0)),
      contract_estimated_value_usd: Number(sumNumber(filteredContracts, (contract) => contract.estimated_value_usd ?? 0).toFixed(0)),
      xmt_total_from_xmt_table: Number(sumNumber(filteredXmt, (row) => row.xmt_count).toFixed(0)),
      surf_total_km_from_surf_table: Number(sumNumber(filteredSurf, (row) => row.km_surf_lines).toFixed(1)),
      subsea_total_units_from_subsea_table: Number(sumNumber(filteredSubsea, (row) => row.unit_count).toFixed(0)),
      awards_total_xmts: Number(sumNumber(filteredAwards, (row) => row.xmts_awarded).toFixed(0)),
    },
    top_countries: countryRank,
    top_operators: operatorRank,
    project_highlights: projectHighlights,
    contract_highlights: contractHighlights,
    forecast_highlights: forecastsByMetric,
    xmt_by_year: xmtYearly,
    surf_by_year: surfYearly,
    subsea_units_by_year: subseaYearly,
    awards_by_year: awardYearly,
    latest_market_reports: summarizeDocs(filteredDocs),
    warnings,
  }

  return {
    fromYear,
    toYear,
    counts,
    warnings,
    contextPayload,
  }
}

function coerceAgentOutput(raw: Record<string, unknown>, fallbackAnswer: string): ModelAgentOutput {
  const answerMarkdown = toPlainChatText(
    asString(raw.answer_text || raw.answer_markdown || raw.answerMarkdown, fallbackAnswer)
  )
  const reportTitle = asString(raw.report_title || raw.reportTitle) || null
  const reportMarkdown = asString(raw.report_markdown || raw.reportMarkdown) || null
  const reportSummary = asString(raw.report_summary || raw.reportSummary) || null
  const followUps = parseStringArray(raw.follow_up_suggestions || raw.followUps)
    .map((value) => toPlainChatText(value))
    .filter((value) => value.length > 0)
    .slice(0, 4)

  return {
    answerMarkdown,
    reportTitle,
    reportMarkdown,
    reportSummary,
    followUps,
  }
}

function buildFallbackAnswer(plan: AgentPlan, data: DataSummary): string {
  const language = plan.language
  const from = data.fromYear ?? 'ukjent'
  const to = data.toYear ?? 'ukjent'

  if (language === 'no') {
    return [
      `Jeg hentet data for perioden ${from}-${to}.`,
      `Prosjekter: ${data.counts.projects}, kontrakter: ${data.counts.contracts}, forecasts: ${data.counts.forecasts}.`,
      data.warnings.length > 0
        ? `Merk: ${data.warnings.join(' | ')}`
        : 'Datauttrekket fullførte uten tabellfeil.',
    ].join('\n\n')
  }

  return [
    `I pulled data for period ${from}-${to}.`,
    `Projects: ${data.counts.projects}, contracts: ${data.counts.contracts}, forecasts: ${data.counts.forecasts}.`,
    data.warnings.length > 0
      ? `Note: ${data.warnings.join(' | ')}`
      : 'The dataset query completed without table errors.',
  ].join('\n\n')
}

function buildFallbackReportMarkdown(
  title: string,
  userRequest: string,
  answer: string,
  data: DataSummary,
  plan: AgentPlan
): string {
  const totals = asRecord(data.contextPayload.totals)

  if (plan.language === 'no') {
    return [
      `# ${title}`,
      '',
      '## Executive Summary',
      answer,
      '',
      '## Scope',
      `- Forespørsel: ${userRequest}`,
      `- Periode: ${data.fromYear ?? 'ukjent'} til ${data.toYear ?? 'ukjent'}`,
      `- Filtre: land=${plan.countries.join(', ') || 'ingen'}, operatorer=${plan.operators.join(', ') || 'ingen'}`,
      '',
      '## KPI Snapshot',
      `- Prosjekter: ${data.counts.projects}`,
      `- Kontrakter: ${data.counts.contracts}`,
      `- Forecast-punkter: ${data.counts.forecasts}`,
      `- XMT total: ${asNumber(totals.project_xmt_count) ?? 0}`,
      `- SURF km total: ${asNumber(totals.project_surf_km) ?? 0}`,
      '',
      '## Datakvalitet',
      data.warnings.length > 0
        ? data.warnings.map((warning) => `- ${warning}`).join('\n')
        : '- Ingen tekniske datatilgangsfeil registrert i denne kjøringen.',
      '',
      '## Anbefalte neste steg',
      '- Prioriter topp-prosjekter med høyest XMT/SURF i perioden.',
      '- Kryssjekk forecast-endringer mot nye kontrakter i samme region.',
      '- Kjør en ny prosjektspesifikk rapport for de 3 viktigste operatørene.',
    ].join('\n')
  }

  return [
    `# ${title}`,
    '',
    '## Executive Summary',
    answer,
    '',
    '## Scope',
    `- Request: ${userRequest}`,
    `- Period: ${data.fromYear ?? 'unknown'} to ${data.toYear ?? 'unknown'}`,
    `- Filters: countries=${plan.countries.join(', ') || 'none'}, operators=${plan.operators.join(', ') || 'none'}`,
    '',
    '## KPI Snapshot',
    `- Projects: ${data.counts.projects}`,
    `- Contracts: ${data.counts.contracts}`,
    `- Forecast records: ${data.counts.forecasts}`,
    `- XMT total: ${asNumber(totals.project_xmt_count) ?? 0}`,
    `- SURF km total: ${asNumber(totals.project_surf_km) ?? 0}`,
    '',
    '## Data Quality',
    data.warnings.length > 0
      ? data.warnings.map((warning) => `- ${warning}`).join('\n')
      : '- No technical data access warnings for this run.',
    '',
    '## Recommended Actions',
    '- Prioritize highest XMT/SURF projects in this period.',
    '- Compare forecast changes against new contracts in the same regions.',
    '- Run a follow-up operator-specific report for the top 3 operators.',
  ].join('\n')
}

async function generateAgentOutput(
  messages: AgentMessage[],
  plan: AgentPlan,
  userRequest: string,
  data: DataSummary
): Promise<ModelAgentOutput> {
  const fallbackAnswer = buildFallbackAnswer(plan, data)

  const writerPrompt = [
    'You are CSUB\'s AI analyst for subsea projects and contracts.',
    'Use ONLY the provided context JSON. Do not fabricate values.',
    'Return exactly one JSON object with this schema:',
    '{',
    '  "answer_text": "string",',
    '  "report_title": "string or null",',
    '  "report_markdown": "string or null",',
    '  "report_summary": "string or null",',
    '  "follow_up_suggestions": ["string", "string"]',
    '}',
    'Rules:',
    '- If context lacks requested data, explicitly state the gap.',
    '- Use concrete dates/years in statements.',
    '- answer_text must be plain text only. No markdown syntax such as **, #, _, backticks, or tables.',
    '- If plan.intent=report, report_markdown must be a complete structured report with sections and bullet points.',
    '- If plan.intent=question, keep report_markdown null unless user explicitly asks for PDF/report.',
    '- Language must match plan.language (no = Norwegian Bokmal, en = English).',
    '',
    `PLAN:\n${JSON.stringify(plan, null, 2)}`,
    `REQUEST:\n${userRequest}`,
    `RECENT_CHAT:\n${JSON.stringify(messages.slice(-8), null, 2)}`,
    `CONTEXT_JSON:\n${JSON.stringify(data.contextPayload, null, 2)}`,
  ].join('\n')

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-5.2',
      temperature: 0.2,
      max_completion_tokens: 6400,
      messages: [
        {
          role: 'user',
          content: writerPrompt,
        },
      ],
    })

    const content = response.choices[0]?.message?.content ?? '{}'
    const parsed = parseJsonObject(content)
    return coerceAgentOutput(parsed, fallbackAnswer)
  } catch {
    return {
      answerMarkdown: fallbackAnswer,
      reportTitle: null,
      reportMarkdown: null,
      reportSummary: null,
      followUps: [],
    }
  }
}

async function storeReport(
  userId: string,
  userEmail: string,
  requestText: string,
  title: string,
  reportMarkdown: string,
  reportSummary: string | null,
  plan: AgentPlan,
  dataSummary: DataSummary
): Promise<{ report: AgentReportResult; warning: string | null }> {
  const admin = createAdminClient()

  const createdAt = new Date().toISOString()
  const dayStamp = createdAt.slice(0, 10)
  const slug = toSlug(title)
  const fileName = `${slug}-${dayStamp}.pdf`
  const storagePath = `ai-reports/${dayStamp}/${randomUUID()}-${fileName}`

  const subtitle = plan.language === 'no'
    ? 'Skreddersydd prosjektanalyse'
    : 'Tailored project intelligence report'

  const pdfBuffer = await buildReportPdfBuffer({
    title,
    subtitle,
    requestText,
    markdown: reportMarkdown,
    generatedAt: formatDateForHumans(createdAt),
  })

  const uploadRes = await admin
    .storage
    .from('imports')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadRes.error) {
    throw new Error(`Could not upload report PDF: ${uploadRes.error.message}`)
  }

  const signedRes = await admin
    .storage
    .from('imports')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 14)

  if (signedRes.error || !signedRes.data?.signedUrl) {
    throw new Error(`Could not create signed URL for report PDF: ${signedRes.error?.message || 'unknown error'}`)
  }

  let warning: string | null = null
  let insertedId: string | null = null

  const insertRes = await admin
    .from('ai_reports')
    .insert({
      created_by: userId,
      created_by_email: userEmail,
      request_text: requestText,
      title,
      summary: reportSummary,
      report_markdown: reportMarkdown,
      report_json: {
        plan,
        coverage: {
          fromYear: dataSummary.fromYear,
          toYear: dataSummary.toYear,
          counts: dataSummary.counts,
        },
      },
      period_start: dataSummary.fromYear ? `${dataSummary.fromYear}-01-01` : null,
      period_end: dataSummary.toYear ? `${dataSummary.toYear}-12-31` : null,
      filters: {
        countries: plan.countries,
        operators: plan.operators,
        keywords: plan.projectKeywords,
      },
      storage_bucket: 'imports',
      storage_path: storagePath,
      file_name: fileName,
    })
    .select('id')
    .maybeSingle()

  if (insertRes.error) {
    warning = `Could not persist ai_reports metadata: ${insertRes.error.message}`
  } else {
    insertedId = asString(insertRes.data?.id) || null
  }

  return {
    report: {
      id: insertedId,
      title,
      fileName,
      storagePath,
      downloadUrl: signedRes.data.signedUrl,
      createdAt,
    },
    warning,
  }
}

export async function runAgentConversation(input: {
  messages: AgentMessage[]
  userId: string
  userEmail: string
}): Promise<AgentResponsePayload> {
  const sanitizedMessages = input.messages
    .map((message) => ({
      role: (message.role === 'assistant' ? 'assistant' : 'user') as AgentMessage['role'],
      content: asString(message.content),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-14)

  const latestUser = [...sanitizedMessages].reverse().find((message) => message.role === 'user')
  if (!latestUser) {
    const emptyPlan = fallbackPlan('')
    return {
      answer: emptyPlan.language === 'no'
        ? 'Jeg fikk ingen gyldig brukerforespørsel å jobbe med.'
        : 'No valid user prompt was provided.',
      report: null,
      followUps: [],
      plan: emptyPlan,
      dataCoverage: {
        fromYear: null,
        toYear: null,
        counts: {},
        warnings: [],
      },
    }
  }

  const plan = await buildAgentPlan(sanitizedMessages)
  const data = await collectAndFilterData(plan)
  const modelOutput = await generateAgentOutput(sanitizedMessages, plan, latestUser.content, data)

  let report: AgentReportResult | null = null
  const warnings = [...data.warnings]

  const shouldGenerateReport = plan.intent === 'report' || Boolean(modelOutput.reportMarkdown?.trim())

  if (shouldGenerateReport) {
    const title = modelOutput.reportTitle
      || (plan.language === 'no' ? 'CSUB AI Rapport' : 'CSUB AI Report')

    const reportMarkdown = modelOutput.reportMarkdown
      || buildFallbackReportMarkdown(title, latestUser.content, modelOutput.answerMarkdown, data, plan)

    try {
      const stored = await storeReport(
        input.userId,
        input.userEmail,
        latestUser.content,
        title,
        reportMarkdown,
        modelOutput.reportSummary,
        plan,
        data
      )

      report = stored.report
      if (stored.warning) warnings.push(stored.warning)
    } catch (error) {
      warnings.push(error instanceof Error ? `Report generation failed: ${error.message}` : 'Report generation failed')
    }
  }

  return {
    answer: modelOutput.answerMarkdown,
    report,
    followUps: modelOutput.followUps,
    plan,
    dataCoverage: {
      fromYear: data.fromYear,
      toYear: data.toYear,
      counts: data.counts,
      warnings,
    },
  }
}
