'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const MapSection = dynamic(() => import('./MapSection'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-[var(--csub-dark)] animate-pulse rounded-xl flex items-center justify-center border border-[var(--csub-light-soft)]">
      <span className="text-sm font-mono text-[var(--csub-gold)]">Laster prosjektkart...</span>
    </div>
  ),
})

interface Stats {
  totalProjects: number
  totalSurfKm: number
  totalXmts: number
  upcomingAwards: number
  regionCount: number
}

interface Charts {
  byCountry: { country: string; count: number }[]
  byPhase: { phase: string; count: number }[]
  byDepth: { depth: string; count: number }[]
  byYear: { year: number; count: number }[]
}

interface Companies {
  contractors: { name: string; count: number }[]
  operators: { name: string; count: number }[]
}

interface Project {
  development_project: string
  asset: string
  country: string
  continent: string
  operator: string
  surf_contractor: string
  facility_category: string
  water_depth_category: string
  xmt_count: number
  surf_km: number
  first_year: number
  last_year: number
  [key: string]: unknown
}

interface ForecastRecord {
  year: number
  metric: string
  value: number
  unit: string
}

interface ReportRecord {
  id: string
  file_name: string
  file_path?: string | null
  download_url?: string | null
  report_period?: string | null
  ai_summary: string | null
  created_at: string
}

type RegionFilter = 'All' | 'NorthSea' | 'GoM'
type DashboardView = 'historical' | 'future'

interface PipelinePoint {
  period: string
  value: number
}

interface ActivityItem {
  title: string
  meta: string
}

type TableSortDirection = 'asc' | 'desc'
type TableSortKey = 'project' | 'country' | 'operator' | 'contractor' | 'depth' | 'xmt' | 'surf'

interface TableSortConfig {
  key: TableSortKey
  direction: TableSortDirection
}

interface MetricTrend {
  latest: ForecastRecord | null
  previous: ForecastRecord | null
  delta: number | null
  deltaPct: number | null
}

interface PreparedReport {
  report: ReportRecord
  parsed: ParsedReport
  displayPeriod: string
  preview: string
  hasNarrative: boolean
  salesActions: string[]
}

const DONUT_COLORS = ['#4db89e', '#38917f', '#2d7368', '#c9a84c', '#7dd4bf', '#245a4e']
const REGION_COLORS = ['#5f87a8', '#7ea18b', '#b08f68', '#827fba', '#9f768f', '#6b9f9c']
const BAR_COLORS = ['#4db89e', '#38917f', '#2d7368', '#245a4e', '#7dd4bf', '#1a3c34']
const PIPELINE_FLOW = ['FEED', 'Tender', 'Award', 'Execution', 'Closed']
const DEFAULT_TABLE_ROWS = 15
const TABLE_COLUMNS: { key: TableSortKey; label: string; align?: 'left' | 'right'; width: string }[] = [
  { key: 'project', label: 'Prosjekt', width: '23%' },
  { key: 'country', label: 'Land', width: '12%' },
  { key: 'operator', label: 'Operatør', width: '16%' },
  { key: 'contractor', label: 'SURF Contractor', width: '16%' },
  { key: 'depth', label: 'Vanndybde', width: '14%' },
  { key: 'xmt', label: 'XMTs', align: 'right', width: '9%' },
  { key: 'surf', label: 'SURF km', align: 'right', width: '10%' },
]

const REGION_KEYS = [
  { key: 'europe_subsea_spend_total_usd_bn', label: 'Europe' },
  { key: 'south_america_subsea_spend_total_usd_bn', label: 'South America' },
  { key: 'north_america_subsea_spend_total_usd_bn', label: 'North America' },
  { key: 'africa_subsea_spend_total_usd_bn', label: 'Africa' },
  { key: 'asia_australia_subsea_spend_total_usd_bn', label: 'Asia/Australia' },
  { key: 'middle_east_russia_subsea_spend_total_usd_bn', label: 'Middle East/Russia' },
]

const NORTH_SEA_COUNTRIES = new Set(['norway', 'norge', 'united kingdom', 'uk', 'denmark', 'netherlands', 'germany'])
const GOM_COUNTRIES = new Set(['united states', 'usa', 'mexico', 'trinidad', 'trinidad and tobago'])
const REGION_METRIC_KEYS = new Set(REGION_KEYS.map((region) => region.key))
const GLOBAL_SPEND_METRIC_ALIASES = [
  'subsea_spend_usd_bn',
  'subsea_spending_usd_bn',
  'subsea_market_spend_total_usd_bn',
  'subsea_spend_total_usd_bn',
  'subsea_capex_usd_bn',
  'subsea_capex_total_usd_bn',
  'total_subsea_capex_usd_bn',
  'global_subsea_spend_usd_bn',
  'global_subsea_capex_usd_bn',
]
const XMT_METRIC_ALIASES = [
  'xmt_installations',
  'xmt_installations_count',
  'xmt_installs',
  'xmt_forecast_units',
  'xmt_units',
  'xmt_trees',
]
const SURF_METRIC_ALIASES = [
  'surf_installations_km',
  'surf_km',
  'surf_km_forecast',
  'surf_installations',
]
const GROWTH_METRIC_ALIASES = [
  'subsea_capex_growth_yoy_pct',
  'capex_growth_yoy_pct',
  'subsea_growth_pct',
  'yoy_growth_pct',
]
const BRENT_METRIC_ALIASES = [
  'brent_avg_usd_per_bbl',
  'brent_usd_per_bbl',
  'brent_price_usd',
]

function normalize(input: string | undefined): string {
  return (input ?? '').trim().toLowerCase()
}

function normalizeMetricName(metric: string | null | undefined): string {
  return (metric ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseNumericText(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function parseYearFromText(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/\b(19|20)\d{2}\b/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function extractJsonObjectBlock(input: string): string | null {
  const start = input.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaping = false

  for (let i = start; i < input.length; i++) {
    const char = input[i]

    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) return input.slice(start, i + 1)
    }
  }

  return null
}

function isGlobalSpendMetric(metric: string): boolean {
  const normalizedMetric = normalizeMetricName(metric)
  if (GLOBAL_SPEND_METRIC_ALIASES.includes(normalizedMetric)) return true
  if (REGION_METRIC_KEYS.has(normalizedMetric)) return false
  if (/(europe|south_america|north_america|africa|asia|australia|middle_east|russia)/.test(normalizedMetric)) {
    return false
  }

  const looksLikeGlobalSubseaSpend =
    normalizedMetric.includes('subsea') &&
    (normalizedMetric.includes('spend') || normalizedMetric.includes('capex')) &&
    (normalizedMetric.includes('usd') || normalizedMetric.includes('bn'))

  return looksLikeGlobalSubseaSpend
}

function isXmtMetric(metric: string): boolean {
  const normalizedMetric = normalizeMetricName(metric)
  if (XMT_METRIC_ALIASES.includes(normalizedMetric)) return true
  return normalizedMetric.includes('xmt') && (
    normalizedMetric.includes('install') ||
    normalizedMetric.includes('unit') ||
    normalizedMetric.includes('count')
  )
}

function isSurfMetric(metric: string): boolean {
  const normalizedMetric = normalizeMetricName(metric)
  if (SURF_METRIC_ALIASES.includes(normalizedMetric)) return true
  return normalizedMetric.includes('surf') && (
    normalizedMetric.includes('km') ||
    normalizedMetric.includes('install') ||
    normalizedMetric.includes('line')
  )
}

function isGrowthMetric(metric: string): boolean {
  const normalizedMetric = normalizeMetricName(metric)
  if (GROWTH_METRIC_ALIASES.includes(normalizedMetric)) return true
  return (normalizedMetric.includes('growth') || normalizedMetric.includes('yoy')) &&
    (normalizedMetric.includes('subsea') || normalizedMetric.includes('capex') || normalizedMetric.includes('spend'))
}

function isBrentMetric(metric: string): boolean {
  const normalizedMetric = normalizeMetricName(metric)
  if (BRENT_METRIC_ALIASES.includes(normalizedMetric)) return true
  return normalizedMetric.includes('brent') && (
    normalizedMetric.includes('usd') ||
    normalizedMetric.includes('bbl') ||
    normalizedMetric.includes('barrel')
  )
}

function getMetricPriorityIndex(metric: string, preferredMetrics: string[]): number {
  const normalizedMetric = normalizeMetricName(metric)
  const index = preferredMetrics.findIndex((item) => normalizeMetricName(item) === normalizedMetric)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function pickMetricByPriority(source: ForecastRecord[], preferredMetrics: string[]): ForecastRecord | null {
  if (!source.length) return null
  if (!preferredMetrics.length) return source[0]

  const sorted = [...source].sort((a, b) => {
    const aPriority = getMetricPriorityIndex(a.metric, preferredMetrics)
    const bPriority = getMetricPriorityIndex(b.metric, preferredMetrics)
    if (aPriority !== bPriority) return aPriority - bPriority
    return normalizeMetricName(a.metric).localeCompare(normalizeMetricName(b.metric))
  })

  return sorted[0] ?? null
}

function buildMetricSeriesByYear(
  source: ForecastRecord[],
  matcher: (metric: string) => boolean,
  preferredMetrics: string[]
): ForecastRecord[] {
  const perYear = new Map<number, ForecastRecord[]>()

  source.forEach((forecast) => {
    if (!matcher(forecast.metric)) return
    if (!perYear.has(forecast.year)) perYear.set(forecast.year, [])
    perYear.get(forecast.year)!.push(forecast)
  })

  return Array.from(perYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, records]) => pickMetricByPriority(records, preferredMetrics))
    .filter((record): record is ForecastRecord => Boolean(record))
}

function parseYearValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric) && numeric > 1900 && numeric < 2200) return numeric
    const date = new Date(trimmed)
    if (!Number.isNaN(date.getTime())) return date.getUTCFullYear()
  }
  return null
}

function getProjectYear(project: Project): number | null {
  const candidates: unknown[] = [
    project.first_year,
    project.last_year,
    project.award_date,
    project.created_at,
  ]

  for (const candidate of candidates) {
    const parsed = parseYearValue(candidate)
    if (parsed) return parsed
  }

  return null
}

function buildProjectKey(project: Project): string {
  const raw = `${project.development_project || project.asset || 'project'}-${project.country || 'country'}-${project.first_year || project.last_year || 'year'}-${project.operator || 'operator'}`
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function getTableSortValue(project: Project, key: TableSortKey): string | number {
  switch (key) {
    case 'project':
      return normalize(project.development_project || project.asset || '')
    case 'country':
      return normalize(project.country)
    case 'operator':
      return normalize(project.operator)
    case 'contractor':
      return normalize(project.surf_contractor)
    case 'depth':
      return normalize(project.water_depth_category)
    case 'xmt':
      return Number(project.xmt_count || 0)
    case 'surf':
      return Number(project.surf_km || 0)
    default:
      return ''
  }
}

function compareProjectsForSort(a: Project, b: Project, sort: TableSortConfig): number {
  const left = getTableSortValue(a, sort.key)
  const right = getTableSortValue(b, sort.key)

  if (typeof left === 'number' && typeof right === 'number') {
    const base = left - right
    if (base === 0) return 0
    return sort.direction === 'asc' ? base : -base
  }

  const leftText = String(left)
  const rightText = String(right)
  const base = leftText.localeCompare(rightText, 'nb', { sensitivity: 'base', numeric: true })
  if (base === 0) return 0
  return sort.direction === 'asc' ? base : -base
}

function getTableSortIndicator(sort: TableSortConfig | null, key: TableSortKey): string {
  if (!sort || sort.key !== key) return ''
  return sort.direction === 'asc' ? 'ASC' : 'DESC'
}

function getUserDisplayName(email: string | undefined): string {
  if (!email) return 'Innlogget bruker'
  return email
}

function getInitials(value: string): string {
  const source = value.includes('@') ? value.split('@')[0] : value
  const cleaned = source.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
  if (!cleaned) return 'U'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function buildChartsFromProjects(source: Project[]): Charts {
  const countryMap = new Map<string, number>()
  const phaseMap = new Map<string, number>()
  const depthMap = new Map<string, number>()
  const yearMap = new Map<number, number>()

  source.forEach((project) => {
    if (project.country) countryMap.set(project.country, (countryMap.get(project.country) ?? 0) + 1)
    const phase = project.facility_category || 'Unknown'
    phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + 1)
    const depth = project.water_depth_category || 'Unknown'
    depthMap.set(depth, (depthMap.get(depth) ?? 0) + 1)
    const year = getProjectYear(project)
    if (year) yearMap.set(year, (yearMap.get(year) ?? 0) + 1)
  })

  return {
    byCountry: Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    byPhase: Array.from(phaseMap.entries())
      .map(([phase, count]) => ({ phase, count }))
      .sort((a, b) => b.count - a.count),
    byDepth: Array.from(depthMap.entries())
      .map(([depth, count]) => ({ depth, count }))
      .sort((a, b) => b.count - a.count),
    byYear: Array.from(yearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
  }
}

function buildCompaniesFromProjects(source: Project[]): Companies {
  const contractorMap = new Map<string, number>()
  const operatorMap = new Map<string, number>()

  source.forEach((project) => {
    if (project.surf_contractor) {
      contractorMap.set(project.surf_contractor, (contractorMap.get(project.surf_contractor) ?? 0) + 1)
    }
    if (project.operator) {
      operatorMap.set(project.operator, (operatorMap.get(project.operator) ?? 0) + 1)
    }
  })

  return {
    contractors: Array.from(contractorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    operators: Array.from(operatorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  }
}

function belongsToRegion(project: Project, region: RegionFilter): boolean {
  if (region === 'All') return true
  const country = normalize(project.country)
  if (region === 'NorthSea') return NORTH_SEA_COUNTRIES.has(country)
  return GOM_COUNTRIES.has(country)
}

function buildPipelineByYear(source: Project[]): PipelinePoint[] {
  const pipelineByYear = new Map<number, number>()

  source.forEach((project) => {
    const year = getProjectYear(project)
    if (!year) return
    const surfValue = Math.max(0, project.surf_km || 0) * 1_000_000
    const xmtValue = Math.max(0, project.xmt_count || 0) * 120_000
    const estimatedValue = surfValue + xmtValue
    pipelineByYear.set(year, (pipelineByYear.get(year) ?? 0) + estimatedValue)
  })

  return Array.from(pipelineByYear.entries())
    .map(([year, value]) => ({ period: String(year), value }))
    .sort((a, b) => Number(a.period) - Number(b.period))
}

function formatMillions(value: number): string {
  return `$${(value / 1_000_000).toFixed(1)}M`
}

interface ParsedReport {
  title: string | null
  highlights: string[]
  keyFigures: { label: string; value: string }[]
  narrative: string
}

function parseReportSummary(summary: string | null): ParsedReport {
  const empty: ParsedReport = { title: null, highlights: [], keyFigures: [], narrative: '' }
  if (!summary) return empty

  try {
    const content = summary.trim()
    const headingMatch = content.match(/^##\s+(.+)$/m)
    let title = headingMatch ? headingMatch[1].trim() : null

    const keyFigureSectionMatch = content.match(/###\s*Key Figures[\s\S]*$/i)
    const keyFigureSection = keyFigureSectionMatch ? keyFigureSectionMatch[0] : ''
    const keyFigureJsonMatch = keyFigureSection.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const keyFigureJson = keyFigureJsonMatch?.[1] || extractJsonObjectBlock(keyFigureSection) || null

    const keyFigures: { label: string; value: string }[] = []
    if (keyFigureJson) {
      try {
        const parsed = JSON.parse(keyFigureJson)
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [key, val] of Object.entries(parsed)) {
            if (keyFigures.length >= 6) break
            const label = key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            keyFigures.push({ label, value: String(val) })
          }
        }
      } catch {
        // JSON parse failed, skip
      }
    }

    const bulletMatches = content.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/gm) || []
    let highlights = bulletMatches
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trim())
      .filter((line) => line.length > 18)
      .slice(0, 4)

    const narrativeBase = content
      .replace(/###\s*Key Figures[\s\S]*$/i, '')
      .replace(/^##\s+.*$/gm, '')
      .replace(/^###\s+.*$/gm, '')
      .trim()

    if (!highlights.length) {
      highlights = narrativeBase
        .split(/\n\n+/)
        .map((block) => block.trim())
        .filter((block) => block.length > 20)
        .map((block) => {
          const sentence = block.match(/^[^.!?]+[.!?]/)
          return sentence ? sentence[0].trim() : `${block.slice(0, 140).trim()}…`
        })
        .slice(0, 4)
    }

    const narrative = narrativeBase
      .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!title) {
      const jsonBlock = extractJsonObjectBlock(content)
      if (jsonBlock) {
        try {
          const parsed = JSON.parse(jsonBlock) as Record<string, unknown>
          if (typeof parsed.report_period === 'string' && parsed.report_period.trim()) {
            title = parsed.report_period.trim()
          }
        } catch {
          // ignore JSON parse fallback errors
        }
      }
    }

    return { title, highlights, keyFigures, narrative }
  } catch {
    // Fallback: truncated text
    return {
      title: null,
      highlights: [summary.slice(0, 200) + (summary.length > 200 ? '…' : '')],
      keyFigures: [],
      narrative: summary,
    }
  }
}

function inferReportPeriodFromFileName(fileName: string): string | null {
  const source = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  if (!source) return null

  const quarterMatch = source.match(/\bq([1-4])\s*(20\d{2}|\d{2})\b/i) || source.match(/\b(20\d{2})\s*q([1-4])\b/i)
  if (quarterMatch) {
    if (/^q/i.test(quarterMatch[0])) {
      const year = quarterMatch[2].length === 2 ? `20${quarterMatch[2]}` : quarterMatch[2]
      return `Q${quarterMatch[1]} ${year}`
    }
    return `Q${quarterMatch[2]} ${quarterMatch[1]}`
  }

  const yearMatch = source.match(/\b(20\d{2})\b/)
  if (yearMatch) return yearMatch[1]
  return null
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength).trimEnd()}…`
}

function buildMetricTrend(series: ForecastRecord[]): MetricTrend {
  if (!series.length) return { latest: null, previous: null, delta: null, deltaPct: null }
  const latest = series[series.length - 1] ?? null
  const previous = series.length > 1 ? series[series.length - 2] : null
  if (!latest || !previous) {
    return { latest, previous, delta: null, deltaPct: null }
  }

  const delta = latest.value - previous.value
  const deltaPct = previous.value !== 0 ? (delta / previous.value) * 100 : null

  return { latest, previous, delta, deltaPct }
}

function buildTrendLabel(trend: MetricTrend, formatter: (value: number) => string): string | null {
  if (!trend.previous || trend.delta === null) return null
  const sign = trend.delta > 0 ? '+' : trend.delta < 0 ? '-' : ''
  const deltaLabel = formatter(Math.abs(trend.delta))
  const pctLabel = trend.deltaPct === null ? '' : ` (${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct.toFixed(1)}%)`
  return `vs ${trend.previous.year}: ${sign}${deltaLabel}${pctLabel}`
}

function getTrendTone(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta === null || Math.abs(delta) < 0.001) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

function buildSalesActions(parsed: ParsedReport): string[] {
  const corpus = `${parsed.title ?? ''} ${parsed.highlights.join(' ')} ${parsed.narrative}`.toLowerCase()
  const actions: string[] = []

  if (/(north sea|nordsj|norway|uk|europe)/.test(corpus)) {
    actions.push('Prioriter account-oppfolging i Nordsjoen de neste 2 ukene.')
  }
  if (/(gulf|gom|mexico|north america|usa)/.test(corpus)) {
    actions.push('Aktiver GoM-operatorer med tidlige salgsmoter og qualification.')
  }
  if (/(award|tender|bid|fid|sanction)/.test(corpus)) {
    actions.push('Legg inn tender/award-watchlist og oppdater sannsynlighet i CRM.')
  }
  if (/(xmt|tree)/.test(corpus)) {
    actions.push('Koble inn XMT-team for scope-estimat mot hoyeste sannsynlige prosjekter.')
  }
  if (/(surf|umbilical|flowline|pipeline)/.test(corpus)) {
    actions.push('Planlegg SURF-kapasitet tidlig for regionene med stigende spend.')
  }

  if (!actions.length) {
    if (parsed.highlights.length > 0) {
      actions.push(`Fokuser salgspitch pa signalet: "${truncateText(parsed.highlights[0], 90)}"`)
    }
    actions.push('Oppdater account-plan for topp 5 kunder basert pa rapporten.')
    actions.push('Del relevante KPIer i neste forecast-mote for felles prioritering.')
  }

  return actions.slice(0, 3)
}

function formatReportDate(dateValue: string): string {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return 'Ukjent dato'
  return parsed.toLocaleDateString('nb-NO')
}

function LoadingPlaceholder({ text = 'Laster...' }: { text?: string }) {
  return <div className="text-center py-6 text-sm text-[var(--text-muted)] animate-pulse">{text}</div>
}

function PipelineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value ?? 0
  const value = typeof raw === 'number' ? raw : Number(raw)

  return (
    <div className="bg-[var(--csub-dark)] text-white p-3 rounded-lg shadow-xl border border-[var(--csub-gold-soft)]">
      <p className="font-sans text-sm mb-1 text-gray-300">{label}</p>
      <p className="font-mono text-[var(--csub-gold)] text-lg font-semibold">{formatMillions(value)}</p>
    </div>
  )
}

function CompactTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value ?? 0
  const value = typeof raw === 'number' ? raw : Number(raw)

  return (
    <div className="bg-[var(--csub-dark)] p-3 rounded-lg border border-[var(--csub-light-soft)] shadow-xl">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="font-mono text-base text-white">{value.toLocaleString('en-US')}</p>
    </div>
  )
}

export default function Dashboard({ userEmail }: { userEmail?: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [highlightedProjectKey, setHighlightedProjectKey] = useState<string | null>(null)
  const [lang, setLang] = useState<'no' | 'en'>('no')
  const [region, setRegion] = useState<RegionFilter>('All')
  const [view, setView] = useState<DashboardView>('historical')
  const [tableSort, setTableSort] = useState<TableSortConfig | null>(null)
  const [showAllTableRows, setShowAllTableRows] = useState(false)

  // Market Intelligence state
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([])
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [marketLoading, setMarketLoading] = useState(true)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [reportDeletePendingId, setReportDeletePendingId] = useState<string | null>(null)
  const [reportDeleteConfirmId, setReportDeleteConfirmId] = useState<string | null>(null)
  const [reportDeleteError, setReportDeleteError] = useState<string | null>(null)
  const [reportDeleteNotice, setReportDeleteNotice] = useState<string | null>(null)

  const userLabel = getUserDisplayName(userEmail)
  const userInitials = getInitials(userLabel)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/projects')
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || `Dashboard API failed with status ${response.status}`)
      }
      if (!Array.isArray(payload)) {
        throw new Error('Dashboard API returned invalid format')
      }
      setProjects(payload)
      setLoadError(null)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      setLoadError(error instanceof Error ? error.message : 'Unknown dashboard loading error')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!highlightedProjectKey) return
    const timeout = window.setTimeout(() => setHighlightedProjectKey(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [highlightedProjectKey])

  useEffect(() => {
    setShowAllTableRows(false)
  }, [searchQuery, region, view])

  const fetchMarketData = useCallback(async () => {
    setMarketLoading(true)

    try {
      const res = await fetch('/api/dashboard/reports')
      if (!res.ok) throw new Error(`Reports API returned ${res.status}`)
      const data = await res.json()

      const normalizedForecasts: ForecastRecord[] = (Array.isArray(data?.forecasts) ? data.forecasts : [])
        .map((row: unknown) => {
          const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
          return {
            year: Number(record.year),
            metric: String(record.metric ?? ''),
            value: Number(record.value),
            unit: String(record.unit ?? ''),
          }
        })
        .filter((row: ForecastRecord) => Number.isFinite(row.year) && Number.isFinite(row.value) && row.metric.length > 0)

      const normalizedReports: ReportRecord[] = (Array.isArray(data?.reports) ? data.reports : [])
        .map((row: unknown) => {
          const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
          return {
            id: String(record.id ?? ''),
            file_name: String(record.file_name ?? ''),
            file_path: typeof record.file_path === 'string' ? record.file_path : null,
            download_url: typeof record.download_url === 'string' ? record.download_url : null,
            report_period: typeof record.report_period === 'string' ? record.report_period : null,
            ai_summary: typeof record.ai_summary === 'string' ? record.ai_summary : null,
            created_at: String(record.created_at ?? ''),
          }
        })
        .filter((row: ReportRecord) => row.id.length > 0 && row.file_name.length > 0)

      setForecasts(normalizedForecasts)
      setReports(normalizedReports)
    } catch (error) {
      console.error('Failed to load market intelligence:', error)
      setForecasts([])
      setReports([])
    } finally {
      setMarketLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMarketData()
  }, [fetchMarketData])

  // Derived market data
  const spendingByYear = useMemo(() => {
    return buildMetricSeriesByYear(forecasts, isGlobalSpendMetric, GLOBAL_SPEND_METRIC_ALIASES)
  }, [forecasts])

  const xmtByYear = useMemo(() => {
    return buildMetricSeriesByYear(forecasts, isXmtMetric, XMT_METRIC_ALIASES)
  }, [forecasts])

  const surfByYear = useMemo(() => {
    return buildMetricSeriesByYear(forecasts, isSurfMetric, SURF_METRIC_ALIASES)
  }, [forecasts])

  const growthByYear = useMemo(() => {
    return buildMetricSeriesByYear(forecasts, isGrowthMetric, GROWTH_METRIC_ALIASES)
  }, [forecasts])

  const brentByYear = useMemo(() => {
    return buildMetricSeriesByYear(forecasts, isBrentMetric, BRENT_METRIC_ALIASES)
  }, [forecasts])

  const regionalSpendData = useMemo(() => {
    const regionLookup = new Map<string, string>(
      REGION_KEYS.map((item) => [normalizeMetricName(item.key), item.label])
    )
    const yearMap = new Map<number, Record<string, number>>()
    for (const f of forecasts) {
      const regionLabel = regionLookup.get(normalizeMetricName(f.metric))
      if (!regionLabel) continue
      if (!yearMap.has(f.year)) yearMap.set(f.year, {})
      const entry = yearMap.get(f.year)!
      entry[regionLabel] = f.value
    }
    return Array.from(yearMap.entries())
      .map(([year, regions]) => ({ year, ...regions }))
      .sort((a, b) => a.year - b.year)
  }, [forecasts])

  const reportInsights = useMemo<PreparedReport[]>(() => {
    return reports.map((report) => {
      const parsed = parseReportSummary(report.ai_summary)
      const displayPeriod =
        report.report_period?.trim() ||
        parsed.title?.trim() ||
        inferReportPeriodFromFileName(report.file_name) ||
        report.file_name
      const previewSource = parsed.highlights[0] || parsed.narrative || report.file_name

      return {
        report,
        parsed,
        displayPeriod,
        preview: truncateText(previewSource, 150),
        hasNarrative: parsed.narrative.length > 0 || Boolean(report.ai_summary?.trim()),
        salesActions: buildSalesActions(parsed),
      }
    })
  }, [reports])

  useEffect(() => {
    if (!reportInsights.length) {
      if (selectedReportId !== null) setSelectedReportId(null)
      setExpandedReport(null)
      return
    }

    if (!selectedReportId || !reportInsights.some((item) => item.report.id === selectedReportId)) {
      setSelectedReportId(reportInsights[0].report.id)
    }
  }, [reportInsights, selectedReportId])

  useEffect(() => {
    setExpandedReport(null)
  }, [selectedReportId])

  useEffect(() => {
    if (!reportDeleteNotice) return
    const timeout = window.setTimeout(() => setReportDeleteNotice(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [reportDeleteNotice])

  const selectedReportInsight = useMemo(() => {
    if (!reportInsights.length) return null
    if (!selectedReportId) return reportInsights[0]
    return reportInsights.find((item) => item.report.id === selectedReportId) ?? reportInsights[0]
  }, [reportInsights, selectedReportId])

  const reportDeleteCandidate = useMemo(() => {
    if (!reportDeleteConfirmId) return null
    return reportInsights.find((item) => item.report.id === reportDeleteConfirmId) ?? null
  }, [reportDeleteConfirmId, reportInsights])

  const regionalSummary = useMemo(() => {
    if (!regionalSpendData.length) return null
    const latest = regionalSpendData[regionalSpendData.length - 1]
    const previous = regionalSpendData.length > 1 ? regionalSpendData[regionalSpendData.length - 2] : null
    const latestValues = latest as Record<string, number>
    const previousValues = previous as Record<string, number> | null

    const values = REGION_KEYS.map((region) => {
      const current = latestValues[region.label]
      return {
        label: region.label,
        value: typeof current === 'number' && Number.isFinite(current) ? current : 0,
      }
    }).filter((item) => item.value > 0)

    const total = values.reduce((sum, item) => sum + item.value, 0)
    const previousTotal = previous
      ? REGION_KEYS.reduce((sum, region) => {
          const prior = previousValues?.[region.label]
          return sum + (typeof prior === 'number' && Number.isFinite(prior) ? prior : 0)
        }, 0)
      : null

    const yoyDelta = previousTotal !== null ? total - previousTotal : null
    const yoyPct = previousTotal !== null && previousTotal !== 0 ? (yoyDelta! / previousTotal) * 100 : null
    const sorted = [...values].sort((a, b) => b.value - a.value)
    const topRegion = sorted[0] ?? null

    return {
      latestYear: latest.year,
      previousYear: previous?.year ?? null,
      total,
      yoyDelta,
      yoyPct,
      topRegion,
      coverageCount: values.length,
      topShares: sorted.slice(0, 4).map((item) => ({
        ...item,
        share: total > 0 ? (item.value / total) * 100 : 0,
      })),
    }
  }, [regionalSpendData])

  const marketMeta = useMemo(() => {
    const years = Array.from(new Set(forecasts.map((forecast) => forecast.year)))
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => a - b)

    const forecastCoverage =
      years.length > 1
        ? `${years[0]}-${years[years.length - 1]}`
        : years.length === 1
          ? String(years[0])
          : '—'

    const latestReportDate = reports[0]?.created_at ? formatReportDate(reports[0].created_at) : '—'

    return {
      forecastCoverage,
      latestReportDate,
    }
  }, [forecasts, reports])

  const latestMetrics = useMemo(() => {
    const latestReport = reportInsights.find((item) => Boolean(item.report.ai_summary?.trim()))
    const parsedLatestReport = latestReport?.parsed ?? {
      title: null,
      highlights: [],
      keyFigures: [],
      narrative: '',
    }

    const getFromReportFigures = (aliases: string[]) => {
      const normalizedAliases = aliases.map((alias) => normalizeMetricName(alias))

      for (const figure of parsedLatestReport.keyFigures) {
        const value = parseNumericText(figure.value)
        if (value === null) continue

        const normalizedLabel = normalizeMetricName(figure.label)
        const isMatch = normalizedAliases.some(
          (alias) => normalizedLabel.includes(alias) || alias.includes(normalizedLabel)
        )

        if (isMatch) {
          return { value, unit: '' }
        }
      }

      return null
    }

    const maxYear = forecasts.length ? Math.max(...forecasts.map((f) => f.year)) : null
    const latest = maxYear !== null ? forecasts.filter((f) => f.year === maxYear) : []
    const getFromForecasts = (
      matcher: (metric: string) => boolean,
      preferredMetrics: string[]
    ) => {
      const candidates = latest.filter((item) => matcher(item.metric))
      const picked = pickMetricByPriority(candidates, preferredMetrics)
      return picked ? { value: picked.value, unit: picked.unit } : null
    }

    const spend = getFromForecasts(isGlobalSpendMetric, GLOBAL_SPEND_METRIC_ALIASES) ??
      getFromReportFigures(['subsea_spend_usd_bn', 'total_subsea_capex_usd_bn'])
    const xmt = getFromForecasts(isXmtMetric, XMT_METRIC_ALIASES) ??
      getFromReportFigures(['xmt_installations', 'xmt_forecast_units'])
    const surf = getFromForecasts(isSurfMetric, SURF_METRIC_ALIASES) ??
      getFromReportFigures(['surf_km', 'surf_km_forecast'])
    const growth = getFromForecasts(isGrowthMetric, GROWTH_METRIC_ALIASES) ??
      getFromReportFigures(['subsea_capex_growth_yoy_pct', 'yoy_growth_pct'])
    const brent = getFromForecasts(isBrentMetric, BRENT_METRIC_ALIASES) ??
      getFromReportFigures(['brent_avg_usd_per_bbl', 'brent_price_usd'])

    if (!spend && !xmt && !surf && !growth && !brent) return null

    const fallbackYear =
      parseYearFromText(latestReport?.displayPeriod ?? parsedLatestReport.title ?? '') ??
      new Date().getFullYear()

    return {
      year: maxYear ?? fallbackYear,
      spend,
      xmt,
      surf,
      growth,
      brent,
    }
  }, [forecasts, reportInsights])

  const keyMetricCards = useMemo(() => {
    if (!latestMetrics) return []

    const spendTrend = buildMetricTrend(spendingByYear)
    const xmtTrend = buildMetricTrend(xmtByYear)
    const surfTrend = buildMetricTrend(surfByYear)
    const growthTrend = buildMetricTrend(growthByYear)
    const brentTrend = buildMetricTrend(brentByYear)

    const growthTrendLabel = growthTrend.previous && growthTrend.delta !== null
      ? `vs ${growthTrend.previous.year}: ${growthTrend.delta > 0 ? '+' : ''}${growthTrend.delta.toFixed(1)} pp`
      : null

    return [
      {
        label: 'Total Subsea Spend',
        source: 'Market Reports',
        data: latestMetrics.spend,
        fmt: (v: number) => `$${v.toFixed(1)}B`,
        trendLabel: buildTrendLabel(spendTrend, (v) => `$${v.toFixed(1)}B`),
        trendTone: getTrendTone(spendTrend.delta),
      },
      {
        label: 'XMT Installations',
        source: 'Market Reports',
        data: latestMetrics.xmt,
        fmt: (v: number) => Math.round(v).toLocaleString('en-US'),
        trendLabel: buildTrendLabel(xmtTrend, (v) => Math.round(v).toLocaleString('en-US')),
        trendTone: getTrendTone(xmtTrend.delta),
      },
      {
        label: 'SURF km',
        source: 'Market Reports',
        data: latestMetrics.surf,
        fmt: (v: number) => `${Math.round(v).toLocaleString('en-US')} km`,
        trendLabel: buildTrendLabel(surfTrend, (v) => `${Math.round(v).toLocaleString('en-US')} km`),
        trendTone: getTrendTone(surfTrend.delta),
      },
      {
        label: 'YoY Growth',
        source: 'Market Reports',
        data: latestMetrics.growth,
        fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
        trendLabel: growthTrendLabel,
        trendTone: getTrendTone(growthTrend.delta),
      },
      {
        label: 'Brent Oil Price',
        source: 'Market Reports',
        data: latestMetrics.brent,
        fmt: (v: number) => `$${v.toFixed(0)}/bbl`,
        trendLabel: buildTrendLabel(brentTrend, (v) => `$${v.toFixed(0)}/bbl`),
        trendTone: getTrendTone(brentTrend.delta),
      },
    ].filter((item) => item.data !== null)
  }, [brentByYear, growthByYear, latestMetrics, spendingByYear, surfByYear, xmtByYear])

  const reportStats = useMemo(() => {
    return {
      totalReports: reports.length,
      withSummary: reports.filter((report) => Boolean(report.ai_summary?.trim())).length,
      withPdf: reports.filter((report) => Boolean(report.download_url)).length,
      forecastPoints: forecasts.length,
      latestReportDate: marketMeta.latestReportDate,
    }
  }, [forecasts.length, marketMeta.latestReportDate, reports])

  const regionProjects = useMemo(
    () => projects.filter((project) => belongsToRegion(project, region)),
    [projects, region]
  )

  const currentYear = new Date().getFullYear()

  const viewProjects = useMemo(() => {
    return regionProjects.filter((project) => {
      const year = getProjectYear(project)
      if (!year) return view === 'historical'
      if (view === 'historical') return year <= currentYear
      return year > currentYear
    })
  }, [regionProjects, view, currentYear])

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return viewProjects
    const query = searchQuery.toLowerCase()
    return viewProjects.filter((project) =>
      Object.values(project).some((value) => String(value).toLowerCase().includes(query))
    )
  }, [viewProjects, searchQuery])

  const sortedProjects = useMemo(() => {
    if (!tableSort) return filteredProjects

    return filteredProjects
      .map((project, index) => ({ project, index }))
      .sort((a, b) => {
        const primary = compareProjectsForSort(a.project, b.project, tableSort)
        if (primary !== 0) return primary
        return a.index - b.index
      })
      .map((item) => item.project)
  }, [filteredProjects, tableSort])

  const visibleProjects = useMemo(() => {
    if (showAllTableRows) return sortedProjects
    return sortedProjects.slice(0, DEFAULT_TABLE_ROWS)
  }, [showAllTableRows, sortedProjects])

  const hasMoreTableRows = sortedProjects.length > DEFAULT_TABLE_ROWS

  const liveSearchResults = useMemo(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return []
    const query = trimmed.toLowerCase()
    return viewProjects
      .filter((project) => {
        const fields = [
          project.development_project,
          project.asset,
          project.operator,
          project.surf_contractor,
          project.country,
        ]
        return fields.some((field) => normalize(field).includes(query))
      })
      .slice(0, 8)
  }, [viewProjects, searchQuery])

  const viewCharts = useMemo(() => buildChartsFromProjects(viewProjects), [viewProjects])
  const viewCompanies = useMemo(() => buildCompaniesFromProjects(viewProjects), [viewProjects])

  const computedStats = useMemo<Stats>(() => {
    const continents = new Set<string>()
    let totalSurfKm = 0
    let totalXmts = 0

    viewProjects.forEach((project) => {
      if (project.continent) continents.add(project.continent)
      totalSurfKm += project.surf_km || 0
      totalXmts += project.xmt_count || 0
    })

    const upcomingAwards = viewProjects.filter((project) => {
      const year = getProjectYear(project) || 0
      if (view === 'historical') return year >= currentYear - 1 && year <= currentYear
      return year >= currentYear
    }).length

    return {
      totalProjects: viewProjects.length,
      totalSurfKm: Math.round(totalSurfKm),
      totalXmts: Math.round(totalXmts),
      upcomingAwards,
      regionCount: continents.size,
    }
  }, [viewProjects, view, currentYear])

  const pipelineData = useMemo(() => buildPipelineByYear(viewProjects), [viewProjects])

  const pipelineFlowData = useMemo(() => {
    const phases = viewCharts.byPhase
    return PIPELINE_FLOW.map((label, index) => {
      if (label === 'FEED') return { label, value: viewProjects.length }
      const query = label.toLowerCase()
      const value = phases
        .filter((phase) => normalize(phase.phase).includes(query))
        .reduce((sum, phase) => sum + phase.count, 0)
      return { label, value: value || (index === 1 ? Math.round(viewProjects.length * 0.6) : 0) }
    })
  }, [viewCharts.byPhase, viewProjects.length])

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const timeline = ['2 timer siden', '5 timer siden', '1 dag siden', '2 dager siden', '3 dager siden']
    const selected = filteredProjects.slice(0, 5)
    if (!selected.length) return []
    return selected.map((project, index) => ({
      title: `${project.development_project || 'Ukjent prosjekt'} - ${project.country || 'Ukjent marked'}`,
      meta: `${project.operator || project.surf_contractor || 'CSUB team'} • ${timeline[index] ?? 'Nylig'}`,
    }))
  }, [filteredProjects])

  const openDrawer = (project: Project) => {
    setSelectedProject(project)
    setDrawerOpen(true)
  }

  const deleteMarketReport = useCallback(async (reportId: string) => {
    setReportDeletePendingId(reportId)
    setReportDeleteError(null)
    setReportDeleteNotice(null)

    try {
      const response = await fetch('/api/dashboard/reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Sletting feilet (${response.status})`)
      }

      setReports((current) => current.filter((report) => report.id !== reportId))
      setExpandedReport((current) => (current === reportId ? null : current))
      setSelectedReportId((current) => (current === reportId ? null : current))
      setReportDeleteNotice('Rapporten ble slettet.')
      setReportDeleteConfirmId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setReportDeleteError(message)
    } finally {
      setReportDeletePendingId(null)
    }
  }, [])

  const handleTableSort = (key: TableSortKey) => {
    setTableSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' }
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' }
      }
      return null
    })
  }

  const openFromSearch = (project: Project) => {
    const projectKey = buildProjectKey(project)
    setHighlightedProjectKey(projectKey)
    setShowAllTableRows(true)
    setSearchQuery(project.development_project || project.asset || '')
    openDrawer(project)
    window.requestAnimationFrame(() => {
      document.getElementById(`project-row-${projectKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setTimeout(() => setSelectedProject(null), 300)
  }

  const viewLabel = view === 'historical' ? 'Historiske Contract Awards' : 'Kommende Prosjekter'
  const regionalTotal = regionalSummary?.total ?? 0
  const regionalYoyDelta = regionalSummary?.yoyDelta ?? null
  const regionalTopRegion = regionalSummary?.topRegion ?? null

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] text-gray-100">
      <header className="sticky top-0 z-50 border-b border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.95)] backdrop-blur">
        <div className="max-w-[1600px] mx-auto h-16 px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/csub-logo.svg"
              alt="CSUB logo"
              width={132}
              height={34}
              priority
              className="h-7 md:h-8 w-auto"
            />
            <span className="hidden sm:block text-xs text-[var(--csub-light)] uppercase tracking-[0.2em]">Sales Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full overflow-hidden border border-[var(--csub-light-soft)] bg-[var(--csub-dark)]">
              <button
                onClick={() => setLang('no')}
                className={`px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${lang === 'no' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)]' : 'text-[var(--text-muted)] hover:text-white'}`}
              >
                NO
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${lang === 'en' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)]' : 'text-[var(--text-muted)] hover:text-white'}`}
              >
                EN
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-full bg-[var(--csub-dark)] border border-[var(--csub-light-soft)] px-3 py-1.5">
              <div className="w-7 h-7 rounded-full bg-[var(--csub-gold)] text-[var(--csub-dark)] grid place-items-center text-xs font-bold">
                {userInitials}
              </div>
              <span className="text-xs">{userLabel}</span>
              <a
                href="/auth/logout"
                className="ml-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-white"
              >
                Logg ut
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8">
        {loadError && (
          <section className="rounded-xl border border-[var(--csub-gold-soft)] bg-[color:rgba(201,168,76,0.1)] px-4 py-3 text-sm text-[var(--csub-gold)] font-mono">
            Datafeil: {loadError}
          </section>
        )}

        <section className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Sok i kontrakter, prosjekter, nyheter..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-[var(--csub-light-soft)] bg-[var(--csub-dark)] px-4 py-3 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--csub-gold)]"
            />
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-[calc(100%+10px)] left-0 right-0 z-40 rounded-xl border border-[var(--csub-light-soft)] bg-[var(--csub-dark)] shadow-xl overflow-hidden">
                {liveSearchResults.length > 0 ? (
                  liveSearchResults.map((project) => (
                    <button
                      type="button"
                      key={buildProjectKey(project)}
                      onClick={() => openFromSearch(project)}
                      className="w-full text-left px-4 py-3 border-b border-[var(--csub-light-faint)] last:border-b-0 hover:bg-[color:rgba(77,184,158,0.08)] transition-colors cursor-pointer"
                    >
                      <p className="text-sm text-white">{project.development_project || project.asset || 'Ukjent prosjekt'}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {project.country || 'Ukjent marked'} • {project.operator || project.surf_contractor || 'Ukjent aktor'}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Ingen treff for dette soket.</div>
                )}
              </div>
            )}
          </div>

          <div className="mb-6 flex flex-col gap-4 bg-[var(--csub-dark)] p-4 rounded-xl border border-[var(--csub-light-soft)] shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-lg text-white">Dashboard View</h2>
                <p className="text-xs text-[var(--text-muted)]">To tydelige arbeidsflater for historikk og fremtid</p>
              </div>
              <div className="w-full lg:w-auto rounded-lg border border-[var(--csub-light-soft)] bg-[var(--bg-dark)] p-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setView('historical')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors cursor-pointer ${view === 'historical' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)] font-semibold' : 'text-[var(--text-muted)] hover:text-white'}`}
                >
                  Historiske Contract Awards
                </button>
                <button
                  type="button"
                  onClick={() => setView('future')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors cursor-pointer ${view === 'future' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)] font-semibold' : 'text-[var(--text-muted)] hover:text-white'}`}
                >
                  Future / Kommende Prosjekter
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base text-white">{viewLabel}</h3>
                <p className="text-xs text-[var(--text-muted)]">Regionfilter gjelder alltid for valgt view</p>
              </div>
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value as RegionFilter)}
                className="bg-[var(--bg-dark)] border border-[var(--csub-light-soft)] text-white text-sm rounded-lg px-4 py-2 font-sans focus:ring-2 focus:ring-[var(--csub-gold)] focus:outline-none w-full sm:w-auto cursor-pointer"
              >
                <option value="All">Globalt (Alle prosjekter)</option>
                <option value="NorthSea">Nordsjoen</option>
                <option value="GoM">Gulf of Mexico</option>
              </select>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
          {[
            { label: 'Total poster', value: loading ? '—' : computedStats.totalProjects.toLocaleString('en-US') },
            { label: 'Total SURF km', value: loading ? '—' : `${computedStats.totalSurfKm.toLocaleString('en-US')} km` },
            { label: 'Total XMTs', value: loading ? '—' : computedStats.totalXmts.toLocaleString('en-US') },
            { label: view === 'historical' ? 'Awards siste 12m' : 'Kommende prosjekter', value: loading ? '—' : computedStats.upcomingAwards.toLocaleString('en-US') },
            { label: 'Regioner', value: loading ? '—' : computedStats.regionCount.toLocaleString('en-US') },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[var(--csub-dark)] p-6 rounded-xl border border-[var(--csub-light-soft)] shadow-lg flex flex-col justify-between">
              <span className="text-xs font-sans text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</span>
              <span className="text-3xl font-mono font-semibold text-white mt-2">{kpi.value}</span>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Panel title={view === 'historical' ? 'Historisk kontraktverdi' : 'Kommende pipelineverdi'} className="lg:col-span-2 min-h-[400px]">
            {!pipelineData.length ? (
              <LoadingPlaceholder text={loading ? 'Laster pipeline...' : 'Ingen pipeline-data for valgt filter'} />
            ) : (
              <>
                <div className="h-[350px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipelineData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.15} />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => `$${Math.round(value / 1_000_000)}M`} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} dx={-10} />
                      <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                      <Bar dataKey="value" fill="#4db89e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {pipelineFlowData.map((phase) => (
                    <div key={phase.label} className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.7)] p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{phase.label}</p>
                      <p className="font-mono text-xl text-white mt-1">{phase.value.toLocaleString('en-US')}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Siste hendelser">
            {!activityFeed.length ? (
              <LoadingPlaceholder text={loading ? 'Laster hendelser...' : 'Ingen hendelser for valgt filter'} />
            ) : (
              <div className="flex flex-col gap-4">
                {activityFeed.map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="flex items-start gap-3 pb-4 border-b border-[var(--csub-light-faint)] last:border-b-0">
                    <div className="w-2.5 h-2.5 mt-1.5 rounded-full bg-[var(--csub-gold)] shrink-0 shadow-[0_0_8px_var(--csub-gold)]" />
                    <div>
                      <p className="text-sm text-gray-100">{item.title}</p>
                      <p className="text-xs text-[var(--csub-light)] font-mono mt-1">{item.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Panel title="Kontrakter etter fase">
            {!viewCharts.byPhase.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-[160px] h-[160px] shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={viewCharts.byPhase.slice(0, 6)} dataKey="count" nameKey="phase" cx="50%" cy="50%" innerRadius={38} outerRadius={70} strokeWidth={0}>
                        {viewCharts.byPhase.slice(0, 6).map((entry, index) => (
                          <Cell key={`${entry.phase}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CompactTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  {viewCharts.byPhase.slice(0, 6).map((item, index) => (
                    <div key={item.phase} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      <span className="truncate text-[var(--text-muted)]">{item.phase}</span>
                      <span className="font-mono font-semibold ml-auto text-white">{item.count.toLocaleString('en-US')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Regional fordeling">
            {!viewCharts.byCountry.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-[160px] h-[160px] shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={viewCharts.byCountry.slice(0, 6)} dataKey="count" nameKey="country" cx="50%" cy="50%" innerRadius={38} outerRadius={70} strokeWidth={0}>
                        {viewCharts.byCountry.slice(0, 6).map((entry, index) => (
                          <Cell key={`${entry.country}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CompactTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  {viewCharts.byCountry.slice(0, 6).map((item, index) => (
                    <div key={item.country} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      <span className="truncate text-[var(--text-muted)]">{item.country}</span>
                      <span className="font-mono font-semibold ml-auto text-white">{item.count.toLocaleString('en-US')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Kontrakttrend">
            {!viewCharts.byYear.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <AreaChart data={viewCharts.byYear}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4db89e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#4db89e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <Tooltip content={<CompactTooltip />} cursor={{ stroke: '#4db89e', strokeOpacity: 0.2 }} />
                    <Area type="monotone" dataKey="count" stroke="#4db89e" fill="url(#trendGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel
            title="Installasjonsselskaper"
            subtitle={`${viewCompanies.contractors.length.toLocaleString('en-US')} selskaper`}
          >
            {!viewCompanies.contractors.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {viewCompanies.contractors.slice(0, 8).map((contractor) => {
                  const maxCount = Math.max(...viewCompanies.contractors.map((company) => company.count), 1)
                  return (
                    <div key={contractor.name} className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.55)] p-4">
                      <p className="text-sm text-white truncate">{contractor.name}</p>
                      <p className="font-mono text-xl text-[var(--csub-light)] mt-1">{contractor.count.toLocaleString('en-US')}</p>
                      <div className="w-full h-1.5 mt-2 rounded bg-[color:rgba(77,184,158,0.14)]">
                        <div className="h-full rounded bg-gradient-to-r from-[var(--csub-light)] to-[var(--csub-gold)]" style={{ width: `${Math.round((contractor.count / maxCount) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel title="Operatoroversikt">
            {!viewCompanies.operators.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {viewCompanies.operators.slice(0, 10).map((operator) => (
                  <div key={operator.name} className="flex justify-between items-center rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                    <span className="text-sm text-[var(--text-muted)] truncate pr-3">{operator.name}</span>
                    <span className="font-mono text-sm text-white">{operator.count.toLocaleString('en-US')}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] overflow-hidden mt-6 shadow-lg">
          <div className="px-6 py-5 border-b border-[var(--csub-light-faint)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-lg text-white">{view === 'historical' ? 'Historisk kontraktoversikt' : 'Kommende prosjektoversikt'}</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Viser {visibleProjects.length.toLocaleString('en-US')} av {sortedProjects.length.toLocaleString('en-US')}
            </p>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[980px] table-fixed text-left text-sm whitespace-nowrap">
              <colgroup>
                {TABLE_COLUMNS.map((column) => (
                  <col key={`col-${column.key}`} style={{ width: column.width }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  {TABLE_COLUMNS.map((column) => {
                    const sortIndicator = getTableSortIndicator(tableSort, column.key)
                    const isActive = tableSort?.key === column.key

                    return (
                      <th
                        key={column.key}
                        className={`px-4 py-3 border-b border-[var(--csub-light-faint)] font-semibold ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleTableSort(column.key)}
                          className={`w-full inline-flex items-center ${column.align === 'right' ? 'justify-end' : 'justify-between'} gap-2 transition-colors cursor-pointer ${isActive ? 'text-[var(--csub-light)]' : 'hover:text-white'}`}
                        >
                          <span className="truncate">{column.label}</span>
                          <span className={`inline-flex w-10 shrink-0 justify-end text-[10px] font-mono ${isActive ? 'text-[var(--csub-gold)]' : 'text-[var(--text-muted)]'}`}>
                            {sortIndicator || 'SORT'}
                          </span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <LoadingPlaceholder />
                    </td>
                  </tr>
                ) : sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)]">
                      Ingen data for valgt filter
                    </td>
                  </tr>
                ) : (
                  visibleProjects.map((project, index) => {
                    const projectKey = buildProjectKey(project)
                    const isHighlighted = highlightedProjectKey === projectKey
                    return (
                      <tr
                        id={`project-row-${projectKey}`}
                        key={`${projectKey}-${index}`}
                        onClick={() => {
                          setHighlightedProjectKey(projectKey)
                          openDrawer(project)
                        }}
                        className={`cursor-pointer transition-colors border-b border-[var(--csub-light-faint)] ${isHighlighted ? 'bg-[color:rgba(77,184,158,0.16)]' : 'hover:bg-[color:rgba(77,184,158,0.08)]'}`}
                      >
                        <td className="px-4 py-3 font-semibold text-white max-w-0 truncate">{project.development_project || '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)] max-w-0 truncate">{project.country || '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)] max-w-0 truncate">{project.operator || '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)] max-w-0 truncate">{project.surf_contractor || '—'}</td>
                        <td className="px-4 py-3 font-mono text-white max-w-0 truncate">{project.water_depth_category || '—'}</td>
                        <td className="px-4 py-3 font-mono text-white text-right tabular-nums">{(project.xmt_count || 0).toLocaleString('en-US')}</td>
                        <td className="px-4 py-3 font-mono text-white text-right tabular-nums">{Math.round(project.surf_km || 0).toLocaleString('en-US')}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && sortedProjects.length > 0 && hasMoreTableRows && (
            <div className="px-4 pt-4">
              <button
                type="button"
                onClick={() => setShowAllTableRows((current) => !current)}
                className="w-full rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-4 py-2.5 text-sm text-[var(--csub-light)] hover:text-white hover:border-[var(--csub-gold-soft)] transition-colors cursor-pointer"
              >
                {showAllTableRows ? 'Vis mindre' : `Vis mer (${(sortedProjects.length - DEFAULT_TABLE_ROWS).toLocaleString('en-US')})`}
              </button>
            </div>
          )}
          <div className="m-4 flex items-center gap-2 rounded-lg border border-[var(--csub-gold-soft)] bg-[color:rgba(201,168,76,0.08)] px-4 py-3 text-xs text-[var(--text-muted)]">
            AI-vurdering: verifiser alltid output manuelt.
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Regioner - verdenskart">
            <MapSection countryData={viewCharts.byCountry} />
          </Panel>

          <Panel title="Vanndybde-fordeling">
            {!viewCharts.byDepth.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[360px]">
                <ResponsiveContainer>
                  <BarChart data={viewCharts.byDepth.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="depth" axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={70} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                    <Tooltip content={<CompactTooltip />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {viewCharts.byDepth.slice(0, 10).map((entry, index) => (
                        <Cell key={`${entry.depth}-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>

        {/* ── Market Intelligence ── */}
        <section className="rounded-xl border border-[var(--csub-gold-soft)] bg-[linear-gradient(135deg,rgba(201,168,76,0.08),rgba(77,184,158,0.06))] p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--csub-gold)]">Market Reports</p>
              <h2 className="text-xl text-white mt-1">Market Intelligence Workspace</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Alle paneler under bygger pa AI-tolkede PDF-rapporter og forecast-tabeller.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full lg:w-auto">
              <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Siste rapport</p>
                <p className="font-mono text-sm text-white mt-1">{marketMeta.latestReportDate}</p>
              </div>
              <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Forecast range</p>
                <p className="font-mono text-sm text-white mt-1">{marketMeta.forecastCoverage}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Global Subsea Spending Forecast" subtitle={`Coverage ${marketMeta.forecastCoverage}`}>
            {marketLoading ? (
              <LoadingPlaceholder text="Laster markedsdata..." />
            ) : !spendingByYear.length ? (
              <LoadingPlaceholder text="Ingen spending-data tilgjengelig" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <AreaChart data={spendingByYear}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4db89e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#4db89e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} tickFormatter={(v: number) => `$${v}B`} />
                    <Tooltip content={<MarketTooltip unit="USD Bn" />} cursor={{ stroke: '#4db89e', strokeOpacity: 0.2 }} />
                    <Area type="monotone" dataKey="value" stroke="#4db89e" fill="url(#spendGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="XMT Installations Forecast" subtitle="Kilde: AI markedsrapporter">
            {marketLoading ? (
              <LoadingPlaceholder text="Laster markedsdata..." />
            ) : !xmtByYear.length ? (
              <LoadingPlaceholder text="Ingen XMT-data tilgjengelig" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <BarChart data={xmtByYear}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <Tooltip content={<MarketTooltip unit="units" />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                    <Bar dataKey="value" fill="#4db89e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>

        <section>
          <Panel title="Regional Subsea Spending Breakdown" subtitle={regionalSummary ? `${regionalSummary.latestYear}` : 'Market reports'}>
            {marketLoading ? (
              <LoadingPlaceholder text="Laster regionale data..." />
            ) : !regionalSpendData.length ? (
              <LoadingPlaceholder text="Ingen regionale spending-data tilgjengelig" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Total spend</p>
                    <p className="font-mono text-xl text-white mt-1">
                      ${regionalTotal.toFixed(1)}B
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">YoY endring</p>
                    <p className={`font-mono text-xl mt-1 ${regionalYoyDelta !== null && regionalYoyDelta > 0 ? 'text-[var(--csub-light)]' : regionalYoyDelta !== null && regionalYoyDelta < 0 ? 'text-[#d29884]' : 'text-white'}`}>
                      {regionalYoyDelta === null ? '—' : `${regionalYoyDelta > 0 ? '+' : ''}${regionalYoyDelta.toFixed(1)}B`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Sterkeste region</p>
                    <p className="font-mono text-sm text-white mt-1 truncate">{regionalTopRegion?.label ?? '—'}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {regionalTopRegion ? `$${regionalTopRegion.value.toFixed(1)}B` : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Datadekning</p>
                    <p className="font-mono text-xl text-white mt-1">{regionalSummary?.coverageCount ?? 0}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">regioner med verdi</p>
                  </div>
                </div>

                <div className="h-[360px]">
                  <ResponsiveContainer>
                    <BarChart data={regionalSpendData} barCategoryGap="24%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.1} />
                      <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} tickFormatter={(v: number) => `$${v}B`} />
                      <Tooltip content={<RegionalTooltip />} cursor={{ fill: 'rgba(77,184,158,0.04)' }} />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#8ca8a0' }} />
                      {REGION_KEYS.map((region, index) => (
                        <Bar
                          key={region.key}
                          dataKey={region.label}
                          stackId="regions"
                          fill={REGION_COLORS[index % REGION_COLORS.length]}
                          maxBarSize={56}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {regionalSummary?.topShares?.length ? (
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {regionalSummary.topShares.map((item) => (
                      <div key={item.label} className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] p-3">
                        <p className="text-xs text-[var(--text-muted)] truncate">{item.label}</p>
                        <p className="font-mono text-sm text-white mt-1">${item.value.toFixed(1)}B</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">{item.share.toFixed(1)}% av totalen</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Siste markedsrapporter" subtitle="Klikk pa en rapport for detaljer">
            {marketLoading ? (
              <LoadingPlaceholder text="Laster rapporter..." />
            ) : !reportInsights.length ? (
              <LoadingPlaceholder text="Ingen rapporter tilgjengelig" />
            ) : (
              <div className="space-y-4">
                {reportDeleteError && (
                  <div className="rounded-lg border border-[rgba(224,108,117,0.5)] bg-[rgba(224,108,117,0.12)] px-3 py-2 text-xs text-[#f2b7bc]">
                    Sletting feilet: {reportDeleteError}
                  </div>
                )}
                {reportDeleteNotice && (
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[rgba(77,184,158,0.12)] px-3 py-2 text-xs text-[var(--csub-light)]">
                    {reportDeleteNotice}
                  </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Rapporter</p>
                    <p className="font-mono text-lg text-white">{reportStats.totalReports}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Med AI-sammendrag</p>
                    <p className="font-mono text-lg text-white">{reportStats.withSummary}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Med PDF-link</p>
                    <p className="font-mono text-lg text-white">{reportStats.withPdf}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Siste oppdatert</p>
                    <p className="font-mono text-sm text-white mt-1">{reportStats.latestReportDate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  <div className="xl:col-span-5 space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {reportInsights.slice(0, 12).map((item) => {
                      const isActive = selectedReportInsight?.report.id === item.report.id

                      return (
                        <button
                          key={item.report.id}
                          type="button"
                          onClick={() => setSelectedReportId(item.report.id)}
                          className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${isActive ? 'border-[var(--csub-gold-soft)] bg-[color:rgba(201,168,76,0.12)]' : 'border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] hover:bg-[color:rgba(77,184,158,0.08)]'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-white truncate">{item.displayPeriod}</p>
                            <span className={`text-[10px] uppercase tracking-wider shrink-0 ${item.report.download_url ? 'text-[var(--csub-gold)]' : 'text-[var(--text-muted)]'}`}>
                              {item.report.download_url ? 'PDF' : 'No PDF'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] font-mono mt-1">{formatReportDate(item.report.created_at)}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{item.preview}</p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="xl:col-span-7 rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-4">
                    {!selectedReportInsight ? null : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-white truncate">{selectedReportInsight.displayPeriod}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                              Lastet opp {formatReportDate(selectedReportInsight.report.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {selectedReportInsight.report.download_url && (
                              <a
                                href={selectedReportInsight.report.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs rounded-md border border-[var(--csub-gold-soft)] px-2.5 py-1 text-[var(--csub-gold)] hover:text-white hover:border-[var(--csub-light)] transition-colors"
                              >
                                Open PDF
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setReportDeleteError(null)
                                setReportDeleteConfirmId(selectedReportInsight.report.id)
                              }}
                              disabled={reportDeletePendingId === selectedReportInsight.report.id}
                              className="text-xs rounded-md border border-[rgba(224,108,117,0.55)] px-2.5 py-1 text-[#f2b7bc] hover:text-white hover:border-[rgba(224,108,117,0.85)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {reportDeletePendingId === selectedReportInsight.report.id ? 'Sletter...' : 'Slett rapport'}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--csub-light)]">Salgstiltak</p>
                          <div className="mt-2 space-y-2">
                            {selectedReportInsight.salesActions.map((action, index) => (
                              <div key={`${selectedReportInsight.report.id}-action-${index}`} className="rounded-md border border-[var(--csub-light-soft)] bg-[color:rgba(77,184,158,0.08)] px-3 py-2 text-xs text-white">
                                {action}
                              </div>
                            ))}
                          </div>
                        </div>

                        {selectedReportInsight.parsed.keyFigures.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--text-muted)]">Nokkelfigurer</p>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {selectedReportInsight.parsed.keyFigures.slice(0, 6).map((keyFigure, index) => (
                                <div key={`${selectedReportInsight.report.id}-figure-${index}`} className="rounded-md border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.55)] px-2.5 py-2">
                                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] truncate">{keyFigure.label}</p>
                                  <p className="font-mono text-sm text-white mt-1">{keyFigure.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedReportInsight.parsed.highlights.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--text-muted)]">Highlights</p>
                            <ul className="mt-2 space-y-1.5">
                              {selectedReportInsight.parsed.highlights.slice(0, 4).map((highlight, index) => (
                                <li key={`${selectedReportInsight.report.id}-highlight-${index}`} className="flex items-start gap-2 text-xs text-[var(--text-muted)] leading-relaxed">
                                  <span className="mt-0.5 shrink-0 text-[var(--csub-gold)]">•</span>
                                  <span>{highlight}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedReportInsight.hasNarrative && (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => setExpandedReport(expandedReport === selectedReportInsight.report.id ? null : selectedReportInsight.report.id)}
                              className="text-xs text-[var(--csub-light)] hover:text-white transition-colors cursor-pointer"
                            >
                              {expandedReport === selectedReportInsight.report.id ? '▲ Skjul sammendrag' : '▼ Les sammendrag'}
                            </button>
                            {expandedReport === selectedReportInsight.report.id && (
                              <p className="mt-3 whitespace-pre-line text-sm text-[var(--text-muted)] leading-relaxed border-t border-[var(--csub-light-faint)] pt-3">
                                {selectedReportInsight.parsed.narrative || selectedReportInsight.report.ai_summary}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Nokkeltall fra markedsrapporter" subtitle={latestMetrics ? `${latestMetrics.year}` : undefined}>
            {marketLoading ? (
              <LoadingPlaceholder text="Laster nokkeltall..." />
            ) : !latestMetrics ? (
              <LoadingPlaceholder text="Ingen forecast-data tilgjengelig" />
            ) : !keyMetricCards.length ? (
              <LoadingPlaceholder text="Fant forecast-data, men ingen gjenkjente KPI-metrikker." />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {keyMetricCards.map((item) => (
                    <div key={item.label} className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.55)] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-sans text-[var(--text-muted)] uppercase tracking-wider">{item.label}</span>
                        <span className="text-[10px] uppercase tracking-wider text-[var(--csub-gold)]">{item.source}</span>
                      </div>
                      <p className="text-2xl font-mono font-semibold text-white mt-2">{item.fmt(item.data!.value)}</p>
                      <p className={`text-xs font-mono mt-2 ${item.trendTone === 'up' ? 'text-[var(--csub-light)]' : item.trendTone === 'down' ? 'text-[#d29884]' : 'text-[var(--text-muted)]'}`}>
                        {item.trendLabel || 'Ingen sammenlignbar historikk ennå'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  Dette KPI-panelet bruker kun data fra markedsrapporter/forecasts, ikke prosjekt-tabellen over.
                </div>
              </>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title={view === 'historical' ? 'Awards per ar' : 'Prosjekter per ar'}>
            {!viewCharts.byYear.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <BarChart data={viewCharts.byYear}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <Tooltip content={<CompactTooltip />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                    <Bar dataKey="count" fill="#4db89e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Dokumentopplasting">
            <DropZone onImportComplete={fetchMarketData} />
          </Panel>
        </section>
      </main>

      {reportDeleteCandidate && (
        <>
          <div
            className="fixed inset-0 bg-black/65 z-[220]"
            onClick={() => {
              if (reportDeletePendingId) return
              setReportDeleteConfirmId(null)
            }}
          />
          <div className="fixed inset-0 z-[221] p-4 grid place-items-center">
            <div className="w-full max-w-md rounded-xl border border-[rgba(224,108,117,0.5)] bg-[var(--csub-dark)] p-5 shadow-2xl">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#f2b7bc]">Bekreft sletting</p>
              <h3 className="text-lg text-white mt-2">Slette markedsrapport permanent?</h3>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Denne handlingen kan ikke angres. Rapporten fjernes fra dashboardet og databasen.
              </p>
              <div className="mt-3 rounded-lg border border-[var(--csub-light-soft)] bg-[rgba(10,23,20,0.55)] px-3 py-2">
                <p className="text-sm font-semibold text-white truncate">{reportDeleteCandidate.displayPeriod}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{formatReportDate(reportDeleteCandidate.report.created_at)}</p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReportDeleteConfirmId(null)}
                  disabled={Boolean(reportDeletePendingId)}
                  className="rounded-md border border-[var(--csub-light-soft)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={() => void deleteMarketReport(reportDeleteCandidate.report.id)}
                  disabled={Boolean(reportDeletePendingId)}
                  className="rounded-md border border-[rgba(224,108,117,0.75)] bg-[rgba(224,108,117,0.12)] px-3 py-2 text-sm text-[#f2b7bc] hover:text-white hover:bg-[rgba(224,108,117,0.2)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {reportDeletePendingId === reportDeleteCandidate.report.id ? 'Sletter...' : 'Ja, slett'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {drawerOpen && <div className="fixed inset-0 bg-black/50 z-[200]" onClick={closeDrawer} />}
      <div className={`fixed top-0 right-0 bottom-0 w-[520px] max-w-[90vw] bg-[var(--csub-dark)] z-[201] transition-transform duration-300 overflow-y-auto border-l border-[var(--csub-light-soft)] ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedProject && (
          <>
            <div className="sticky top-0 z-10 p-5 text-white flex justify-between items-start border-b border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.95)]">
              <div>
                <h3 className="text-lg font-semibold mb-1">{selectedProject.development_project || 'Ukjent prosjekt'}</h3>
                <div className="text-xs text-[var(--text-muted)]">
                  {selectedProject.surf_contractor || 'N/A'}
                  {' -> '}
                  {selectedProject.operator || 'N/A'}
                </div>
              </div>
              <button onClick={closeDrawer} className="text-white text-2xl px-2 py-1 rounded hover:bg-white/15 cursor-pointer">
                x
              </button>
            </div>
            <div className="p-6">
              <DrawerSection title="Kontraktdetaljer">
                <DrawerRow label="Land" value={selectedProject.country} />
                <DrawerRow label="Kontinent" value={selectedProject.continent} />
                <DrawerRow label="Operatør" value={selectedProject.operator} />
                <DrawerRow label="SURF Contractor" value={selectedProject.surf_contractor} />
                <DrawerRow label="Kategori" value={selectedProject.facility_category} />
                <DrawerRow label="Vanndybde" value={selectedProject.water_depth_category} />
                <DrawerRow label="XMTs" value={(selectedProject.xmt_count || 0).toLocaleString('en-US')} />
                <DrawerRow label="SURF km" value={Math.round(selectedProject.surf_km || 0).toLocaleString('en-US')} />
                <DrawerRow label="Periode" value={`${selectedProject.first_year || '?'} - ${selectedProject.last_year || '?'}`} />
              </DrawerSection>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MarketTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string | number; unit?: string }) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value ?? 0
  const value = typeof raw === 'number' ? raw : Number(raw)
  return (
    <div className="bg-[var(--csub-dark)] p-3 rounded-lg border border-[var(--csub-light-soft)] shadow-xl">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="font-mono text-base text-white">{value.toLocaleString('en-US')} {unit}</p>
    </div>
  )
}

function RegionalTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string | number }) {
  if (!active || !payload?.length) return null

  const entries = payload
    .map((entry) => ({
      name: entry.name ?? 'Unknown',
      value: typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0),
      color: entry.color ?? '#8ca8a0',
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = entries.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="bg-[var(--csub-dark)] p-3 rounded-lg border border-[var(--csub-light-soft)] shadow-xl max-w-[280px]">
      <p className="text-xs text-[var(--text-muted)] mb-2 font-semibold">{label}</p>
      <p className="text-xs text-white font-mono mb-2">${total.toFixed(1)}B total</p>
      {entries.map((entry) => (
        <div key={entry.name} className="flex justify-between gap-4 text-xs py-0.5">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-mono text-white">
            ${entry.value.toFixed(1)}B ({total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0'}%)
          </span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] p-6 shadow-lg ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg text-white">{title}</h2>
        {subtitle && <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs uppercase tracking-wider font-semibold mb-2 text-[var(--text-muted)]">{title}</h4>
      {children}
    </div>
  )
}

function DrawerRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-2 text-sm border-b border-[var(--csub-light-faint)]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-white text-right ml-4">{value || '—'}</span>
    </div>
  )
}

function sanitizeUploadFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

function DropZone({ onImportComplete }: { onImportComplete?: () => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const maxSizeBytes = 25 * 1024 * 1024

  const queueMarketReport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Kun PDF støttes her.')
      return
    }

    if (file.size > maxSizeBytes) {
      setErrorMessage(`Filen er for stor. Maks ${Math.round(maxSizeBytes / 1024 / 1024)}MB.`)
      return
    }

    setErrorMessage(null)
    setStatusMessage('Laster opp PDF...')
    setUploading(true)

    try {
      const supabase = createClient()
      const cleanName = sanitizeUploadFileName(file.name)
      const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${cleanName}`

      const { error: uploadError } = await supabase
        .storage
        .from('imports')
        .upload(storagePath, file, {
          contentType: file.type || 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      setStatusMessage('Kjører AI-ekstraksjon...')
      const response = await fetch('/api/import/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          file_size_bytes: file.size,
          storage_bucket: 'imports',
          storage_path: storagePath,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Kunne ikke starte import (${response.status})`)
      }

      setStatusMessage('Rapport i kø. Oppdateres automatisk når analysen er ferdig.')
      onImportComplete?.()
      window.setTimeout(() => onImportComplete?.(), 8000)
      window.setTimeout(() => onImportComplete?.(), 18000)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setStatusMessage(null)
    } finally {
      setUploading(false)
    }
  }, [maxSizeBytes, onImportComplete])

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (uploading) return
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (uploading) return
    const droppedFile = event.dataTransfer.files?.[0]
    if (!droppedFile) return
    void queueMarketReport(droppedFile)
  }

  const onSelectFile = () => {
    if (uploading) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,application/pdf'
    input.onchange = (event) => {
      const selectedFile = (event.target as HTMLInputElement).files?.[0]
      if (!selectedFile) return
      void queueMarketReport(selectedFile)
    }
    input.click()
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[220px] ${
        isDragging
          ? 'border-[var(--csub-light)] bg-[color:rgba(77,184,158,0.12)]'
          : 'border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.5)]'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onSelectFile}
    >
      <div className="font-mono text-[var(--csub-gold)] text-base">
        {uploading ? 'Laster opp markedsrapport...' : 'Slipp PDF her eller klikk for opplasting'}
      </div>
      <div className="text-xs mt-2 text-[var(--text-muted)]">
        {statusMessage || 'PDF analyseres med AI, forecasts og nøkkeltall oppdateres automatisk.'}
      </div>
      {errorMessage && <div className="mt-3 text-xs text-red-400">{errorMessage}</div>}
    </div>
  )
}
