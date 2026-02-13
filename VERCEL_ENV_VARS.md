# Vercel Environment Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `IMPORT_WORKER_SECRET` | (random long secret) |
| `APP_BASE_URL` | `https://<your-vercel-domain>` |

> `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` should already be set.
> `APP_BASE_URL` is used by the Supabase Edge Function `process-import-job` to call `/api/import/process`.

## Auth Setup (Microsoft 365 via Supabase)

1. In Supabase Dashboard → Authentication → Providers, enable `Azure`.
2. In Azure AD, create an app registration and configure redirect URL:
   - `https://<your-domain>/auth/callback`
3. In Supabase Azure provider config, set Azure client ID/secret/tenant.
4. Enforce access to CSUB/Workflows domains:
   - Allowed by app logic: `@csub.com`, `@workflows.no`
   - Users outside these domains are rejected after OAuth callback.
