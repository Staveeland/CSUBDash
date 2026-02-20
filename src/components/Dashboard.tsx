'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import AIAgentPanel from './AIAgentPanel'
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
  pipelineFlow?: { label: string; value: number }[]
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
  data_source?: string
  source?: string | null
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

interface CompetitorEvent {
  id: string
  competitor_name: string
  title: string
  summary: string | null
  source: string
  url: string
  published_at: string | null
  event_date: string | null
  signal_type: string
  relevance_score: number
  importance: 'high' | 'medium' | 'low'
  is_upcoming: boolean
}

interface CompetitorEventsMeta {
  last_scraped_at: string | null
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
  url?: string
  project?: Project
}

type TableSortDirection = 'asc' | 'desc'
type TableSortKey = 'project' | 'year' | 'country' | 'operator' | 'contractor' | 'depth' | 'xmt' | 'surf'

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

type InsightValueFormat = 'count' | 'currencyMillions' | 'currencyBillions' | 'km' | 'percent' | 'raw'
type InsightChartKind = 'bar' | 'area'
type InsightSource = 'projects' | 'market' | 'reports'
type SummaryKpiKey = 'totalProjects' | 'totalSurfKm' | 'totalXmts' | 'upcomingAwards' | 'regions'
type MarketMetricKey = 'spend' | 'xmt' | 'surf' | 'growth' | 'brent'

interface InsightMetricItem {
  label: string
  value: string
  tone?: 'up' | 'down' | 'neutral'
  onClick?: () => void
}

interface InsightChartItem {
  label: string
  value: number
}

interface InsightListItem {
  label: string
  value: string
  detail?: string
  onClick?: () => void
}

interface InsightState {
  id: string
  title: string
  subtitle?: string
  description?: string
  source: InsightSource
  metrics: InsightMetricItem[]
  chartTitle?: string
  chartKind?: InsightChartKind
  chartFormat?: InsightValueFormat
  chartData?: InsightChartItem[]
  onBarClick?: (item: InsightChartItem) => void
  listTitle?: string
  listItems?: InsightListItem[]
  projects?: Project[]
}

interface ProjectInsightOptions {
  id: string
  title: string
  subtitle?: string
  description?: string
  selectedProjects: Project[]
  chartTitle?: string
  chartKind?: InsightChartKind
  chartFormat?: InsightValueFormat
  chartData?: InsightChartItem[]
  onBarClick?: (item: InsightChartItem) => void
  listTitle?: string
  listItems?: InsightListItem[]
  extraMetrics?: InsightMetricItem[]
}

const DONUT_COLORS = ['#4db89e', '#38917f', '#2d7368', '#e4a010', '#7dd4bf', '#245a4e']
const REGION_COLORS = ['#5f87a8', '#7ea18b', '#b08f68', '#827fba', '#9f768f', '#6b9f9c']
const BAR_COLORS = ['#4db89e', '#38917f', '#2d7368', '#245a4e', '#7dd4bf', '#1a3c34']
const PIPELINE_FLOW = ['FEED', 'Tender', 'Award', 'Execution', 'Closed']
const FUTURE_ACTIVITY_LIMIT = 20
const DEFAULT_TABLE_ROWS = 15
const TABLE_COLUMNS: { key: TableSortKey; label: string; align?: 'left' | 'right'; width: string }[] = [
  { key: 'project', label: 'Prosjekt', width: '20%' },
  { key: 'year', label: 'År', width: '9%' },
  { key: 'country', label: 'Land', width: '11%' },
  { key: 'operator', label: 'Operatør', width: '14%' },
  { key: 'contractor', label: 'SURF Contractor', width: '14%' },
  { key: 'depth', label: 'Vanndybde', width: '12%' },
  { key: 'xmt', label: 'XMTs', align: 'right', width: '10%' },
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

function getProjectYearLabel(project: Project): string {
  const first = parseYearValue(project.first_year)
  const last = parseYearValue(project.last_year)

  if (first && last) return first === last ? String(first) : `${first}-${last}`
  if (first) return String(first)
  if (last) return String(last)

  const fallback = getProjectYear(project)
  return fallback ? String(fallback) : '—'
}

function getProjectDataSource(project: Project): string {
  return typeof project.data_source === 'string' ? normalize(project.data_source) : ''
}

function getProjectSource(project: Project): string {
  return typeof project.source === 'string' ? normalize(project.source) : ''
}

function isForecastPipelineRecord(project: Project): boolean {
  if (getProjectDataSource(project) === 'project') return true
  return getProjectSource(project) === 'rystad_forecast'
}

function buildProjectKey(project: Project): string {
  const raw = `${project.development_project || project.asset || 'project'}-${project.country || 'country'}-${project.first_year || project.last_year || 'year'}-${project.operator || 'operator'}`
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function getTableSortValue(project: Project, key: TableSortKey): string | number {
  switch (key) {
    case 'project':
      return normalize(project.development_project || project.asset || '')
    case 'year': {
      const year = getProjectYear(project)
      return year === null ? Number.NaN : year
    }
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
    const leftMissing = Number.isNaN(left)
    const rightMissing = Number.isNaN(right)
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) return 0
      return leftMissing ? 1 : -1
    }

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

function formatBillions(value: number): string {
  return `$${value.toFixed(1)}B`
}

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function getProjectDisplayName(project: Project): string {
  return project.development_project || project.asset || 'Ukjent prosjekt'
}

function toInsightChartItem(raw: unknown): InsightChartItem | null {
  const readCandidate = (candidate: unknown): InsightChartItem | null => {
    if (!candidate || typeof candidate !== 'object') return null
    const record = candidate as Record<string, unknown>
    const labelRaw = record.label ?? record.name ?? record.year ?? record.period
    const valueRaw = record.value ?? record.count
    if (typeof labelRaw !== 'string' && typeof labelRaw !== 'number') return null
    const value = Number(valueRaw)
    if (!Number.isFinite(value)) return null
    return {
      label: String(labelRaw),
      value,
    }
  }

  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>

  if (Array.isArray(record.activePayload) && record.activePayload.length > 0) {
    const first = record.activePayload[0]
    return readCandidate((first as Record<string, unknown>)?.payload) || readCandidate(first)
  }

  return readCandidate(record.payload) || readCandidate(record)
}

function estimateProjectValue(project: Project): number {
  const surfValue = Math.max(0, project.surf_km || 0) * 1_000_000
  const xmtValue = Math.max(0, project.xmt_count || 0) * 120_000
  return surfValue + xmtValue
}

function formatInsightValue(value: number, format: InsightValueFormat): string {
  if (!Number.isFinite(value)) return '—'

  switch (format) {
    case 'count':
      return Math.round(value).toLocaleString('en-US')
    case 'currencyMillions':
      return formatMillions(value)
    case 'currencyBillions':
      return formatBillions(value)
    case 'km':
      return `${Math.round(value).toLocaleString('en-US')} km`
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'raw':
    default:
      return value.toLocaleString('en-US')
  }
}

function aggregateProjectMetric(
  source: Project[],
  keySelector: (project: Project) => string,
  valueSelector: (project: Project) => number
): Array<{ label: string; value: number }> {
  const map = new Map<string, number>()

  source.forEach((project) => {
    const key = keySelector(project).trim()
    if (!key) return
    const value = valueSelector(project)
    if (!Number.isFinite(value) || value <= 0) return
    map.set(key, (map.get(key) ?? 0) + value)
  })

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
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

function formatReportDateTime(dateValue: string): string {
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return 'Ukjent dato'
  return parsed.toLocaleString('nb-NO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(dateValue: string | null): string {
  if (!dateValue) return 'Nylig'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return 'Nylig'
  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 0) return formatReportDate(parsed.toISOString())

  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (diffMs < hour) return 'Mindre enn 1 time siden'
  if (diffMs < day) return `${Math.round(diffMs / hour)} timer siden`
  const days = Math.round(diffMs / day)
  if (days <= 1) return '1 dag siden'
  if (days <= 30) return `${days} dager siden`
  return formatReportDate(parsed.toISOString())
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
  const region: RegionFilter = 'All'
  const [view, setView] = useState<DashboardView>('historical')
  const [tableSort, setTableSort] = useState<TableSortConfig | null>(null)
  const [showAllTableRows, setShowAllTableRows] = useState(false)
  const [insight, setInsight] = useState<InsightState | null>(null)
  const [insightHistory, setInsightHistory] = useState<InsightState[]>([])

  // Market Intelligence state
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([])
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [marketLoading, setMarketLoading] = useState(true)
  const [competitorEvents, setCompetitorEvents] = useState<CompetitorEvent[]>([])
  const [competitorMeta, setCompetitorMeta] = useState<CompetitorEventsMeta>({ last_scraped_at: null })
  const [competitorLoading, setCompetitorLoading] = useState(true)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [reportDeletePendingId, setReportDeletePendingId] = useState<string | null>(null)
  const [reportDeleteConfirmId, setReportDeleteConfirmId] = useState<string | null>(null)
  const [reportDeleteError, setReportDeleteError] = useState<string | null>(null)
  const [reportDeleteNotice, setReportDeleteNotice] = useState<string | null>(null)

  const userLabel = getUserDisplayName(userEmail)
  const userInitials = getInitials(userLabel)

  const [pipelineCounts, setPipelineCounts] = useState<{tender: number; award: number; execution: number; closed: number}>({tender:0,award:0,execution:0,closed:0})
  const [projectYearTotals, setProjectYearTotals] = useState<{
    xmt: Record<number, number>
    surf: Record<number, number>
    pipeline: Record<number, number>
  }>({ xmt: {}, surf: {}, pipeline: {} })

  const fetchData = useCallback(async () => {
    try {
      const [projRes, chartsRes] = await Promise.all([
        fetch('/api/dashboard/projects'),
        fetch('/api/dashboard/charts'),
      ])
      const payload = await projRes.json()
      if (!projRes.ok) {
        throw new Error(payload?.error || `Dashboard API failed with status ${projRes.status}`)
      }
      if (!Array.isArray(payload)) {
        throw new Error('Dashboard API returned invalid format')
      }
      setProjects(payload)
      setLoadError(null)

      if (chartsRes.ok) {
        const chartsData = await chartsRes.json()
        if (chartsData.pipelineFlow) {
          const flow = chartsData.pipelineFlow as {label: string; value: number}[]
          setPipelineCounts({
            tender: flow.find(f => f.label === 'Tender')?.value ?? 0,
            award: flow.find(f => f.label === 'Award')?.value ?? 0,
            execution: flow.find(f => f.label === 'Execution')?.value ?? 0,
            closed: flow.find(f => f.label === 'Closed')?.value ?? 0,
          })
        }

        const toYearValueMap = (rows: unknown): Record<number, number> => {
          const map: Record<number, number> = {}
          if (!Array.isArray(rows)) return map
          rows.forEach((entry) => {
            const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
            const year = Number(row.year)
            const value = Number(row.value)
            if (!Number.isFinite(year) || !Number.isFinite(value)) return
            map[year] = value
          })
          return map
        }

        setProjectYearTotals({
          xmt: toYearValueMap(chartsData.xmtByYearProjectData),
          surf: toYearValueMap(chartsData.surfByYearProjectData),
          pipeline: toYearValueMap(chartsData.pipelineValueByYear),
        })
      }
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

  useEffect(() => {
    setInsight(null)
    setInsightHistory([])
  }, [region, view])

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

  const fetchCompetitorEvents = useCallback(async () => {
    setCompetitorLoading(true)
    try {
      const res = await fetch('/api/dashboard/competitor-events')
      if (!res.ok) throw new Error(`Competitor events API returned ${res.status}`)
      const data = await res.json()
      const rows: unknown[] = Array.isArray(data?.events) ? data.events as unknown[] : []
      const meta = data && typeof data === 'object' ? (data as Record<string, unknown>).meta : null

      const normalized: CompetitorEvent[] = rows
        .map((row: unknown): CompetitorEvent => {
          const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
          const importanceRaw = String(record.importance ?? 'low').toLowerCase()
          const importance: CompetitorEvent['importance'] =
            importanceRaw === 'high' || importanceRaw === 'medium' ? importanceRaw : 'low'

          return {
            id: String(record.id ?? ''),
            competitor_name: String(record.competitor_name ?? ''),
            title: String(record.title ?? ''),
            summary: typeof record.summary === 'string' ? record.summary : null,
            source: String(record.source ?? ''),
            url: String(record.url ?? ''),
            published_at: typeof record.published_at === 'string' ? record.published_at : null,
            event_date: typeof record.event_date === 'string' ? record.event_date : null,
            signal_type: String(record.signal_type ?? 'other'),
            relevance_score: Number(record.relevance_score ?? 0),
            importance,
            is_upcoming: Boolean(record.is_upcoming),
          }
        })
        .filter((event) => event.id.length > 0 && event.title.length > 0 && event.competitor_name.length > 0)

      setCompetitorEvents(normalized)
      setCompetitorMeta({
        last_scraped_at:
          meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).last_scraped_at === 'string'
            ? (meta as Record<string, unknown>).last_scraped_at as string
            : null,
      })
    } catch (error) {
      console.error('Failed to load competitor events:', error)
      setCompetitorEvents([])
      setCompetitorMeta({ last_scraped_at: null })
    } finally {
      setCompetitorLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCompetitorEvents()
  }, [fetchCompetitorEvents])

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
        metricKey: 'spend' as MarketMetricKey,
        label: 'Total Subsea Spend',
        source: 'Market Reports',
        data: latestMetrics.spend,
        fmt: (v: number) => `$${v.toFixed(1)}B`,
        trendLabel: buildTrendLabel(spendTrend, (v) => `$${v.toFixed(1)}B`),
        trendTone: getTrendTone(spendTrend.delta),
      },
      {
        metricKey: 'xmt' as MarketMetricKey,
        label: 'XMT Installations',
        source: 'Market Reports',
        data: latestMetrics.xmt,
        fmt: (v: number) => Math.round(v).toLocaleString('en-US'),
        trendLabel: buildTrendLabel(xmtTrend, (v) => Math.round(v).toLocaleString('en-US')),
        trendTone: getTrendTone(xmtTrend.delta),
      },
      {
        metricKey: 'surf' as MarketMetricKey,
        label: 'SURF km',
        source: 'Market Reports',
        data: latestMetrics.surf,
        fmt: (v: number) => `${Math.round(v).toLocaleString('en-US')} km`,
        trendLabel: buildTrendLabel(surfTrend, (v) => `${Math.round(v).toLocaleString('en-US')} km`),
        trendTone: getTrendTone(surfTrend.delta),
      },
      {
        metricKey: 'growth' as MarketMetricKey,
        label: 'YoY Growth',
        source: 'Market Reports',
        data: latestMetrics.growth,
        fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
        trendLabel: growthTrendLabel,
        trendTone: getTrendTone(growthTrend.delta),
      },
      {
        metricKey: 'brent' as MarketMetricKey,
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
      const isForecastRecord = isForecastPipelineRecord(project)

      if (view === 'historical') {
        if (isForecastRecord) return false
        if (!year) return true
        return year <= currentYear
      }

      if (isForecastRecord) return true
      if (!year) return false
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

  const pipelineData = useMemo(() => {
    if (view === 'future' && region === 'All') {
      const fromRawTables = Object.entries(projectYearTotals.pipeline)
        .map(([year, value]) => ({ period: year, value }))
        .filter((entry) => Number.isFinite(Number(entry.period)) && Number.isFinite(entry.value))
        .sort((a, b) => Number(a.period) - Number(b.period))

      if (fromRawTables.length > 0) {
        return fromRawTables
      }
    }

    return buildPipelineByYear(viewProjects)
  }, [projectYearTotals.pipeline, region, view, viewProjects])

  const pipelineFlowData = useMemo(() => {
    return [
      { label: 'FEED', value: viewProjects.length },
      { label: 'Tender', value: pipelineCounts.tender },
      { label: 'Award', value: pipelineCounts.award },
      { label: 'Execution', value: pipelineCounts.execution },
      { label: 'Closed', value: pipelineCounts.closed },
    ]
  }, [viewProjects.length, pipelineCounts])

  const activityFeed = useMemo<ActivityItem[]>(() => {
    if (view === 'future') {
      return competitorEvents.slice(0, FUTURE_ACTIVITY_LIMIT).map((event) => {
        const dateLabel = event.event_date ? `Forventet ${formatReportDate(event.event_date)}` : formatRelativeTime(event.published_at)
        return {
          title: `${event.competitor_name}: ${event.title}`,
          meta: `${event.source} • ${dateLabel}`,
          url: event.url,
        }
      })
    }

    const timeline = ['2 timer siden', '5 timer siden', '1 dag siden', '2 dager siden', '3 dager siden']
    const selected = filteredProjects.slice(0, 5)
    if (!selected.length) return []
    return selected.map((project, index) => ({
      title: `${project.development_project || 'Ukjent prosjekt'} - ${project.country || 'Ukjent marked'}`,
      meta: `${project.operator || project.surf_contractor || 'CSUB team'} • ${timeline[index] ?? 'Nylig'}`,
      project,
    }))
  }, [competitorEvents, filteredProjects, view])

  const openDrawer = (project: Project) => {
    setInsight(null)
    setInsightHistory([])
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

  const viewLabel = view === 'historical' ? 'Contract Awards' : 'Kommende Prosjekter'
  const regionalTotal = regionalSummary?.total ?? 0
  const regionalYoyDelta = regionalSummary?.yoyDelta ?? null
  const regionalTopRegion = regionalSummary?.topRegion ?? null
  const reportTimelineData = useMemo(() => {
    const yearMap = new Map<number, number>()
    reports.forEach((report) => {
      const parsedDate = new Date(report.created_at)
      if (Number.isNaN(parsedDate.getTime())) return
      const year = parsedDate.getFullYear()
      yearMap.set(year, (yearMap.get(year) ?? 0) + 1)
    })
    return Array.from(yearMap.entries())
      .map(([year, count]) => ({ label: String(year), value: count }))
      .sort((a, b) => Number(a.label) - Number(b.label))
  }, [reports])

  const summaryKpis: Array<{ key: SummaryKpiKey; label: string; value: string }> = [
    { key: 'totalProjects', label: 'Totalt Antall Kontrakter', value: loading ? '—' : computedStats.totalProjects.toLocaleString('en-US') },
    { key: 'totalSurfKm', label: 'Total SURF km', value: loading ? '—' : `${computedStats.totalSurfKm.toLocaleString('en-US')} km` },
    { key: 'totalXmts', label: 'Total XMTs', value: loading ? '—' : computedStats.totalXmts.toLocaleString('en-US') },
    // Hidden: duplicates "Totalt Antall Kontrakter" count – uncomment to restore
    // {
    //   key: 'upcomingAwards',
    //   label: view === 'historical' ? 'Awards siste 12m' : 'Kommende prosjekter',
    //   value: loading ? '—' : computedStats.upcomingAwards.toLocaleString('en-US'),
    // },
    { key: 'regions', label: 'Regioner', value: loading ? '—' : computedStats.regionCount.toLocaleString('en-US') },
  ]

  const openInsightPanel = (next: InsightState) => {
    setDrawerOpen(false)
    setSelectedProject(null)
    setInsightHistory((history) => {
      if (!history.length) return [next]
      const current = history[history.length - 1]
      if (current?.id === next.id) {
        return [...history.slice(0, -1), next]
      }
      return [...history, next]
    })
    setInsight(next)
  }

  const closeInsightPanel = () => {
    setInsight(null)
    setInsightHistory([])
  }

  const goBackInsightPanel = () => {
    setInsightHistory((history) => {
      if (history.length <= 1) return history
      const previous = history.slice(0, -1)
      setInsight(previous[previous.length - 1] ?? null)
      return previous
    })
  }

  const openProjectFromInsight = (project: Project) => {
    setInsight(null)
    setInsightHistory([])
    setSelectedProject(project)
    setDrawerOpen(true)
  }

  const openSummaryMetricFromInsight = (key: SummaryKpiKey) => {
    if (key === 'totalXmts' && insight?.id === 'summary-xmts') {
      openAllOperatorsInsight()
      return
    }

    if (key === 'totalSurfKm' && insight?.id === 'summary-surf-km') {
      openAllContractorsInsight()
      return
    }

    openSummaryKpiInsight(key)
  }

  const buildProjectInsight = ({
    id,
    title,
    subtitle,
    description,
    selectedProjects,
    chartTitle,
    chartKind = 'bar',
    chartFormat = 'count',
    chartData = [],
    onBarClick,
    listTitle,
    listItems = [],
    extraMetrics = [],
  }: ProjectInsightOptions) => {
    const surfTotal = selectedProjects.reduce((sum, project) => sum + (project.surf_km || 0), 0)
    const xmtTotal = selectedProjects.reduce((sum, project) => sum + (project.xmt_count || 0), 0)
    const coveragePct = viewProjects.length > 0 ? (selectedProjects.length / viewProjects.length) * 100 : 0

    openInsightPanel({
      id,
      title,
      subtitle,
      description,
      source: 'projects',
      metrics: [
        { label: 'Treff', value: selectedProjects.length.toLocaleString('en-US') },
        { label: 'Andel av view', value: `${coveragePct.toFixed(1)}%` },
        { label: 'SURF km', value: `${Math.round(surfTotal).toLocaleString('en-US')} km`, onClick: () => openSummaryMetricFromInsight('totalSurfKm') },
        { label: 'XMTs', value: Math.round(xmtTotal).toLocaleString('en-US'), onClick: () => openSummaryMetricFromInsight('totalXmts') },
        ...extraMetrics,
      ],
      chartTitle,
      chartKind,
      chartFormat,
      chartData,
      onBarClick,
      listTitle,
      listItems,
      projects: selectedProjects,
    })
  }

  const getProjectsByYear = (year: number): Project[] => (
    viewProjects.filter((project) => getProjectYear(project) === year)
  )

  const openSummaryKpiInsight = (key: SummaryKpiKey) => {
    if (loading) return

    if (key === 'totalProjects') {
      const uniqueOperators = new Set(viewProjects.map((project) => normalize(project.operator)).filter(Boolean)).size
      const uniqueContractors = new Set(viewProjects.map((project) => normalize(project.surf_contractor)).filter(Boolean)).size
      buildProjectInsight({
        id: 'summary-total-projects',
        title: 'Totalt Antall Kontrakter',
        subtitle: `${computedStats.totalProjects.toLocaleString('en-US')} aktive kontrakter`,
        description: 'Prosjektlisten under viser alle treff i valgt view og region.',
        selectedProjects: viewProjects,
        chartTitle: 'Prosjekter per år',
        chartKind: 'area',
        chartFormat: 'count',
        chartData: viewCharts.byYear.map((item) => ({ label: String(item.year), value: item.count })),
        onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openYearInsight(y) },
        listTitle: 'Største land',
        listItems: viewCharts.byCountry.slice(0, 10).map((item) => ({
          label: item.country,
          value: item.count.toLocaleString('en-US'),
          detail: `${((item.count / Math.max(viewProjects.length, 1)) * 100).toFixed(1)}% av view`,
          onClick: () => openCountryInsight(item.country),
        })),
        extraMetrics: [
          { label: 'Operatører', value: uniqueOperators.toLocaleString('en-US') },
          { label: 'Contractors', value: uniqueContractors.toLocaleString('en-US') },
        ],
      })
      return
    }

    if (key === 'totalSurfKm') {
      const projectsWithSurf = viewProjects.filter((project) => (project.surf_km || 0) > 0)
      const topContractors = aggregateProjectMetric(
        projectsWithSurf,
        (project) => project.surf_contractor || 'Ukjent contractor',
        (project) => project.surf_km || 0
      ).slice(0, 10)
      const topProjects = [...projectsWithSurf]
        .sort((a, b) => (b.surf_km || 0) - (a.surf_km || 0))
        .slice(0, 10)

      buildProjectInsight({
        id: 'summary-surf-km',
        title: 'Total SURF km',
        subtitle: `${computedStats.totalSurfKm.toLocaleString('en-US')} km`,
        description: 'Viser hvor SURF-omfanget faktisk ligger på prosjekt- og contractor-nivå.',
        selectedProjects: projectsWithSurf,
        chartTitle: 'Største prosjekt etter SURF km',
        chartFormat: 'km',
        chartData: topProjects.map((project) => ({
          label: getProjectDisplayName(project),
          value: project.surf_km || 0,
        })),
        onBarClick: (item) => {
          const selected = topProjects.find((project) => normalize(getProjectDisplayName(project)) === normalize(item.label))
          if (selected) openProjectFromInsight(selected)
        },
        listTitle: 'Contractors med høyest SURF-volum',
        listItems: topContractors.map((item) => ({
          label: item.label,
          value: `${Math.round(item.value).toLocaleString('en-US')} km`,
          onClick: () => openContractorInsight(item.label),
        })),
        extraMetrics: [
          {
            label: 'Snitt per prosjekt',
            value: projectsWithSurf.length ? `${Math.round(computedStats.totalSurfKm / projectsWithSurf.length)} km` : '0 km',
          },
        ],
      })
      return
    }

    if (key === 'totalXmts') {
      const projectsWithXmt = viewProjects.filter((project) => (project.xmt_count || 0) > 0)
      const topOperators = aggregateProjectMetric(
        projectsWithXmt,
        (project) => project.operator || 'Ukjent operatør',
        (project) => project.xmt_count || 0
      ).slice(0, 10)
      const topProjects = [...projectsWithXmt]
        .sort((a, b) => (b.xmt_count || 0) - (a.xmt_count || 0))
        .slice(0, 10)

      buildProjectInsight({
        id: 'summary-xmts',
        title: 'Total XMTs',
        subtitle: computedStats.totalXmts.toLocaleString('en-US'),
        description: 'XMT-fordeling fordelt på prosjekter og operatører.',
        selectedProjects: projectsWithXmt,
        chartTitle: 'Største prosjekt etter XMT',
        chartFormat: 'count',
        chartData: topProjects.map((project) => ({
          label: getProjectDisplayName(project),
          value: project.xmt_count || 0,
        })),
        onBarClick: (item) => {
          const selected = topProjects.find((project) => normalize(getProjectDisplayName(project)) === normalize(item.label))
          if (selected) openProjectFromInsight(selected)
        },
        listTitle: 'Operatører med høyest XMT-volum',
        listItems: topOperators.map((item) => ({
          label: item.label,
          value: Math.round(item.value).toLocaleString('en-US'),
          onClick: () => openOperatorInsight(item.label),
        })),
      })
      return
    }

    if (key === 'upcomingAwards') {
      const selectedProjects = viewProjects.filter((project) => {
        const year = getProjectYear(project) || 0
        if (view === 'historical') return year >= currentYear - 1 && year <= currentYear
        return year >= currentYear
      })
      const selectedCharts = buildChartsFromProjects(selectedProjects)

      buildProjectInsight({
        id: 'summary-upcoming-awards',
        title: view === 'historical' ? 'Awards siste 12 måneder' : 'Kommende prosjekter',
        subtitle: `${selectedProjects.length.toLocaleString('en-US')} treff`,
        description: 'Dette er den delen av prosjektbasen som faktisk ligger i nær tid.',
        selectedProjects,
        chartTitle: 'Fordeling per land',
        chartFormat: 'count',
        chartData: selectedCharts.byCountry.slice(0, 10).map((item) => ({ label: item.country, value: item.count })),
        onBarClick: (item) => openCountryInsight(item.label),
        listTitle: 'Nærmeste prosjekter',
        listItems: [...selectedProjects]
          .sort((a, b) => (getProjectYear(a) ?? 9999) - (getProjectYear(b) ?? 9999))
          .slice(0, 10)
          .map((project) => ({
            label: getProjectDisplayName(project),
            value: String(getProjectYear(project) ?? '—'),
            detail: `${project.country || 'Ukjent land'} • ${project.operator || project.surf_contractor || 'Ukjent aktør'}`,
          })),
      })
      return
    }

    const continentMap = new Map<string, number>()
    viewProjects.forEach((project) => {
      const continent = project.continent || 'Ukjent region'
      continentMap.set(continent, (continentMap.get(continent) ?? 0) + 1)
    })

    buildProjectInsight({
      id: 'summary-regions',
      title: 'Regioner',
      subtitle: `${computedStats.regionCount.toLocaleString('en-US')} regioner i view`,
      description: 'Bruk denne for rask oversikt over regional dekning.',
      selectedProjects: viewProjects,
      chartTitle: 'Land med høyest aktivitet',
      chartFormat: 'count',
      chartData: viewCharts.byCountry.slice(0, 12).map((item) => ({ label: item.country, value: item.count })),
      onBarClick: (item) => openCountryInsight(item.label),
      listTitle: 'Kontinentfordeling',
      listItems: Array.from(continentMap.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .map((item) => ({
          label: item.label,
          value: item.value.toLocaleString('en-US'),
          onClick: () => openRegionalRegionInsight(item.label),
        })),
      extraMetrics: [
        { label: 'Land', value: viewCharts.byCountry.length.toLocaleString('en-US') },
      ],
    })
  }

  const openPipelineYearInsight = (period: string) => {
    const year = Number(period)
    if (!Number.isFinite(year)) return
    const selectedProjects = getProjectsByYear(year)
    const pipelinePoint = pipelineData.find((point) => point.period === period)
    const phaseBreakdown = buildChartsFromProjects(selectedProjects).byPhase
    const topProjects = [...selectedProjects]
      .sort((a, b) => estimateProjectValue(b) - estimateProjectValue(a))
      .slice(0, 10)

    const coveragePct = viewProjects.length > 0 ? (selectedProjects.length / viewProjects.length) * 100 : 0
    const useRawYearTotals = view === 'future' && region === 'All'
    const rawXmtForYear = projectYearTotals.xmt[year]
    const rawSurfForYear = projectYearTotals.surf[year]
    const xmtForYear = useRawYearTotals && Number.isFinite(rawXmtForYear)
      ? rawXmtForYear
      : selectedProjects.reduce((sum, project) => sum + (project.xmt_count || 0), 0)
    const surfForYear = useRawYearTotals && Number.isFinite(rawSurfForYear)
      ? rawSurfForYear
      : selectedProjects.reduce((sum, project) => sum + (project.surf_km || 0), 0)

    openInsightPanel({
      id: `pipeline-year-${year}`,
      title: `Pipelineverdi ${year}`,
      subtitle: pipelinePoint ? formatMillions(pipelinePoint.value) : `${selectedProjects.length} prosjekter`,
      description: 'Klikk prosjekt i listen for full kontraktdetalj.',
      source: 'projects',
      metrics: [
        { label: 'Treff', value: selectedProjects.length.toLocaleString('en-US') },
        { label: 'Andel av view', value: `${coveragePct.toFixed(1)}%` },
        { label: 'SURF km', value: `${Math.round(surfForYear).toLocaleString('en-US')} km` },
        { label: 'XMTs', value: Math.round(xmtForYear).toLocaleString('en-US') },
        ...(pipelinePoint ? [{ label: 'Estimert verdi', value: formatMillions(pipelinePoint.value) }] : []),
      ],
      chartTitle: 'Faser i valgt år',
      chartFormat: 'count',
      chartData: phaseBreakdown.slice(0, 10).map((item) => ({ label: item.phase, value: item.count })),
      onBarClick: (item) => openPhaseInsight(item.label),
      listTitle: 'Prosjekter med høyest estimert verdi',
      listItems: topProjects.map((project) => ({
        label: getProjectDisplayName(project),
        value: formatMillions(estimateProjectValue(project)),
        detail: `${project.country || 'Ukjent land'} • ${project.operator || project.surf_contractor || 'Ukjent aktør'}`,
        onClick: () => openCountryInsight(project.country),
      })),
      projects: selectedProjects,
    })
  }

  const openPipelinePhaseInsight = (phaseLabel: string) => {
    const selectedProjects = phaseLabel === 'FEED'
      ? viewProjects
      : viewProjects.filter((project) => normalize(project.facility_category).includes(normalize(phaseLabel)))
    const selectedCharts = buildChartsFromProjects(selectedProjects)

    buildProjectInsight({
      id: `pipeline-phase-${normalize(phaseLabel)}`,
      title: `Pipelinefase: ${phaseLabel}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      description: 'Viser hvordan denne fasen er fordelt over tid og geografi.',
      selectedProjects,
      chartTitle: 'Utvikling per år',
      chartKind: 'area',
      chartFormat: 'count',
      chartData: selectedCharts.byYear.map((item) => ({ label: String(item.year), value: item.count })),
      onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openYearInsight(y) },
      listTitle: 'Største markeder i fasen',
      listItems: selectedCharts.byCountry.slice(0, 10).map((item) => ({
        label: item.country,
        value: item.count.toLocaleString('en-US'),
        onClick: () => openCountryInsight(item.country),
      })),
    })
  }

  const openPhaseInsight = (phase: string) => {
    const selectedProjects = viewProjects.filter(
      (project) => normalize(project.facility_category || 'Unknown') === normalize(phase)
    )
    const selectedCharts = buildChartsFromProjects(selectedProjects)

    buildProjectInsight({
      id: `phase-${normalize(phase)}`,
      title: `Fase: ${phase}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      selectedProjects,
      chartTitle: 'Prosjekter per år',
      chartKind: 'area',
      chartFormat: 'count',
      chartData: selectedCharts.byYear.map((item) => ({ label: String(item.year), value: item.count })),
      onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openYearInsight(y) },
      listTitle: 'Største land i fasen',
      listItems: selectedCharts.byCountry.slice(0, 10).map((item) => ({
        label: item.country,
        value: item.count.toLocaleString('en-US'),
        onClick: () => openCountryInsight(item.country),
      })),
    })
  }

  const openCountryInsight = (country: string) => {
    const selectedProjects = viewProjects.filter((project) => normalize(project.country) === normalize(country))
    const selectedCharts = buildChartsFromProjects(selectedProjects)

    buildProjectInsight({
      id: `country-${normalize(country)}`,
      title: `Land: ${country}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      selectedProjects,
      chartTitle: 'Fasefordeling',
      chartFormat: 'count',
      chartData: selectedCharts.byPhase.slice(0, 10).map((item) => ({ label: item.phase, value: item.count })),
      onBarClick: (item) => openPhaseInsight(item.label),
      listTitle: 'Viktigste operatører',
      listItems: aggregateProjectMetric(
        selectedProjects,
        (project) => project.operator || 'Ukjent operatør',
        () => 1
      )
        .slice(0, 10)
        .map((item) => ({
          label: item.label,
          value: Math.round(item.value).toLocaleString('en-US'),
          onClick: () => openOperatorInsight(item.label),
        })),
    })
  }

  const openDepthInsight = (depth: string) => {
    const selectedProjects = viewProjects.filter(
      (project) => normalize(project.water_depth_category || 'Unknown') === normalize(depth)
    )
    const selectedCharts = buildChartsFromProjects(selectedProjects)

    buildProjectInsight({
      id: `depth-${normalize(depth)}`,
      title: `Vanndybde: ${depth}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      selectedProjects,
      chartTitle: 'Prosjekter per år',
      chartKind: 'area',
      chartFormat: 'count',
      chartData: selectedCharts.byYear.map((item) => ({ label: String(item.year), value: item.count })),
      onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openYearInsight(y) },
      listTitle: 'Største land for dybdekategorien',
      listItems: selectedCharts.byCountry.slice(0, 10).map((item) => ({
        label: item.country,
        value: item.count.toLocaleString('en-US'),
        onClick: () => openCountryInsight(item.country),
      })),
    })
  }

  const openContractorInsight = (contractor: string) => {
    const selectedProjects = viewProjects.filter(
      (project) => normalize(project.surf_contractor) === normalize(contractor)
    )
    const selectedCharts = buildChartsFromProjects(selectedProjects)

    buildProjectInsight({
      id: `contractor-${normalize(contractor)}`,
      title: `Contractor: ${contractor}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      selectedProjects,
      chartTitle: 'Prosjekter per år',
      chartKind: 'area',
      chartFormat: 'count',
      chartData: selectedCharts.byYear.map((item) => ({ label: String(item.year), value: item.count })),
      onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openYearInsight(y) },
      listTitle: 'Land der contractor er aktiv',
      listItems: selectedCharts.byCountry.slice(0, 10).map((item) => ({
        label: item.country,
        value: item.count.toLocaleString('en-US'),
        onClick: () => openCountryInsight(item.country),
      })),
      extraMetrics: [
        {
          label: 'Estimert verdi',
          value: formatMillions(selectedProjects.reduce((sum, project) => sum + estimateProjectValue(project), 0)),
        },
      ],
    })
  }

  const openOperatorInsight = (operator: string) => {
    const selectedProjects = viewProjects.filter((project) => normalize(project.operator) === normalize(operator))
    const selectedCharts = buildChartsFromProjects(selectedProjects)

    buildProjectInsight({
      id: `operator-${normalize(operator)}`,
      title: `Operatør: ${operator}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      selectedProjects,
      chartTitle: 'Fasefordeling',
      chartFormat: 'count',
      chartData: selectedCharts.byPhase.slice(0, 10).map((item) => ({ label: item.phase, value: item.count })),
      onBarClick: (item) => openPhaseInsight(item.label),
      listTitle: 'Contractors i operatørporteføljen',
      listItems: aggregateProjectMetric(
        selectedProjects,
        (project) => project.surf_contractor || 'Ukjent contractor',
        () => 1
      )
        .slice(0, 10)
        .map((item) => ({
          label: item.label,
          value: Math.round(item.value).toLocaleString('en-US'),
          onClick: () => openContractorInsight(item.label),
        })),
    })
  }

  const openYearInsight = (year: number) => {
    const selectedProjects = getProjectsByYear(year)
    const selectedCharts = buildChartsFromProjects(selectedProjects)
    const coveragePct = viewProjects.length > 0 ? (selectedProjects.length / viewProjects.length) * 100 : 0
    const useRawYearTotals = view === 'future' && region === 'All'
    const rawXmtForYear = projectYearTotals.xmt[year]
    const rawSurfForYear = projectYearTotals.surf[year]
    const xmtForYear = useRawYearTotals && Number.isFinite(rawXmtForYear)
      ? rawXmtForYear
      : selectedProjects.reduce((sum, project) => sum + (project.xmt_count || 0), 0)
    const surfForYear = useRawYearTotals && Number.isFinite(rawSurfForYear)
      ? rawSurfForYear
      : selectedProjects.reduce((sum, project) => sum + (project.surf_km || 0), 0)

    openInsightPanel({
      id: `year-${year}`,
      title: `${year}: ${view === 'historical' ? 'Awards' : 'Prosjekter'}`,
      subtitle: `${selectedProjects.length.toLocaleString('en-US')} prosjekter`,
      source: 'projects',
      metrics: [
        { label: 'Treff', value: selectedProjects.length.toLocaleString('en-US') },
        { label: 'Andel av view', value: `${coveragePct.toFixed(1)}%` },
        { label: 'SURF km', value: `${Math.round(surfForYear).toLocaleString('en-US')} km` },
        { label: 'XMTs', value: Math.round(xmtForYear).toLocaleString('en-US') },
      ],
      chartTitle: 'Fasefordeling',
      chartFormat: 'count',
      chartData: selectedCharts.byPhase.slice(0, 10).map((item) => ({ label: item.phase, value: item.count })),
      onBarClick: (item) => openPhaseInsight(item.label),
      listTitle: 'Største land',
      listItems: selectedCharts.byCountry.slice(0, 10).map((item) => ({
        label: item.country,
        value: item.count.toLocaleString('en-US'),
        onClick: () => openCountryInsight(item.country),
      })),
      projects: selectedProjects,
    })
  }

  const openAllContractorsInsight = () => {
    const allContractors = viewCompanies.contractors
    const totalProjects = allContractors.reduce((sum, c) => sum + c.count, 0)
    openInsightPanel({
      id: 'all-contractors',
      title: 'Alle installasjonsselskaper',
      subtitle: `${allContractors.length} selskaper • ${totalProjects.toLocaleString('en-US')} prosjekter`,
      source: 'projects',
      metrics: [
        { label: 'Totalt selskaper', value: allContractors.length.toLocaleString('en-US') },
        { label: 'Totalt prosjekter', value: totalProjects.toLocaleString('en-US') },
        { label: 'Topp contractor', value: allContractors[0]?.name ?? '—' },
        { label: 'Topp prosjekter', value: (allContractors[0]?.count ?? 0).toLocaleString('en-US') },
      ],
      chartTitle: 'Prosjekter per contractor',
      chartKind: 'bar',
      chartFormat: 'count',
      chartData: allContractors.slice(0, 20).map((c) => ({ label: c.name, value: c.count })),
      onBarClick: (item) => openContractorInsight(item.label),
      listTitle: 'Komplett liste',
      listItems: allContractors.map((c) => ({
        label: c.name,
        value: c.count.toLocaleString('en-US'),
        onClick: () => openContractorInsight(c.name),
      })),
      projects: viewProjects,
    })
  }

  const openAllOperatorsInsight = () => {
    const allOperators = viewCompanies.operators
    const totalProjects = allOperators.reduce((sum, o) => sum + o.count, 0)
    openInsightPanel({
      id: 'all-operators',
      title: 'Alle operatører',
      subtitle: `${allOperators.length} operatører • ${totalProjects.toLocaleString('en-US')} prosjekter`,
      source: 'projects',
      metrics: [
        { label: 'Totalt operatører', value: allOperators.length.toLocaleString('en-US') },
        { label: 'Totalt prosjekter', value: totalProjects.toLocaleString('en-US') },
        { label: 'Topp operatør', value: allOperators[0]?.name ?? '—' },
        { label: 'Topp prosjekter', value: (allOperators[0]?.count ?? 0).toLocaleString('en-US') },
      ],
      chartTitle: 'Prosjekter per operatør',
      chartKind: 'bar',
      chartFormat: 'count',
      chartData: allOperators.slice(0, 20).map((o) => ({ label: o.name, value: o.count })),
      onBarClick: (item) => openOperatorInsight(item.label),
      listTitle: 'Komplett liste',
      listItems: allOperators.map((o) => ({
        label: o.name,
        value: o.count.toLocaleString('en-US'),
        onClick: () => openOperatorInsight(o.name),
      })),
      projects: viewProjects,
    })
  }

  const openMarketMetricInsight = (metric: MarketMetricKey) => {
    const metricConfig = {
      spend: { label: 'Total Subsea Spend', series: spendingByYear, format: 'currencyBillions' as InsightValueFormat },
      xmt: { label: 'XMT Installations', series: xmtByYear, format: 'count' as InsightValueFormat, suffix: 'units' },
      surf: { label: 'SURF km', series: surfByYear, format: 'km' as InsightValueFormat },
      growth: { label: 'YoY Growth', series: growthByYear, format: 'percent' as InsightValueFormat },
      brent: { label: 'Brent Oil Price', series: brentByYear, format: 'raw' as InsightValueFormat, suffix: 'USD/bbl' },
    }[metric]

    if (!metricConfig || !metricConfig.series.length) return

    const latest = metricConfig.series[metricConfig.series.length - 1]
    const previous = metricConfig.series.length > 1 ? metricConfig.series[metricConfig.series.length - 2] : null
    const delta = previous ? latest.value - previous.value : null
    const linkedProjects = getProjectsByYear(latest.year)
    const formatMetricValue = (value: number): string => {
      const formatted = formatInsightValue(value, metricConfig.format)
      return metricConfig.suffix ? `${formatted} ${metricConfig.suffix}` : formatted
    }

    openInsightPanel({
      id: `market-metric-${metric}`,
      title: metricConfig.label,
      subtitle: `${metricConfig.series[0].year}-${metricConfig.series[metricConfig.series.length - 1].year}`,
      description: 'Dette panelet bygger kun på markedsdata fra AI-tolkede rapporter.',
      source: 'market',
      metrics: [
        { label: 'Siste verdi', value: formatMetricValue(latest.value) },
        {
          label: 'YoY endring',
          value: delta === null ? '—' : `${formatMetricValue(Math.abs(delta))} ${delta > 0 ? 'opp' : delta < 0 ? 'ned' : 'uendret'}`,
          tone: delta === null ? 'neutral' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral',
        },
        { label: 'Datapunkter', value: metricConfig.series.length.toLocaleString('en-US') },
        { label: `Prosjekter i ${latest.year}`, value: linkedProjects.length.toLocaleString('en-US') },
      ],
      chartTitle: 'Historisk utvikling',
      chartKind: metric === 'spend' ? 'area' : 'bar',
      chartFormat: metricConfig.format,
      chartData: metricConfig.series.map((item) => ({
        label: String(item.year),
        value: item.value,
      })),
      onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openSpendingYearInsight(y) },
      listTitle: 'Siste datapunkter',
      listItems: [...metricConfig.series]
        .slice(-8)
        .reverse()
        .map((item) => ({
          label: String(item.year),
          value: formatMetricValue(item.value),
          onClick: () => openSpendingYearInsight(item.year),
        })),
      projects: linkedProjects,
    })
  }

  const openSpendingYearInsight = (year: number) => {
    const spendingPoint = spendingByYear.find((item) => item.year === year)
    const previousPoint = spendingByYear.find((item) => item.year === year - 1)
    const linkedProjects = getProjectsByYear(year)
    const regionalYear = regionalSpendData.find((item) => item.year === year) as Record<string, number> | undefined
    const regionalBreakdown = REGION_KEYS
      .map((region) => ({
        label: region.label,
        value: regionalYear?.[region.label],
      }))
      .filter((item): item is { label: string; value: number } => typeof item.value === 'number' && Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value)

    openInsightPanel({
      id: `market-spending-year-${year}`,
      title: `Subsea spend ${year}`,
      subtitle: spendingPoint ? formatBillions(spendingPoint.value) : 'Ingen verdi',
      source: 'market',
      metrics: [
        { label: 'Global spend', value: spendingPoint ? formatBillions(spendingPoint.value) : '—' },
        {
          label: 'YoY',
          value: spendingPoint && previousPoint && previousPoint.value !== 0
            ? formatPercent(((spendingPoint.value - previousPoint.value) / previousPoint.value) * 100)
            : '—',
          tone: spendingPoint && previousPoint ? (spendingPoint.value >= previousPoint.value ? 'up' : 'down') : 'neutral',
        },
        { label: 'Prosjekter i året', value: linkedProjects.length.toLocaleString('en-US') },
        { label: 'Regioner med data', value: regionalBreakdown.length.toLocaleString('en-US') },
      ],
      chartTitle: `Regional fordeling ${year}`,
      chartKind: 'bar',
      chartFormat: 'currencyBillions',
      chartData: regionalBreakdown.map((item) => ({ label: item.label, value: item.value })),
      onBarClick: (item) => openRegionalRegionInsight(item.label),
      listTitle: 'Regionandel',
      listItems: regionalBreakdown.map((item) => ({
        label: item.label,
        value: formatBillions(item.value),
        onClick: () => openRegionalRegionInsight(item.label),
      })),
      projects: linkedProjects,
    })
  }

  const openXmtYearInsight = (year: number) => {
    const xmtPoint = xmtByYear.find((item) => item.year === year)
    const linkedProjects = getProjectsByYear(year)
    const operatorBreakdown = aggregateProjectMetric(
      linkedProjects,
      (project) => project.operator || 'Ukjent operatør',
      (project) => project.xmt_count || 0
    ).slice(0, 10)

    openInsightPanel({
      id: `market-xmt-year-${year}`,
      title: `XMT installations ${year}`,
      subtitle: xmtPoint ? Math.round(xmtPoint.value).toLocaleString('en-US') : 'Ingen verdi',
      source: 'market',
      metrics: [
        { label: 'Forecast', value: xmtPoint ? Math.round(xmtPoint.value).toLocaleString('en-US') : '—' },
        { label: 'Prosjekter i året', value: linkedProjects.length.toLocaleString('en-US') },
        {
          label: 'Registrert i prosjektdata',
          value: Math.round(linkedProjects.reduce((sum, project) => sum + (project.xmt_count || 0), 0)).toLocaleString('en-US'),
        },
      ],
      chartTitle: 'Operatører i valgt år',
      chartKind: 'bar',
      chartFormat: 'count',
      chartData: operatorBreakdown.map((item) => ({
        label: item.label,
        value: item.value,
      })),
      onBarClick: (item) => openOperatorInsight(item.label),
      listTitle: 'Topp operatører',
      listItems: operatorBreakdown.map((item) => ({
        label: item.label,
        value: Math.round(item.value).toLocaleString('en-US'),
        onClick: () => openOperatorInsight(item.label),
      })),
      projects: linkedProjects,
    })
  }

  const openRegionalYearInsight = (year: number) => {
    const selected = regionalSpendData.find((item) => item.year === year) as Record<string, number> | undefined
    if (!selected) return

    const breakdown = REGION_KEYS
      .map((region) => ({
        label: region.label,
        value: selected[region.label],
      }))
      .filter((item): item is { label: string; value: number } => typeof item.value === 'number' && Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value)
    const total = breakdown.reduce((sum, item) => sum + item.value, 0)

    openInsightPanel({
      id: `regional-year-${year}`,
      title: `Regional spend ${year}`,
      subtitle: formatBillions(total),
      source: 'market',
      metrics: [
        { label: 'Total', value: formatBillions(total) },
        { label: 'Regioner med data', value: breakdown.length.toLocaleString('en-US') },
      ],
      chartTitle: 'Regionfordeling',
      chartKind: 'bar',
      chartFormat: 'currencyBillions',
      chartData: breakdown.map((item) => ({ label: item.label, value: item.value })),
      onBarClick: (item) => openRegionalRegionInsight(item.label),
      listTitle: 'Andel per region',
      listItems: breakdown.map((item) => ({
        label: item.label,
        value: formatBillions(item.value),
        detail: total > 0 ? `${((item.value / total) * 100).toFixed(1)}% av total` : undefined,
        onClick: () => openRegionalRegionInsight(item.label),
      })),
    })
  }

  const openRegionalRegionInsight = (regionLabel: string) => {
    const timeline = regionalSpendData
      .map((row) => {
        const record = row as Record<string, number>
        const value = record[regionLabel]
        return typeof value === 'number' && Number.isFinite(value)
          ? { label: String(row.year), value }
          : null
      })
      .filter((entry): entry is { label: string; value: number } => Boolean(entry))

    if (!timeline.length) return

    const latest = timeline[timeline.length - 1]
    const previous = timeline.length > 1 ? timeline[timeline.length - 2] : null
    const linkedProjects = viewProjects.filter((project) =>
      normalize(project.continent).includes(normalize(regionLabel))
    )

    openInsightPanel({
      id: `regional-region-${normalize(regionLabel)}`,
      title: regionLabel,
      subtitle: `Siste verdi ${formatBillions(latest.value)}`,
      source: 'market',
      metrics: [
        { label: 'Siste år', value: latest.label },
        { label: 'Siste verdi', value: formatBillions(latest.value) },
        {
          label: 'YoY',
          value: previous && previous.value !== 0 ? formatPercent(((latest.value - previous.value) / previous.value) * 100) : '—',
          tone: previous ? (latest.value >= previous.value ? 'up' : 'down') : 'neutral',
        },
        { label: 'Prosjektmatch', value: linkedProjects.length.toLocaleString('en-US') },
      ],
      chartTitle: 'Utvikling over tid',
      chartKind: 'area',
      chartFormat: 'currencyBillions',
      chartData: timeline,
      onBarClick: (item) => { const y = Number(item.label); if (Number.isFinite(y)) openSpendingYearInsight(y) },
      listTitle: 'Siste år',
      listItems: [...timeline]
        .reverse()
        .slice(0, 8)
        .map((item) => ({
          label: item.label,
          value: formatBillions(item.value),
          onClick: () => { const y = Number(item.label); if (Number.isFinite(y)) openSpendingYearInsight(y) },
        })),
      projects: linkedProjects,
    })
  }

  const openReportStatInsight = (key: 'totalReports' | 'withSummary' | 'withPdf' | 'latestReportDate') => {
    const sortedReports = [...reportInsights].sort(
      (a, b) => new Date(b.report.created_at).getTime() - new Date(a.report.created_at).getTime()
    )
    const source =
      key === 'withSummary'
        ? sortedReports.filter((item) => Boolean(item.report.ai_summary?.trim()))
        : key === 'withPdf'
          ? sortedReports.filter((item) => Boolean(item.report.download_url))
          : sortedReports

    openInsightPanel({
      id: `report-stat-${key}`,
      title: key === 'totalReports'
        ? 'Totalt antall rapporter'
        : key === 'withSummary'
          ? 'Rapporter med AI-sammendrag'
          : key === 'withPdf'
            ? 'Rapporter med PDF-link'
            : 'Siste oppdatering',
      subtitle: key === 'latestReportDate'
        ? reportStats.latestReportDate
        : source.length.toLocaleString('en-US'),
      source: 'reports',
      metrics: [
        { label: 'Rapporter', value: reportStats.totalReports.toLocaleString('en-US') },
        { label: 'Med sammendrag', value: reportStats.withSummary.toLocaleString('en-US') },
        { label: 'Med PDF-link', value: reportStats.withPdf.toLocaleString('en-US') },
        { label: 'Forecast-punkter', value: reportStats.forecastPoints.toLocaleString('en-US') },
      ],
      chartTitle: 'Rapporter per år',
      chartKind: 'bar',
      chartFormat: 'count',
      chartData: reportTimelineData,
      onBarClick: (item) => {
        const selectedYear = Number(item.label)
        if (Number.isFinite(selectedYear)) openReportYearInsight(selectedYear)
      },
      listTitle: 'Siste rapporter',
      listItems: source.slice(0, 12).map((item) => ({
        label: item.displayPeriod,
        value: formatReportDate(item.report.created_at),
        detail: item.report.download_url ? 'PDF tilgjengelig' : 'Ingen PDF-link',
      })),
    })
  }

  const openReportYearInsight = (year: number) => {
    const reportsForYear = reportInsights
      .filter((item) => {
        const createdAt = new Date(item.report.created_at)
        if (Number.isNaN(createdAt.getTime())) return false
        return createdAt.getFullYear() === year
      })
      .sort((a, b) => new Date(b.report.created_at).getTime() - new Date(a.report.created_at).getTime())

    if (!reportsForYear.length) return

    const monthCounts = new Map<number, number>()
    reportsForYear.forEach((item) => {
      const createdAt = new Date(item.report.created_at)
      if (Number.isNaN(createdAt.getTime())) return
      const month = createdAt.getMonth()
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
    })

    const monthSeries = Array.from(monthCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([month, count]) => ({
        label: new Date(year, month, 1).toLocaleString('nb-NO', { month: 'short' }),
        value: count,
      }))

    openInsightPanel({
      id: `report-year-${year}`,
      title: `Rapporter i ${year}`,
      subtitle: `${reportsForYear.length.toLocaleString('en-US')} rapporter`,
      source: 'reports',
      metrics: [
        { label: 'Rapporter i år', value: reportsForYear.length.toLocaleString('en-US') },
        { label: 'Med sammendrag', value: reportsForYear.filter((item) => Boolean(item.report.ai_summary?.trim())).length.toLocaleString('en-US') },
        { label: 'Med PDF-link', value: reportsForYear.filter((item) => Boolean(item.report.download_url)).length.toLocaleString('en-US') },
      ],
      chartTitle: 'Rapporter per måned',
      chartKind: 'area',
      chartFormat: 'count',
      chartData: monthSeries,
      listTitle: 'Rapporter',
      listItems: reportsForYear.slice(0, 12).map((item) => ({
        label: item.displayPeriod,
        value: formatReportDate(item.report.created_at),
        detail: item.report.download_url ? 'PDF tilgjengelig' : 'Ingen PDF-link',
      })),
    })
  }

  const clickableCardClass = 'cursor-pointer transition-colors hover:border-[var(--csub-gold-soft)] hover:bg-[color:rgba(77,184,158,0.08)]'
  const isInsightOpen = Boolean(insight)
  const canGoBackInsight = insightHistory.length > 1
  const activityLoading = loading || (view === 'future' && competitorLoading)
  const activeInsightCountry = insight?.id.startsWith('country-')
    ? insight.title.replace(/^Land:\s*/i, '')
    : null

  return (
    <div className="min-h-screen bg-[#070E13] text-gray-100">
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
          <section className="rounded-xl border border-[var(--csub-gold-soft)] bg-[color:rgba(228,160,16,0.1)] px-4 py-3 text-sm text-[var(--csub-gold)] font-mono">
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
                  Contract Awards
                </button>
                <button
                  type="button"
                  onClick={() => setView('future')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors cursor-pointer ${view === 'future' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)] font-semibold' : 'text-[var(--text-muted)] hover:text-white'}`}
                >
                  Kommende Prosjekter
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-base text-white">{viewLabel}</h3>
              <p className="text-xs text-[var(--text-muted)]">Viser globale data</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {summaryKpis.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              onClick={() => openSummaryKpiInsight(kpi.key)}
              disabled={loading}
              className={`bg-[var(--csub-dark)] p-6 rounded-xl border border-[var(--csub-light-soft)] shadow-lg flex flex-col justify-between text-left ${clickableCardClass} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <span className="text-xs font-sans text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</span>
              <span className="text-3xl font-mono font-semibold text-white mt-2">{kpi.value}</span>
              <span className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--csub-light)]">Klikk for drill-down</span>
            </button>
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
                      <Bar
                        dataKey="value"
                        fill="#4db89e"
                        radius={[4, 4, 0, 0]}
                        className="cursor-pointer"
                        onClick={(raw: unknown) => {
                          const data = raw as { period?: string }
                          if (data.period) openPipelineYearInsight(data.period)
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {pipelineFlowData.map((phase) => (
                    <button
                      key={phase.label}
                      type="button"
                      onClick={() => openPipelinePhaseInsight(phase.label)}
                      className={`rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.7)] p-3 text-center ${clickableCardClass}`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{phase.label}</p>
                      <p className="font-mono text-xl text-white mt-1">{phase.value.toLocaleString('en-US')}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel
            title="Siste hendelser"
            subtitle={`Last Updated: ${competitorMeta.last_scraped_at ? formatReportDateTime(competitorMeta.last_scraped_at) : '—'}`}
            className="min-h-[400px]"
          >
            {!activityFeed.length ? (
              <LoadingPlaceholder text={
                activityLoading
                  ? 'Laster hendelser...'
                  : view === 'future'
                    ? 'Ingen relevante konkurrenthendelser for kommende prosjekter'
                    : 'Ingen hendelser for valgt filter'
              } />
            ) : (
              <div className="flex h-[320px] flex-col gap-4 overflow-y-auto pr-2">
                {activityFeed.map((item) => (
                  item.url ? (
                    <a
                      key={`${item.title}-${item.meta}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 rounded-md pb-4 border-b border-[var(--csub-light-faint)] last:border-b-0 hover:bg-[color:rgba(77,184,158,0.08)] transition-colors"
                    >
                      <div className="w-2.5 h-2.5 mt-1.5 rounded-full bg-[var(--csub-gold)] shrink-0 shadow-[0_0_8px_var(--csub-gold)]" />
                      <div>
                        <p className="text-sm text-gray-100 group-hover:text-white">{item.title}</p>
                        <p className="text-xs text-[var(--csub-light)] font-mono mt-1">{item.meta}</p>
                      </div>
                    </a>
                  ) : item.project ? (
                    <button
                      key={`${item.title}-${item.meta}`}
                      type="button"
                      onClick={() => openDrawer(item.project!)}
                      className="group flex items-start gap-3 rounded-md pb-4 border-b border-[var(--csub-light-faint)] last:border-b-0 hover:bg-[color:rgba(77,184,158,0.08)] transition-colors cursor-pointer text-left w-full"
                    >
                      <div className="w-2.5 h-2.5 mt-1.5 rounded-full bg-[var(--csub-gold)] shrink-0 shadow-[0_0_8px_var(--csub-gold)]" />
                      <div>
                        <p className="text-sm text-gray-100 group-hover:text-white">{item.title}</p>
                        <p className="text-xs text-[var(--csub-light)] font-mono mt-1">{item.meta}</p>
                      </div>
                    </button>
                  ) : (
                    <div key={`${item.title}-${item.meta}`} className="flex items-start gap-3 pb-4 border-b border-[var(--csub-light-faint)] last:border-b-0">
                      <div className="w-2.5 h-2.5 mt-1.5 rounded-full bg-[var(--csub-gold)] shrink-0 shadow-[0_0_8px_var(--csub-gold)]" />
                      <div>
                        <p className="text-sm text-gray-100">{item.title}</p>
                        <p className="text-xs text-[var(--csub-light)] font-mono mt-1">{item.meta}</p>
                      </div>
                    </div>
                  )
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
                      <Pie
                        data={viewCharts.byPhase.slice(0, 6)}
                        dataKey="count"
                        nameKey="phase"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={70}
                        strokeWidth={0}
                        onClick={(raw: unknown) => {
                          const data = raw as { phase?: string }
                          if (data.phase) openPhaseInsight(data.phase)
                        }}
                        className="cursor-pointer"
                      >
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
                    <button
                      key={item.phase}
                      type="button"
                      onClick={() => openPhaseInsight(item.phase)}
                      className="flex items-center gap-2 text-xs text-left rounded px-2 py-1 hover:bg-[color:rgba(77,184,158,0.08)] cursor-pointer transition-colors"
                    >
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      <span className="truncate text-[var(--text-muted)]">{item.phase}</span>
                      <span className="font-mono font-semibold ml-auto text-white">{item.count.toLocaleString('en-US')}</span>
                    </button>
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
                      <Pie
                        data={viewCharts.byCountry.slice(0, 6)}
                        dataKey="count"
                        nameKey="country"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={70}
                        strokeWidth={0}
                        onClick={(raw: unknown) => {
                          const data = raw as { country?: string }
                          if (data.country) openCountryInsight(data.country)
                        }}
                        className="cursor-pointer"
                      >
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
                    <button
                      key={item.country}
                      type="button"
                      onClick={() => openCountryInsight(item.country)}
                      className="flex items-center gap-2 text-xs text-left rounded px-2 py-1 hover:bg-[color:rgba(77,184,158,0.08)] cursor-pointer transition-colors"
                    >
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      <span className="truncate text-[var(--text-muted)]">{item.country}</span>
                      <span className="font-mono font-semibold ml-auto text-white">{item.count.toLocaleString('en-US')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Countries">
            {!viewCharts.byCountry.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[260px] overflow-y-auto pr-2">
                <div className="flex flex-col gap-2">
                  {viewCharts.byCountry.map((item, index) => {
                    const share = viewProjects.length ? (item.count / viewProjects.length) * 100 : 0
                    return (
                      <button
                        key={item.country}
                        type="button"
                        onClick={() => openCountryInsight(item.country)}
                        className="flex items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left hover:border-[var(--csub-light-soft)] hover:bg-[color:rgba(77,184,158,0.08)] transition-colors cursor-pointer"
                      >
                        <span className="w-7 shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{String(index + 1).padStart(2, '0')}</span>
                        <span className="truncate text-sm text-white">{item.country}</span>
                        <span className="ml-auto text-right">
                          <span className="block font-mono text-sm text-white">{item.count.toLocaleString('en-US')}</span>
                          <span className="block text-[10px] text-[var(--text-muted)]">{share.toFixed(1)}%</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
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
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {viewCompanies.contractors.slice(0, 8).map((contractor) => {
                    const maxCount = Math.max(...viewCompanies.contractors.map((company) => company.count), 1)
                    return (
                      <button
                        key={contractor.name}
                        type="button"
                        onClick={() => openContractorInsight(contractor.name)}
                        className={`rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.55)] p-4 text-left ${clickableCardClass}`}
                      >
                        <p className="text-sm text-white truncate">{contractor.name}</p>
                        <p className="font-mono text-xl text-[var(--csub-light)] mt-1">{contractor.count.toLocaleString('en-US')}</p>
                        <div className="w-full h-1.5 mt-2 rounded bg-[color:rgba(77,184,158,0.14)]">
                          <div className="h-full rounded bg-gradient-to-r from-[var(--csub-light)] to-[var(--csub-gold)]" style={{ width: `${Math.round((contractor.count / maxCount) * 100)}%` }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
                {viewCompanies.contractors.length > 8 && (
                  <button
                    type="button"
                    onClick={openAllContractorsInsight}
                    className="w-full mt-3 rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-4 py-2.5 text-sm text-[var(--csub-light)] hover:text-white hover:border-[var(--csub-gold-soft)] transition-colors cursor-pointer"
                  >
                    Vis alle ({viewCompanies.contractors.length})
                  </button>
                )}
              </>
            )}
          </Panel>

          <Panel title="Operatoroversikt">
            {!viewCompanies.operators.length ? (
              <LoadingPlaceholder />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {viewCompanies.operators.slice(0, 10).map((operator) => (
                    <button
                      key={operator.name}
                      type="button"
                      onClick={() => openOperatorInsight(operator.name)}
                      className={`flex justify-between items-center rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3 text-left ${clickableCardClass}`}
                    >
                      <span className="text-sm text-[var(--text-muted)] truncate pr-3">{operator.name}</span>
                      <span className="font-mono text-sm text-white">{operator.count.toLocaleString('en-US')}</span>
                    </button>
                  ))}
                </div>
                {viewCompanies.operators.length > 10 && (
                  <button
                    type="button"
                    onClick={openAllOperatorsInsight}
                    className="w-full mt-3 rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] px-4 py-2.5 text-sm text-[var(--csub-light)] hover:text-white hover:border-[var(--csub-gold-soft)] transition-colors cursor-pointer"
                  >
                    Vis alle ({viewCompanies.operators.length})
                  </button>
                )}
              </>
            )}
          </Panel>
        </section>

        <section className="bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] overflow-hidden mt-6 shadow-lg">
          <div className="px-6 py-5 border-b border-[var(--csub-light-faint)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-lg text-white">{view === 'historical' ? 'Historisk kontraktoversikt' : 'Kommende prosjektoversikt'}</h2>
            {sortedProjects.length > DEFAULT_TABLE_ROWS ? (
              <button
                type="button"
                onClick={() => setShowAllTableRows((current) => !current)}
                className="text-xs text-[var(--csub-light)] hover:text-white transition-colors cursor-pointer"
              >
                Viser {visibleProjects.length.toLocaleString('en-US')} av {sortedProjects.length.toLocaleString('en-US')}
                {!showAllTableRows && ' — vis alle'}
              </button>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Viser {visibleProjects.length.toLocaleString('en-US')} av {sortedProjects.length.toLocaleString('en-US')}
              </p>
            )}
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
                    <td colSpan={TABLE_COLUMNS.length}>
                      <LoadingPlaceholder />
                    </td>
                  </tr>
                ) : sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLUMNS.length} className="px-4 py-6 text-center text-[var(--text-muted)]">
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
                        <td className="px-4 py-3 font-mono text-[var(--text-muted)] max-w-0 truncate">{getProjectYearLabel(project)}</td>
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
          {view === 'historical' && (
            <div className="m-4 flex items-center gap-2 rounded-lg border border-[var(--csub-gold-soft)] bg-[color:rgba(228,160,16,0.08)] px-4 py-3 text-xs text-[var(--text-muted)]">
              AI-vurdering: verifiser alltid output manuelt.
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Regioner - verdenskart">
            <MapSection
              countryData={viewCharts.byCountry}
              onCountrySelect={openCountryInsight}
              activeCountry={activeInsightCountry}
            />
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
                    <Bar
                      dataKey="count"
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer"
                      onClick={(raw: unknown) => {
                        const data = raw as { depth?: string }
                        if (data.depth) openDepthInsight(data.depth)
                      }}
                    >
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

        <section className="grid grid-cols-1 gap-6">
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
                    <Bar
                      dataKey="count"
                      fill="#4db89e"
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer"
                      onClick={(raw: unknown) => {
                        const data = raw as { year?: number }
                        if (typeof data.year === 'number') openYearInsight(data.year)
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>
      </main>

      <InsightDrawer
        insight={insight}
        open={isInsightOpen}
        onClose={closeInsightPanel}
        onBack={goBackInsightPanel}
        canGoBack={canGoBackInsight}
        onSelectProject={openProjectFromInsight}
      />

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

      <AIAgentPanel />
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

function InsightTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string | number
  format: InsightValueFormat
}) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value ?? 0
  const value = typeof raw === 'number' ? raw : Number(raw)
  return (
    <div className="bg-[var(--csub-dark)] p-3 rounded-lg border border-[var(--csub-light-soft)] shadow-xl">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="font-mono text-sm text-white">{formatInsightValue(value, format)}</p>
    </div>
  )
}

function InsightDrawer({
  insight,
  open,
  onClose,
  onBack,
  canGoBack,
  onSelectProject,
}: {
  insight: InsightState | null
  open: boolean
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
  onSelectProject: (project: Project) => void
}) {
  if (!insight) return null

  const gradientId = `insight-${insight.id.replace(/[^a-z0-9-]/gi, '')}`
  const chartFormat = insight.chartFormat ?? 'count'
  const chartData = insight.chartData ?? []
  const projectRows = insight.projects?.slice(0, 12) ?? []
  const sourceLabel = insight.source === 'projects' ? 'Project Data' : insight.source === 'market' ? 'Market Data' : 'Reports'
  const projectByChartLabel = new Map<string, Project>()
  insight.projects?.forEach((project) => {
    const key = normalize(getProjectDisplayName(project))
    if (!projectByChartLabel.has(key)) projectByChartLabel.set(key, project)
  })
  const hasProjectChartDrill = chartData.some((item) => projectByChartLabel.has(normalize(item.label)))
  const isChartClickable = Boolean(insight.onBarClick) || hasProjectChartDrill
  const handleInsightChartClick = (raw: unknown) => {
    const item = toInsightChartItem(raw)
    if (!item) return
    if (insight.onBarClick) {
      insight.onBarClick(item)
      return
    }
    const matchedProject = projectByChartLabel.get(normalize(item.label))
    if (matchedProject) onSelectProject(matchedProject)
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-[204]" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 bottom-0 w-[640px] max-w-[95vw] bg-[var(--csub-dark)] z-[205] transition-transform duration-300 border-r border-[var(--csub-light-soft)] ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full overflow-y-auto">
          <div className="sticky top-0 z-10 px-5 py-4 border-b border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.95)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--csub-light)]">{sourceLabel}</p>
                <h3 className="text-lg text-white mt-1 truncate">{insight.title}</h3>
                {insight.subtitle && <p className="text-xs text-[var(--text-muted)] mt-1">{insight.subtitle}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canGoBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-md border border-[var(--csub-light-soft)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-white hover:border-[var(--csub-light)] transition-colors cursor-pointer"
                    aria-label="Gå tilbake i drill-down"
                  >
                    ← Tilbake
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-white text-xl px-2 py-1 rounded hover:bg-white/15 cursor-pointer"
                  aria-label="Lukk drill-down"
                >
                  ×
                </button>
              </div>
            </div>
            {insight.description && (
              <p className="text-xs text-[var(--text-muted)] mt-3 leading-relaxed">{insight.description}</p>
            )}
          </div>

          <div className="p-5 space-y-5">
            {insight.metrics.length > 0 && (
              <section>
                <div className="grid grid-cols-2 gap-2">
                  {insight.metrics.map((metric, index) => {
                    const MetricTag = metric.onClick ? 'button' : 'div'
                    return (
                    <MetricTag
                      key={`${insight.id}-metric-${index}`}
                      {...(metric.onClick ? { type: 'button' as const, onClick: metric.onClick } : {})}
                      className={`rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.5)] px-3 py-2 text-left ${metric.onClick ? 'cursor-pointer hover:border-[var(--csub-gold-soft)] hover:bg-[color:rgba(77,184,158,0.08)] transition-colors' : ''}`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{metric.label}</p>
                      <p className={`font-mono text-sm mt-1 ${
                        metric.tone === 'up'
                          ? 'text-[var(--csub-light)]'
                          : metric.tone === 'down'
                            ? 'text-[#d29884]'
                            : 'text-white'
                      }`}>
                        {metric.value}
                      </p>
                      {metric.onClick && <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--csub-light)] mt-1 block opacity-60">Klikk for detaljer</span>}
                    </MetricTag>
                    )
                  })}
                </div>
              </section>
            )}

            {insight.chartTitle && chartData.length > 0 && (
              <section>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)] mb-3">{insight.chartTitle}</p>
                <div className="h-[250px] rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                  <ResponsiveContainer>
                    {insight.chartKind === 'area' ? (
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4db89e" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#4db89e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                        <Tooltip content={<InsightTooltip format={chartFormat} />} cursor={{ stroke: '#4db89e', strokeOpacity: 0.2 }} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#4db89e"
                          fill={`url(#${gradientId})`}
                          strokeWidth={2}
                          className={isChartClickable ? 'cursor-pointer' : ''}
                          onClick={isChartClickable ? handleInsightChartClick : undefined}
                        />
                      </AreaChart>
                    ) : (
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} angle={-20} textAnchor="end" height={58} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                        <Tooltip content={<InsightTooltip format={chartFormat} />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                        <Bar
                          dataKey="value"
                          fill="#4db89e"
                          radius={[4, 4, 0, 0]}
                          className={isChartClickable ? 'cursor-pointer' : ''}
                          onClick={isChartClickable ? handleInsightChartClick : undefined}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {insight.listTitle && (insight.listItems?.length ?? 0) > 0 && (
              <section>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">{insight.listTitle}</p>
                <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] divide-y divide-[var(--csub-light-faint)]">
                  {insight.listItems?.map((item, index) => {
                    const ListTag = item.onClick ? 'button' : 'div'
                    return (
                    <ListTag
                      key={`${insight.id}-list-${index}`}
                      {...(item.onClick ? { type: 'button' as const, onClick: item.onClick } : {})}
                      className={`px-3 py-2 w-full text-left ${item.onClick ? 'cursor-pointer hover:bg-[color:rgba(77,184,158,0.08)] transition-colors' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-white truncate">{item.label}</span>
                        <span className="font-mono text-sm text-[var(--csub-light)] shrink-0">{item.value}</span>
                      </div>
                      {item.detail && <p className="text-xs text-[var(--text-muted)] mt-1">{item.detail}</p>}
                    </ListTag>
                    )
                  })}
                </div>
              </section>
            )}

            <section>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Relaterte prosjekter</p>
              {projectRows.length > 0 ? (
                <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] divide-y divide-[var(--csub-light-faint)]">
                  {projectRows.map((project) => (
                    <button
                      key={`${insight.id}-${buildProjectKey(project)}`}
                      type="button"
                      onClick={() => onSelectProject(project)}
                      className="w-full text-left px-3 py-2 hover:bg-[color:rgba(77,184,158,0.08)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-white truncate">{getProjectDisplayName(project)}</span>
                        <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">{getProjectYear(project) ?? '—'}</span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1 truncate">
                        {project.country || 'Ukjent land'} • {project.operator || project.surf_contractor || 'Ukjent aktør'}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.35)] px-3 py-4 text-xs text-[var(--text-muted)]">
                  Ingen direkte prosjektkobling for denne statistikken.
                </div>
              )}
            </section>
          </div>
        </div>
      </aside>
    </>
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

function DropZone({ onImportComplete }: { onImportComplete?: () => void | Promise<void> }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const maxSizeBytes = 25 * 1024 * 1024
  const maxPollDurationMs = 8 * 60 * 1000
  const isBusy = uploading || Boolean(activeJobId)

  useEffect(() => {
    if (!activeJobId) return

    let cancelled = false
    let finished = false
    let intervalId = 0
    let timeoutId = 0

    const finishPolling = () => {
      finished = true
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }

    const pollJob = async () => {
      if (cancelled || finished) return

      try {
        const response = await fetch(`/api/import/status?job_id=${encodeURIComponent(activeJobId)}`, {
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => [])
        if (!response.ok) {
          throw new Error((payload as { error?: string })?.error || `Status API feilet (${response.status})`)
        }

        const rows = Array.isArray(payload) ? payload : []
        const job = rows[0] as {
          status?: string
          records_total?: number | null
          records_imported?: number | null
          error_message?: string | null
        } | undefined

        if (!job) {
          setStatusMessage('Rapport i kø. Venter på prosessering...')
          return
        }

        const status = typeof job.status === 'string' ? job.status : ''

        if (status === 'pending') {
          setStatusMessage('Rapport i kø. Venter på prosessering...')
          return
        }

        if (status === 'processing') {
          const imported = Number(job.records_imported ?? 0)
          const total = Number(job.records_total ?? 0)
          if (Number.isFinite(total) && total > 0) {
            setStatusMessage(`Genererer markedsrapport... (${imported}/${total})`)
          } else {
            setStatusMessage('Genererer markedsrapport med AI...')
          }
          return
        }

        if (status === 'completed') {
          finishPolling()
          setActiveJobId(null)
          setErrorMessage(null)
          setStatusMessage('Rapport ferdig. Oppdaterer dashboard...')
          try {
            await onImportComplete?.()
            setStatusMessage('Rapport ferdig. Dashboardet er oppdatert.')
          } catch (refreshError) {
            const message = refreshError instanceof Error ? refreshError.message : String(refreshError)
            setErrorMessage(`Rapport ferdig, men oppdatering feilet: ${message}`)
            setStatusMessage('Rapport ferdig, men dashboardet ble ikke oppdatert automatisk.')
          }
          return
        }

        if (status === 'failed') {
          finishPolling()
          setActiveJobId(null)
          setStatusMessage(null)
          setErrorMessage(job.error_message || 'AI-prosesseringen feilet.')
          return
        }

        setStatusMessage('Venter på status fra importmotor...')
      } catch {
        if (cancelled || finished) return
        setStatusMessage('Mister kontakt med importmotor. Forsoker igjen...')
      }
    }

    void pollJob()
    intervalId = window.setInterval(() => {
      void pollJob()
    }, 3000)
    timeoutId = window.setTimeout(() => {
      if (cancelled || finished) return
      finishPolling()
      setActiveJobId(null)
      setStatusMessage(null)
      setErrorMessage('Import tok for lang tid. Sjekk status igjen om litt.')
    }, maxPollDurationMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [activeJobId, maxPollDurationMs, onImportComplete])

  const queueMarketReport = useCallback(async (file: File) => {
    if (isBusy) return

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

      const queuedJobId = typeof payload?.job_id === 'string' ? payload.job_id : ''
      if (!queuedJobId) {
        throw new Error('Importen startet, men mangler job-id for statussporing.')
      }

      setStatusMessage('Rapport i kø. Venter på prosessering...')
      setActiveJobId(queuedJobId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setStatusMessage(null)
    } finally {
      setUploading(false)
    }
  }, [isBusy, maxSizeBytes])

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (isBusy) return
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (isBusy) return
    const droppedFile = event.dataTransfer.files?.[0]
    if (!droppedFile) return
    void queueMarketReport(droppedFile)
  }

  const onSelectFile = () => {
    if (isBusy) return

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
        {uploading ? 'Laster opp markedsrapport...' : activeJobId ? 'Genererer markedsrapport med AI...' : 'Slipp PDF her eller klikk for opplasting'}
      </div>
      <div className="text-xs mt-2 text-[var(--text-muted)]">
        {statusMessage || (activeJobId
          ? 'Rapporten behandles. Dashboard oppdateres automatisk når den er ferdig.'
          : 'PDF analyseres med AI, forecasts og nøkkeltall oppdateres automatisk.')}
      </div>
      {errorMessage && <div className="mt-3 text-xs text-red-400">{errorMessage}</div>}
    </div>
  )
}
