import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmailDomain } from '@/lib/auth/allowlist'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (!isAllowedEmailDomain(user.email)) {
    await supabase.auth.signOut()
    redirect('/auth/login?error=domain_not_allowed')
  }

  return <Dashboard userEmail={user.email ?? ''} />
}
