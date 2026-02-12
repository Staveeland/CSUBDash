# Vercel Environment Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `AUTH_USERNAME` | `workflows` |
| `AUTH_PASSWORD` | `Workflows2025#` |
| `IMPORT_WORKER_SECRET` | (random long secret) |
| `APP_BASE_URL` | `https://<your-vercel-domain>` |

> `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` should already be set.
> `APP_BASE_URL` is used by the Supabase Edge Function `process-import-job` to call `/api/import/process`.
