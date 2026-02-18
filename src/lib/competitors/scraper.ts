import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { COMPETITOR_COMPANIES, type CompetitorCompany } from './companies'

export type CompetitorSignalType =
  | 'contract_award'
  | 'tender'
  | 'project_sanction'
  | 'operations'
  | 'partnership'
  | 'corporate'
  | 'other'

export type CompetitorImportance = 'high' | 'medium' | 'low'

export interface CompetitorEventRecord {
  external_id: string
  competitor_name: string
  title: string
  summary: string | null
  url: string
  source: string
  published_at: string | null
  event_date: string | null
  signal_type: CompetitorSignalType
  relevance_score: number
  relevance_reason: string
  ai_summary: string | null
  importance: CompetitorImportance
  is_upcoming: boolean
  tags: string[]
  raw_payload: Record<string, unknown>
  scraped_at: string
}

interface ParsedRssItem {
  title: string
  description: string
  link: string
  source: string
  sourceUrl: string | null
  publishedAt: string | null
}

interface HeuristicAssessment {
  relevanceScore: number
  relevanceReason: string
  importance: CompetitorImportance
  isUpcoming: boolean
  signalType: CompetitorSignalType
  eventDate: string | null
  tags: string[]
  summary: string | null
}

interface AiAssessment {
  relevanceScore: number | null
  importance: CompetitorImportance | null
  isUpcoming: boolean | null
  signalType: CompetitorSignalType | null
  relevanceReason: string | null
  aiSummary: string | null
  eventDate: string | null
  tags: string[]
}

export interface CollectCompetitorEventsOptions {
  maxAgeDays?: number
  perCompanyLimit?: number
  globalLimit?: number
  minRelevanceScore?: number
  companies?: CompetitorCompany[]
  useAI?: boolean
  aiItemLimit?: number
}

export interface CollectCompetitorEventsResult {
  events: CompetitorEventRecord[]
  stats: {
    companies: number
    fetchedItems: number
    filteredItems: number
    aiEnriched: number
  }
}

const FEED_TIMEOUT_MS = 15_000
const FETCH_CONCURRENCY = 6
const AI_CONCURRENCY = 2
const DEFAULT_MAX_AGE_DAYS = 45
const DEFAULT_PER_COMPANY_LIMIT = 8
const DEFAULT_GLOBAL_LIMIT = 120
const DEFAULT_MIN_RELEVANCE_SCORE = 0.52
const DEFAULT_AI_ITEM_LIMIT = 24

const SEARCH_SIGNAL_QUERY = [
  '(subsea OR offshore OR SURF OR SPS OR umbilical OR pipeline OR deepwater)',
  '(contract OR award OR tender OR FEED OR project OR installation OR vessel)',
].join(' ')

const POSITIVE_KEYWORDS: Array<{ term: string; weight: number; tag: string }> = [
  { term: 'contract award', weight: 0.35, tag: 'award' },
  { term: 'awarded', weight: 0.22, tag: 'award' },
  { term: 'contract', weight: 0.18, tag: 'award' },
  { term: 'tender', weight: 0.24, tag: 'tender' },
  { term: 'bid', weight: 0.17, tag: 'tender' },
  { term: 'epci', weight: 0.22, tag: 'epci' },
  { term: 'subsea', weight: 0.16, tag: 'subsea' },
  { term: 'surf', weight: 0.12, tag: 'surf' },
  { term: 'sps', weight: 0.12, tag: 'sps' },
  { term: 'umbilical', weight: 0.12, tag: 'umbilical' },
  { term: 'pipeline', weight: 0.12, tag: 'pipeline' },
  { term: 'field development', weight: 0.17, tag: 'field' },
  { term: 'feed', weight: 0.16, tag: 'feed' },
  { term: 'fid', weight: 0.16, tag: 'fid' },
  { term: 'deepwater', weight: 0.12, tag: 'deepwater' },
  { term: 'offshore', weight: 0.1, tag: 'offshore' },
  { term: 'installation', weight: 0.12, tag: 'installation' },
  { term: 'vessel', weight: 0.08, tag: 'vessel' },
  { term: 'mobilization', weight: 0.12, tag: 'operations' },
  { term: 'joint venture', weight: 0.1, tag: 'partnership' },
  { term: 'partnership', weight: 0.09, tag: 'partnership' },
  { term: 'agreement', weight: 0.08, tag: 'agreement' },
  { term: 'mou', weight: 0.08, tag: 'mou' },
]

const NEGATIVE_KEYWORDS: Array<{ term: string; weight: number }> = [
  { term: 'quarterly results', weight: 0.22 },
  { term: 'q1 results', weight: 0.2 },
  { term: 'q2 results', weight: 0.2 },
  { term: 'q3 results', weight: 0.2 },
  { term: 'q4 results', weight: 0.2 },
  { term: 'earnings call', weight: 0.2 },
  { term: 'share price', weight: 0.16 },
  { term: 'dividend', weight: 0.12 },
  { term: 'stock exchange', weight: 0.16 },
  { term: 'annual general meeting', weight: 0.16 },
  { term: 'esg report', weight: 0.1 },
]

const UPCOMING_HINTS = [
  'will',
  'to be',
  'expected',
  'planned',
  'upcoming',
  'tender',
  'bid',
  'targeting',
  'scheduled',
  'forecast',
]

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
}

let openAIClient: OpenAI | null | undefined

function getOpenAIClient(): OpenAI | null {
  if (openAIClient !== undefined) return openAIClient
  const apiKey = process.env.OPENAI_API_KEY
  openAIClient = apiKey ? new OpenAI({ apiKey }) : null
  return openAIClient
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, token: string) => {
    if (token.startsWith('#x') || token.startsWith('#X')) {
      const code = Number.parseInt(token.slice(2), 16)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }

    if (token.startsWith('#')) {
      const code = Number.parseInt(token.slice(1), 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }

    return ENTITY_MAP[token] ?? match
  })
}

function stripHtml(value: string): string {
  return compactWhitespace(value.replace(/<[^>]+>/g, ' '))
}

function sanitizeText(value: string | null | undefined): string {
  if (!value) return ''
  return stripHtml(decodeHtmlEntities(value.replace(/<!\[CDATA\[|\]\]>/g, '')))
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function extractTag(itemBlock: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = itemBlock.match(pattern)
  return sanitizeText(match?.[1] ?? '')
}

function extractSource(itemBlock: string): { source: string; sourceUrl: string | null } {
  const match = itemBlock.match(/<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i)
  if (!match) return { source: '', sourceUrl: null }
  return {
    source: sanitizeText(match[2]),
    sourceUrl: match[1] ? sanitizeText(match[1]) : null,
  }
}

function parseDate(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function dateWithinDays(isoDate: string | null, maxAgeDays: number): boolean {
  if (!isoDate) return false
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return false
  const ageMs = Date.now() - parsed.getTime()
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000
}

function parseRssItems(xml: string): ParsedRssItem[] {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []

  return itemBlocks.map((itemBlock) => {
    const sourceData = extractSource(itemBlock)
    return {
      title: extractTag(itemBlock, 'title'),
      description: extractTag(itemBlock, 'description'),
      link: extractTag(itemBlock, 'link'),
      source: sourceData.source,
      sourceUrl: sourceData.sourceUrl,
      publishedAt: parseDate(extractTag(itemBlock, 'pubDate')),
    }
  }).filter((item) => item.title.length > 0 && item.link.length > 0)
}

function hostnameFromUrl(urlValue: string): string {
  try {
    const url = new URL(urlValue)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return 'unknown-source'
  }
}

function buildGoogleNewsFeedUrl(companyName: string): string {
  const url = new URL('https://news.google.com/rss/search')
  url.searchParams.set('q', `"${companyName}" ${SEARCH_SIGNAL_QUERY}`)
  url.searchParams.set('hl', 'en-US')
  url.searchParams.set('gl', 'US')
  url.searchParams.set('ceid', 'US:en')
  return url.toString()
}

function detectSignalType(text: string): CompetitorSignalType {
  if (/\b(tender|bid|prequalif|rfp)\b/i.test(text)) return 'tender'
  if (/\b(award|awarded|wins? contract|secures? contract|order worth|contract)\b/i.test(text)) return 'contract_award'
  if (/\b(feed|pre-feed|front-end engineering|fid|sanction)\b/i.test(text)) return 'project_sanction'
  if (/\b(vessel|mobilization|installation campaign|hook-up|commissioning)\b/i.test(text)) return 'operations'
  if (/\b(partnership|joint venture|mou|memorandum of understanding|alliance)\b/i.test(text)) return 'partnership'
  if (/\b(acquisition|merger|divestment|sale of)\b/i.test(text)) return 'corporate'
  return 'other'
}

function extractEventDate(text: string): string | null {
  const fullDateMatch = text.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i
  )
  if (fullDateMatch) {
    const parsed = parseDate(fullDateMatch[0])
    if (parsed) return parsed.slice(0, 10)
  }

  const quarterMatch = text.match(/\bQ([1-4])\s*(20\d{2})\b/i)
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1])
    const year = Number(quarterMatch[2])
    const month = String((quarter - 1) * 3 + 1).padStart(2, '0')
    return `${year}-${month}-01`
  }

  return null
}

function detectUpcoming(text: string, signalType: CompetitorSignalType, eventDate: string | null): boolean {
  const normalized = normalizeText(text)
  if (UPCOMING_HINTS.some((hint) => normalized.includes(hint))) return true

  if (signalType === 'tender' || signalType === 'project_sanction') return true

  if (eventDate) {
    const parsed = new Date(eventDate)
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() >= Date.now()) return true
  }

  const years = normalized.match(/\b20\d{2}\b/g) ?? []
  const currentYear = new Date().getUTCFullYear()
  return years.some((yearText) => Number(yearText) >= currentYear)
}

function scoreImportance(score: number): CompetitorImportance {
  if (score >= 0.75) return 'high'
  if (score >= 0.56) return 'medium'
  return 'low'
}

function assessHeuristics(company: CompetitorCompany, item: ParsedRssItem): HeuristicAssessment {
  const text = `${item.title}\n${item.description}`
  const normalizedText = normalizeText(text)
  const companyMatch = company.aliases.some((alias) => normalizedText.includes(normalizeText(alias)))

  let score = companyMatch ? 0.3 : 0.16
  const tags = new Set<string>()

  for (const keyword of POSITIVE_KEYWORDS) {
    if (normalizedText.includes(keyword.term)) {
      score += keyword.weight
      tags.add(keyword.tag)
    }
  }

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (normalizedText.includes(keyword.term)) {
      score -= keyword.weight
    }
  }

  score = Math.max(0, Math.min(1, score))
  const signalType = detectSignalType(text)
  const eventDate = extractEventDate(text)
  const isUpcoming = detectUpcoming(text, signalType, eventDate)
  const importance = scoreImportance(score)
  const topTags = Array.from(tags).slice(0, 6)

  const reasons: string[] = []
  if (companyMatch) reasons.push('company mention')
  if (signalType !== 'other') reasons.push(signalType.replace('_', ' '))
  if (topTags.length) reasons.push(topTags.slice(0, 3).join(', '))
  if (isUpcoming) reasons.push('upcoming indicator')

  const summarySource = item.description || item.title
  const summary = summarySource ? truncate(summarySource, 240) : null

  return {
    relevanceScore: score,
    relevanceReason: reasons.join(' | ') || 'keyword relevance',
    importance,
    isUpcoming,
    signalType,
    eventDate,
    tags: topTags,
    summary,
  }
}

function normalizeAiSignalType(value: string | null | undefined): CompetitorSignalType | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'contract_award' || normalized === 'tender' || normalized === 'project_sanction' || normalized === 'operations' || normalized === 'partnership' || normalized === 'corporate' || normalized === 'other') {
    return normalized
  }
  return null
}

function normalizeAiImportance(value: string | null | undefined): CompetitorImportance | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized
  return null
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    const start = value.indexOf('{')
    const end = value.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(value.slice(start, end + 1)) as T
    } catch {
      return null
    }
  }
}

async function assessWithAI(company: CompetitorCompany, item: ParsedRssItem): Promise<AiAssessment | null> {
  const client = getOpenAIClient()
  if (!client) return null

  const prompt = [
    'Classify this competitor news item for CSUB sales intelligence.',
    'Return one JSON object only with this schema:',
    '{',
    '  "relevance_score": number (0-1),',
    '  "importance": "high" | "medium" | "low",',
    '  "is_upcoming": boolean,',
    '  "signal_type": "contract_award" | "tender" | "project_sanction" | "operations" | "partnership" | "corporate" | "other",',
    '  "relevance_reason": string,',
    '  "ai_summary": string,',
    '  "event_date": "YYYY-MM-DD" | null,',
    '  "tags": string[]',
    '}',
    'Prioritize events that can help sales: tenders, awards, installation campaigns, FEED/FID, subsea scope changes.',
    `Company: ${company.name}`,
    `Title: ${item.title}`,
    `Description: ${item.description || 'n/a'}`,
    `Published at: ${item.publishedAt || 'n/a'}`,
    `Source: ${item.source || 'n/a'}`,
  ].join('\n')

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-5.2',
      temperature: 0,
      max_completion_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawContent = completion.choices[0]?.message?.content
    if (typeof rawContent !== 'string') return null
    const parsed = safeJsonParse<{
      relevance_score?: number
      importance?: string
      is_upcoming?: boolean
      signal_type?: string
      relevance_reason?: string
      ai_summary?: string
      event_date?: string | null
      tags?: string[]
    }>(rawContent)

    if (!parsed) return null
    return {
      relevanceScore: typeof parsed.relevance_score === 'number' ? Math.max(0, Math.min(1, parsed.relevance_score)) : null,
      importance: normalizeAiImportance(parsed.importance),
      isUpcoming: typeof parsed.is_upcoming === 'boolean' ? parsed.is_upcoming : null,
      signalType: normalizeAiSignalType(parsed.signal_type),
      relevanceReason: typeof parsed.relevance_reason === 'string' ? parsed.relevance_reason.trim() : null,
      aiSummary: typeof parsed.ai_summary === 'string' ? truncate(parsed.ai_summary.trim(), 240) : null,
      eventDate: typeof parsed.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.event_date) ? parsed.event_date : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8) : [],
    }
  } catch {
    return null
  }
}

function mergeAssessment(
  company: CompetitorCompany,
  item: ParsedRssItem,
  heuristic: HeuristicAssessment,
  ai: AiAssessment | null
): CompetitorEventRecord {
  const relevanceScore = ai?.relevanceScore ?? heuristic.relevanceScore
  const importance = ai?.importance ?? heuristic.importance
  const isUpcoming = ai?.isUpcoming ?? heuristic.isUpcoming
  const signalType = ai?.signalType ?? heuristic.signalType
  const eventDate = ai?.eventDate ?? heuristic.eventDate
  const summary = ai?.aiSummary ?? heuristic.summary
  const tags = Array.from(new Set([...(heuristic.tags || []), ...(ai?.tags || [])])).slice(0, 8)

  const cleanTitle = item.source && item.title.endsWith(` - ${item.source}`)
    ? item.title.slice(0, -` - ${item.source}`.length).trim()
    : item.title

  const scrapedAt = new Date().toISOString()
  const uniqueSeed = `${company.name}|${item.link}|${cleanTitle.toLowerCase()}`

  return {
    external_id: createHash('sha256').update(uniqueSeed).digest('hex'),
    competitor_name: company.name,
    title: cleanTitle,
    summary: summary || null,
    url: item.link,
    source: item.source || hostnameFromUrl(item.link),
    published_at: item.publishedAt,
    event_date: eventDate,
    signal_type: signalType,
    relevance_score: Number(relevanceScore.toFixed(3)),
    relevance_reason: ai?.relevanceReason || heuristic.relevanceReason,
    ai_summary: ai?.aiSummary || null,
    importance,
    is_upcoming: isUpcoming,
    tags,
    raw_payload: {
      title: item.title,
      description: item.description,
      source: item.source,
      source_url: item.sourceUrl,
      published_at: item.publishedAt,
      feed_provider: 'google_news_rss',
    },
    scraped_at: scrapedAt,
  }
}

async function fetchFeed(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'CSUBDash/1.0 (+sales-intelligence-competitor-scraper)',
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Feed request failed: ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = index
      index += 1
      if (currentIndex >= items.length) return
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
  return results
}

export async function collectCompetitorEvents(
  options: CollectCompetitorEventsOptions = {}
): Promise<CollectCompetitorEventsResult> {
  const companies = options.companies?.length ? options.companies : COMPETITOR_COMPANIES
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS
  const perCompanyLimit = options.perCompanyLimit ?? DEFAULT_PER_COMPANY_LIMIT
  const globalLimit = options.globalLimit ?? DEFAULT_GLOBAL_LIMIT
  const minRelevanceScore = options.minRelevanceScore ?? DEFAULT_MIN_RELEVANCE_SCORE
  const useAI = options.useAI ?? Boolean(getOpenAIClient())
  const aiItemLimit = options.aiItemLimit ?? DEFAULT_AI_ITEM_LIMIT

  const fetchedByCompany = await mapWithConcurrency(companies, FETCH_CONCURRENCY, async (company) => {
    try {
      const feedUrl = buildGoogleNewsFeedUrl(company.name)
      const xml = await fetchFeed(feedUrl)
      const items = parseRssItems(xml)
        .filter((item) => dateWithinDays(item.publishedAt, maxAgeDays))
        .slice(0, perCompanyLimit)
      return { company, items }
    } catch {
      return { company, items: [] as ParsedRssItem[] }
    }
  })

  let fetchedItems = 0
  const assessedRecords: CompetitorEventRecord[] = []

  for (const entry of fetchedByCompany) {
    fetchedItems += entry.items.length
    for (const item of entry.items) {
      const heuristic = assessHeuristics(entry.company, item)
      assessedRecords.push(mergeAssessment(entry.company, item, heuristic, null))
    }
  }

  assessedRecords.sort((a, b) => {
    const scoreDiff = b.relevance_score - a.relevance_score
    if (scoreDiff !== 0) return scoreDiff
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0
    return timeB - timeA
  })

  const seenIds = new Set<string>()
  const dedupedRecords = assessedRecords.filter((event) => {
    if (seenIds.has(event.external_id)) return false
    seenIds.add(event.external_id)
    return true
  })

  let filtered = dedupedRecords.filter((event) => {
    if (event.relevance_score >= minRelevanceScore) return true
    return event.is_upcoming && event.relevance_score >= Math.max(0.42, minRelevanceScore - 0.08)
  })

  let aiEnriched = 0
  if (useAI && filtered.length > 0) {
    const toEnhance = filtered.slice(0, aiItemLimit)
    const aiResults = await mapWithConcurrency(toEnhance, AI_CONCURRENCY, async (event) => {
      const company = companies.find((candidate) => candidate.name === event.competitor_name)
      if (!company) return null
      const sourceItem: ParsedRssItem = {
        title: event.title,
        description: event.summary || '',
        link: event.url,
        source: event.source,
        sourceUrl: null,
        publishedAt: event.published_at,
      }
      const ai = await assessWithAI(company, sourceItem)
      if (!ai) return null
      aiEnriched += 1
      const heuristic: HeuristicAssessment = {
        relevanceScore: event.relevance_score,
        relevanceReason: event.relevance_reason,
        importance: event.importance,
        isUpcoming: event.is_upcoming,
        signalType: event.signal_type,
        eventDate: event.event_date,
        tags: event.tags,
        summary: event.summary,
      }
      return mergeAssessment(company, sourceItem, heuristic, ai)
    })

    const replacements = new Map<string, CompetitorEventRecord>()
    aiResults.forEach((record) => {
      if (!record) return
      replacements.set(record.external_id, record)
    })

    filtered = filtered.map((event) => replacements.get(event.external_id) ?? event)
  }

  filtered.sort((a, b) => {
    const scoreDiff = b.relevance_score - a.relevance_score
    if (scoreDiff !== 0) return scoreDiff
    const dateA = a.published_at ? new Date(a.published_at).getTime() : 0
    const dateB = b.published_at ? new Date(b.published_at).getTime() : 0
    return dateB - dateA
  })

  const events = filtered.slice(0, globalLimit)

  return {
    events,
    stats: {
      companies: companies.length,
      fetchedItems,
      filteredItems: events.length,
      aiEnriched,
    },
  }
}
