export const VELCLAW_FIRST_PARTY_DOMAINS = {
  platform: 'velclaw.site',
  developer: 'velclaw.dev',
  application: 'velclaw.app',
} as const;

export const VELCLAW_FIRST_PARTY_TLDS = ['site', 'dev', 'app'] as const;

export function getFirstPartyRole(domain: string) {
  const value = domain.trim().toLowerCase().replace(/\.$/, '');
  for (const [role, apex] of Object.entries(VELCLAW_FIRST_PARTY_DOMAINS)) {
    if (value === apex || value.endsWith('.' + apex)) return role as keyof typeof VELCLAW_FIRST_PARTY_DOMAINS;
  }
  return null;
}

export function isSupportedDomain(domain: string) {
  const value = domain.trim().toLowerCase().replace(/\.$/, '');
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(value);
}
