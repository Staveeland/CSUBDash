export type AgentRole = 'user' | 'assistant'

export interface AgentMessage {
  role: AgentRole
  content: string
}

export interface AgentPlan {
  intent: 'question' | 'report'
  reportScope: 'project_period' | 'annual_all' | 'custom' | 'none'
  language: 'no' | 'en'
  projectKeywords: string[]
  countries: string[]
  operators: string[]
  fromYear: number | null
  toYear: number | null
  includeHistorical: boolean
  includeFuture: boolean
  includeTables: string[]
  focusPoints: string[]
}

export interface AgentResponsePayload {
  answer: string
  report: AgentReportResult | null
  followUps: string[]
  plan: AgentPlan
  dataCoverage: {
    fromYear: number | null
    toYear: number | null
    counts: Record<string, number>
    warnings: string[]
  }
}

export interface AgentReportResult {
  id: string | null
  title: string
  fileName: string
  storagePath: string
  downloadUrl: string
  createdAt: string
}
