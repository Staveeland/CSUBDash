import 'server-only'
import { createClient } from '@supabase/supabase-js'

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

export function createAdminClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
