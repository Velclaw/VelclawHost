import {
  DomainAvailability,
  DomainTransferStatus,
  RegistrarProvider,
  RegistrarProviderError,
  TransferInRequest,
} from './registrar';

const DEFAULT_BASE_URL = 'https://api.vercel.com';

function requireToken() {
  const token = process.env.VERCEL_REGISTRAR_TOKEN?.trim();
  if (!token) {
    throw new RegistrarProviderError(
      'Vercel registrar is not configured. Set VERCEL_REGISTRAR_TOKEN on the server.',
      503,
      'REGISTRAR_NOT_CONFIGURED',
    );
  }
  return token;
}

function baseUrl() {
  return (process.env.VERCEL_REGISTRAR_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function teamQuery() {
  const teamId = process.env.VERCEL_REGISTRAR_TEAM_ID?.trim();
  return teamId ? '?teamId=' + encodeURIComponent(teamId) : '';
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(baseUrl() + path + (path.includes('?') ? '&' : teamQuery() ? teamQuery() : ''), {
    ...init,
    headers: {
      Authorization: 'Bearer ' + requireToken(),
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }

  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || 'Vercel registrar request failed.';
    throw new RegistrarProviderError(message, response.status, payload?.code || 'VERCEL_REGISTRAR_ERROR');
  }
  return payload;
}

function normalizeDomain(domain: string) {
  const value = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(value)) {
    throw new RegistrarProviderError('Invalid domain name.', 400, 'INVALID_DOMAIN');
  }
  return value;
}

export class VercelRegistrarProvider implements RegistrarProvider {
  readonly name = 'vercel' as const;

  async getAvailability(domain: string): Promise<DomainAvailability> {
    const value = normalizeDomain(domain);
    const payload = await request('/v1/registrar/domains/' + encodeURIComponent(value) + '/price');
    const purchasePrice = payload?.purchasePrice ?? null;
    return {
      domain: value,
      available: purchasePrice !== null,
      purchasePrice,
      renewalPrice: payload?.renewalPrice ?? null,
      transferPrice: payload?.transferPrice ?? null,
      currency: payload?.currency ?? 'USD',
    };
  }

  async getAuthCode(domain: string) {
    const value = normalizeDomain(domain);
    const payload = await request('/v1/registrar/domains/' + encodeURIComponent(value) + '/auth-code');
    const authCode = payload?.authCode ?? payload?.auth_code ?? payload?.code;
    if (!authCode || typeof authCode !== 'string') {
      throw new RegistrarProviderError('Registrar did not return an authorization code.', 502, 'AUTH_CODE_MISSING');
    }
    return { domain: value, authCode };
  }

  async transferIn(input: TransferInRequest): Promise<DomainTransferStatus> {
    const value = normalizeDomain(input.domain);
    const payload = await request('/v1/registrar/domains/' + encodeURIComponent(value) + '/transfer', {
      method: 'POST',
      body: JSON.stringify({
        authCode: input.authCode,
        years: input.years ?? 1,
        autoRenew: input.autoRenew ?? true,
        ...(input.expectedPrice !== undefined ? { expectedPrice: input.expectedPrice } : {}),
        ...(input.contactInformation ? { contactInformation: input.contactInformation } : {}),
      }),
    });
    return {
      domain: value,
      status: String(payload?.status ?? payload?.state ?? 'pending'),
      orderId: payload?.orderId ?? null,
      message: payload?.message ?? null,
      raw: payload,
    };
  }

  async getTransferStatus(domain: string): Promise<DomainTransferStatus> {
    const value = normalizeDomain(domain);
    const payload = await request('/v1/registrar/domains/' + encodeURIComponent(value) + '/transfer');
    return {
      domain: value,
      status: String(payload?.status ?? payload?.state ?? 'unknown'),
      orderId: payload?.orderId ?? null,
      message: payload?.message ?? null,
      raw: payload,
    };
  }

  async updateNameservers(domain: string, nameservers: string[]) {
    const value = normalizeDomain(domain);
    const normalized = nameservers.map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (normalized.length < 2) {
      throw new RegistrarProviderError('At least two nameservers are required.', 400, 'INVALID_NAMESERVERS');
    }
    return request('/v1/registrar/domains/' + encodeURIComponent(value) + '/nameservers', {
      method: 'PATCH',
      body: JSON.stringify({ nameservers: normalized }),
    });
  }
}
