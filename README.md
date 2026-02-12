# CSUB Sales Intelligence Platform

Dashboard for tracking subsea contract awards, FEED studies, and market intelligence.

Built by [Workflows AS](https://workflows.no) for CSUB AS.

## Tech Stack
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **AI:** Claude API (news parsing, relevance scoring)
- **Hosting:** Vercel

## Getting Started

1. Clone the repo
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in Supabase credentials
4. `npm run dev`

## Database
Schema is in `supabase/migrations/001_initial_schema.sql`
