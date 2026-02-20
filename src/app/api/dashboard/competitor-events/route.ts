import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'

interface CompetitorEventRow {
  id: string
  competitor_name: string
  title: string
  summary: string | null
  url: string
  source: string
  published_at: string | null
  event_date: string | null
  signal_type: string
  relevance_score: number | null
  relevance_reason: string | null
  ai_summary: string | null
  importance: string
  is_upcoming: boolean
  scraped_at: string | null
}

const MAX_ITEM_AGE_DAYS = 90
const MAX_ITEMS = 120
const MIN_RELEVANCE_SCORE = 0.45

function isRecent(dateValue: string | null): boolean {
  if (!dateValue) return false
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return false
  return Date.now() - parsed.getTime() <= MAX_ITEM_AGE_DAYS * 24 * 60 * 60 * 1000
}

function isFutureDate(dateValue: string | null): boolean {
  if (!dateValue) return false
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() >= Date.now()
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function getImportanceRank(value: string): number {
  if (value === 'high') return 3
  if (value === 'medium') return 2
  if (value === 'low') return 1
  return 0
}

export async function GET() {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const result = await supabase
      .from('competitor_events')
      .select(`
        id,
        competitor_name,
        title,
        summary,
        url,
        source,
        published_at,
        event_date,
        signal_type,
        relevance_score,
        relevance_reason,
        ai_summary,
        importance,
        is_upcoming,
        scraped_at
      `)
      .order('published_at', { ascending: false })
      .limit(300)

    if (result.error) {
      if (/competitor_events/i.test(result.error.message) && /does not exist|relation/i.test(result.error.message)) {
        return NextResponse.json({ events: [], warning: 'competitor_events table not available yet' })
      }
      throw result.error
    }

    const rows = (result.data || []) as CompetitorEventRow[]

    const lastScrapedAt = rows.reduce<string | null>((latest, row) => {
      const rowTs = toTimestamp(row.scraped_at)
      const latestTs = toTimestamp(latest)
      return rowTs > latestTs ? row.scraped_at : latest
    }, null)

    const events = rows
      .filter((row) => row.is_upcoming || isFutureDate(row.event_date) || isRecent(row.published_at))
      .filter((row) => {
        if (row.is_upcoming || isFutureDate(row.event_date)) return true
        const score = typeof row.relevance_score === 'number' ? row.relevance_score : 0
        return score >= MIN_RELEVANCE_SCORE
      })
      .sort((a, b) => {
        const upcomingA = Number(a.is_upcoming || isFutureDate(a.event_date))
        const upcomingB = Number(b.is_upcoming || isFutureDate(b.event_date))
        if (upcomingA !== upcomingB) return upcomingB - upcomingA

        const importanceA = getImportanceRank(a.importance)
        const importanceB = getImportanceRank(b.importance)
        if (importanceA !== importanceB) return importanceB - importanceA

        const scoreA = typeof a.relevance_score === 'number' ? a.relevance_score : 0
        const scoreB = typeof b.relevance_score === 'number' ? b.relevance_score : 0
        if (scoreA !== scoreB) return scoreB - scoreA

        const publishedA = a.published_at ? new Date(a.published_at).getTime() : 0
        const publishedB = b.published_at ? new Date(b.published_at).getTime() : 0
        return publishedB - publishedA
      })
      .slice(0, MAX_ITEMS)

    return NextResponse.json({
      events,
      meta: {
        age_days: MAX_ITEM_AGE_DAYS,
        min_relevance_score: MIN_RELEVANCE_SCORE,
        count: events.length,
        source_rows: rows.length,
        last_scraped_at: lastScrapedAt,
      },
    })
  } catch (error) {
    console.error('Competitor events API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch competitor events' },
      { status: 500 }
    )
  }
}
