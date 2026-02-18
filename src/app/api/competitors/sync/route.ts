import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { collectCompetitorEvents } from '@/lib/competitors/scraper'

interface SyncPayload {
  max_age_days?: number
  per_company_limit?: number
  global_limit?: number
  min_relevance_score?: number
  ai_item_limit?: number
  use_ai?: boolean
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function toScore(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(1, parsed))
}

function toBoolean(value: unknown, fallback: boolean | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return fallback
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function extractSecret(request: Request): string {
  const headerSecret =
    request.headers.get('x-competitor-sync-secret')
    || request.headers.get('x-import-secret')
    || ''

  if (headerSecret.trim()) return headerSecret.trim()

  const authorization = request.headers.get('authorization') || ''
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i)
  return bearerMatch?.[1]?.trim() || ''
}

function hasValidSyncSecret(request: Request): boolean {
  const expectedSecret =
    process.env.COMPETITOR_SYNC_SECRET
    || process.env.CRON_SECRET
    || process.env.IMPORT_WORKER_SECRET
    || ''

  if (!expectedSecret.trim()) return false
  const providedSecret = extractSecret(request)
  if (!providedSecret) return false
  return secureEquals(providedSecret, expectedSecret)
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

async function readPayload(request: Request): Promise<SyncPayload> {
  if (request.method !== 'POST') return {}
  const json = await request.json().catch(() => ({}))
  return (json && typeof json === 'object' ? json : {}) as SyncPayload
}

async function runSync(request: Request) {
  const authBySecret = hasValidSyncSecret(request)
  if (!authBySecret) {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
  }

  const payload = await readPayload(request)

  const maxAgeDays = toPositiveInt(payload.max_age_days, 45)
  const perCompanyLimit = toPositiveInt(payload.per_company_limit, 8)
  const globalLimit = toPositiveInt(payload.global_limit, 120)
  const aiItemLimit = toPositiveInt(payload.ai_item_limit, 24)
  const minRelevanceScore = toScore(payload.min_relevance_score, 0.52)
  const useAI = toBoolean(payload.use_ai, undefined)

  const scrapeResult = await collectCompetitorEvents({
    maxAgeDays,
    perCompanyLimit,
    globalLimit,
    minRelevanceScore,
    aiItemLimit,
    useAI,
  })

  const admin = createAdminClient()
  let upsertedRows = 0

  for (const batch of chunk(scrapeResult.events, 100)) {
    if (batch.length === 0) continue
    const upsert = await admin
      .from('competitor_events')
      .upsert(batch, { onConflict: 'external_id' })
      .select('id')

    if (upsert.error) {
      throw upsert.error
    }
    upsertedRows += upsert.data?.length ?? 0
  }

  const pruneBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
  const prune = await admin
    .from('competitor_events')
    .delete()
    .lt('published_at', pruneBefore)
    .eq('is_upcoming', false)

  if (prune.error) {
    console.warn('Could not prune old competitor_events rows:', prune.error.message)
  }

  return NextResponse.json({
    ok: true,
    auth_mode: authBySecret ? 'secret' : 'session',
    settings: {
      max_age_days: maxAgeDays,
      per_company_limit: perCompanyLimit,
      global_limit: globalLimit,
      min_relevance_score: minRelevanceScore,
      ai_item_limit: aiItemLimit,
      use_ai: typeof useAI === 'boolean' ? useAI : Boolean(process.env.OPENAI_API_KEY),
    },
    stats: {
      ...scrapeResult.stats,
      upserted_rows: upsertedRows,
    },
  })
}

export async function GET(request: Request) {
  try {
    return await runSync(request)
  } catch (error) {
    console.error('Competitor sync (GET) failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Competitor sync failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    return await runSync(request)
  } catch (error) {
    console.error('Competitor sync (POST) failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Competitor sync failed' },
      { status: 500 }
    )
  }
}
