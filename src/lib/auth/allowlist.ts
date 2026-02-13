const ALLOWED_EMAIL_DOMAINS = new Set(['csub.com', 'workflows.no'])

export function isAllowedEmailDomain(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  const domain = normalized.split('@')[1]
  if (!domain) return false
  return ALLOWED_EMAIL_DOMAINS.has(domain)
}

export function getAllowedEmailDomains(): string[] {
  return Array.from(ALLOWED_EMAIL_DOMAINS)
}
