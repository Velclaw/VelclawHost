import { DomainAvailability, DomainTransferStatus, RegistrarProvider, RegistrarProviderError, TransferInRequest } from './registrar';

type JsonValue = Record<string, any> | string | number | boolean | null;

export class ResellerClubRegistrarProvider implements RegistrarProvider {
  readonly name = 'resellerclub' as const;

  private readonly baseUrl =
    (process.env.RESELLERCLUB_TEST_MODE ?? 'true').toLowerCase() === 'true'
      ? (process.env.RESELLERCLUB_TEST_API_BASE_URL || 'https://test.httpapi.com/api')
      : (process.env.RESELLERCLUB_API_BASE_URL || 'https://httpapi.com/api');

  private readonly resellerId = process.env.RESELLERCLUB_USER_ID || '';
  private readonly apiKey = process.env.RESELLERCLUB_API_KEY || '';

  /** @throws {RegistrarProviderError} If either ResellerClub credential is missing. */
  private requireCredentials() {
    if (!this.resellerId || !this.apiKey) {
      throw new RegistrarProviderError(
        'ResellerClub is not configured. Set RESELLERCLUB_USER_ID and RESELLERCLUB_API_KEY on the server.',
        503,
        'RESELLERCLUB_NOT_CONFIGURED',
      );
    }
  }

  /**
   * Sends an authenticated ResellerClub request and parses JSON or legacy text responses.
   * Provider HTTP failures and error payloads are exposed as `RegistrarProviderError`s.
   */
  private async request(
    path: string,
    method: 'GET' | 'POST',
    params: Record<string, string | number | boolean | string[] | undefined> = {},
  ): Promise<JsonValue> {
    this.requireCredentials();

    const body = new URLSearchParams();
    body.set('auth-userid', this.resellerId);
    body.set('api-key', this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) body.append(key, item);
      } else {
        body.set(key, String(value));
      }
    }

    const url = `${this.baseUrl.replace(/\\/$/, '')}/${path.replace(/^\\//, '')}.json`;
    const response = await fetch(method === 'GET' ? `${url}?${body.toString()}` : url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(method === 'POST' ? { body } : {}),
    });

    const text = await response.text();
    let data: JsonValue = text;
    try {
      data = JSON.parse(text) as JsonValue;
    } catch {
      // Some legacy endpoints return plain text.
    }

    if (!response.ok) {
      throw new RegistrarProviderError(
        `ResellerClub API request failed (${response.status}).`,
        502,
        'RESELLERCLUB_API_ERROR',
      );
    }

    if (typeof data === 'object' && data !== null && !Array.isArray(data) && 'status' in data) {
      const status = String(data.status).toLowerCase();
      if (status === 'error') {
        throw new RegistrarProviderError(
          String(data.message || data.description || 'ResellerClub rejected the request.'),
          502,
          'RESELLERCLUB_REQUEST_REJECTED',
        );
      }
    }

    return data;
  }

  /** Splits at the final dot and queries the resulting name/TLD pair, treating unknown responses as unavailable. */
  async getAvailability(domain: string): Promise<DomainAvailability> {
    const normalized = domain.trim().toLowerCase();
    const dot = normalized.lastIndexOf('.');
    if (dot <= 0 || dot === normalized.length - 1) {
      throw new RegistrarProviderError('Invalid domain name.', 400, 'INVALID_DOMAIN');
    }

    const sld = normalized.slice(0, dot);
    const tld = normalized.slice(dot + 1);
    const data = await this.request('domains/available', 'GET', {
      'domain-name': sld,
      tlds: tld,
      'suggest-alternative': false,
    });

    const entry =
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? (data as Record<string, any>)[normalized]
        : undefined;

    const available = Boolean(
      entry === true ||
        (entry && String(entry.status || '').toLowerCase() === 'available'),
    );

    const price = entry?.price;
    const numericPrice = price === undefined || price === null ? null : Number(price);

    return {
      domain: normalized,
      available,
      purchasePrice: Number.isFinite(numericPrice) ? numericPrice : null,
      currency: process.env.RESELLERCLUB_CURRENCY || 'USD',
    };
  }

  /** Retrieves the transfer authorization secret for the domain's ResellerClub order. */
  async getAuthCode(domain: string): Promise<{ domain: string; authCode: string }> {
    const orderId = await this.getOrderId(domain);
    const data = await this.request('domains/details', 'GET', {
      'order-id': orderId,
      options: 'OrderDetails',
    });
    const authCode =
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? String((data as Record<string, any>).domsecret || '')
        : '';

    if (!authCode) {
      throw new RegistrarProviderError(
        `No transfer authorization code was returned for ${domain}.`,
        502,
        'RESELLERCLUB_AUTH_CODE_UNAVAILABLE',
      );
    }

    return { domain, authCode };
  }

  /**
   * Submits an inbound transfer using the configured customer and contact IDs.
   * Privacy protection is always enabled, while automatic renewal defaults to enabled.
   */
  async transferIn(request: TransferInRequest): Promise<DomainTransferStatus> {
    const customerId = process.env.RESELLERCLUB_CUSTOMER_ID;
    const contactId = process.env.RESELLERCLUB_REG_CONTACT_ID;
    if (!customerId || !contactId) {
      throw new RegistrarProviderError(
        'ResellerClub transfer-in requires RESELLERCLUB_CUSTOMER_ID and RESELLERCLUB_REG_CONTACT_ID.',
        503,
        'RESELLERCLUB_TRANSFER_CONTACTS_NOT_CONFIGURED',
      );
    }

    const data = await this.request('domains/transfer', 'POST', {
      'domain-name': request.domain.trim().toLowerCase(),
      'auth-code': request.authCode,
      years: request.years || 1,
      'customer-id': customerId,
      'reg-contact-id': contactId,
      'admin-contact-id': process.env.RESELLERCLUB_ADMIN_CONTACT_ID || contactId,
      'tech-contact-id': process.env.RESELLERCLUB_TECH_CONTACT_ID || contactId,
      'billing-contact-id': process.env.RESELLERCLUB_BILLING_CONTACT_ID || contactId,
      'invoice-option': 'KeepInvoice',
      'protect-privacy': true,
      'auto-renew': request.autoRenew ?? true,
    });

    const result = (typeof data === 'object' && data !== null && !Array.isArray(data))
      ? (data as Record<string, any>)
      : {};

    return {
      domain: request.domain,
      status: String(result.status || result.actionstatus || 'submitted').toLowerCase(),
      orderId: result.orderid ? String(result.orderid) : null,
      message: result.message ? String(result.message) : null,
      raw: data,
    };
  }

  /** Retrieves the current action status for the domain's resolved order ID. */
  async getTransferStatus(domain: string): Promise<DomainTransferStatus> {
    const orderId = await this.getOrderId(domain);
    const data = await this.request('actions/status', 'GET', { 'order-id': orderId });
    const result = (typeof data === 'object' && data !== null && !Array.isArray(data))
      ? (data as Record<string, any>)
      : {};

    return {
      domain,
      status: String(result.status || result.actionstatus || result.currentstatus || 'unknown').toLowerCase(),
      orderId: String(orderId),
      message: result.message ? String(result.message) : null,
      raw: data,
    };
  }

  /**
   * Replaces the domain's nameservers through ResellerClub.
   * @throws {RegistrarProviderError} If fewer than two or more than thirteen are supplied.
   */
  async updateNameservers(domain: string, nameservers: string[]): Promise<unknown> {
    if (nameservers.length < 2 || nameservers.length > 13) {
      throw new RegistrarProviderError(
        'ResellerClub requires between 2 and 13 nameservers.',
        400,
        'INVALID_NAMESERVERS',
      );
    }

    const orderId = await this.getOrderId(domain);
    return this.request('domains/modify-ns', 'POST', {
      'order-id': orderId,
      ns: nameservers,
    });
  }

  /** Resolves the provider-specific order ID required by domain detail and action endpoints. */
  private async getOrderId(domain: string): Promise<string> {
    const data = await this.request('domains/orderid', 'GET', {
      'domain-name': domain.trim().toLowerCase(),
    });
    if (typeof data === 'string' || typeof data === 'number') return String(data);

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const value = (data as Record<string, any>).orderid || (data as Record<string, any>).orderId;
      if (value) return String(value);
    }

    throw new RegistrarProviderError(
      `ResellerClub did not return an order id for ${domain}.`,
      502,
      'RESELLERCLUB_ORDER_ID_UNAVAILABLE',
    );
  }
}
