# CSUB Sales Intelligence Platform

Dashboard for tracking subsea contract awards, FEED studies, and market intelligence.

Built by [Workflows AS](https://workflows.no) for CSUB AS.

## Tech Stack
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **AI:** Claude API (news parsing, relevance scoring)
- **Hosting:** Vercel
- **Auth:** Supabase Auth + Microsoft 365 (Azure OAuth)

## ⚠️ DESIGN RULES
- The dashboard design is in `public/dashboard.html` — this is the ONLY approved design
- `src/components/Dashboard.tsx` is the React version of that design
- **NEVER** create new dashboard layouts or replace the existing design
- All improvements must work WITHIN the existing design, not replace it
- When refactoring: preserve all CSS classes, layout structure, and visual appearance exactly

## ⚠️ DESIGN RULES
- The dashboard design is in `public/dashboard.html` — this is the ONLY approved design
- `src/components/Dashboard.tsx` is the React version of that design
- **NEVER** create new dashboard layouts or replace the existing design
- All improvements must work WITHIN the existing design, not replace it
- When refactoring: preserve all CSS classes, layout structure, and visual appearance exactly

## Getting Started

1. Clone the repo
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in Supabase credentials
4. `npm run dev`

## Database
Schema is in `supabase/migrations/001_initial_schema.sql`

## Authentication
- Login is handled via Microsoft 365 OAuth.
- Only users with these email domains are allowed:
  - `@csub.com`
  - `@workflows.no`
