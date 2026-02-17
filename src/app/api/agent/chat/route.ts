import { NextRequest, NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { runSqlAgent } from '@/lib/ai-agent/sql-agent'
import type { AgentMessage } from '@/lib/ai-agent/types'

function normalizeMessages(input: unknown): AgentMessage[] {
  if (!Array.isArray(input)) return []

  return input
    .map((entry) => {
      const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      const role: AgentMessage['role'] = row.role === 'assistant' ? 'assistant' : 'user'
      const content = typeof row.content === 'string' ? row.content.trim() : ''
      return { role, content }
    })
    .filter((message) => message.content.length > 0)
    .slice(-20)
}

export async function POST(request: NextRequest) {
  const auth = await requireAllowedApiUser()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const messages = normalizeMessages((body as Record<string, unknown>)?.messages)

    if (!messages.length) {
      return NextResponse.json({ error: 'Missing messages[] payload' }, { status: 400 })
    }

    const payload = await runSqlAgent({
      messages,
      userId: auth.user.id,
      userEmail: auth.user.email ?? 'unknown@csub.com',
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Agent chat failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent chat failed' },
      { status: 500 }
    )
  }
}
