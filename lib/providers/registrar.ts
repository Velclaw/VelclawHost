export type RegistrarName = 'vercel' | 'resellerclub' | 'none';

export interface DomainAvailability {
  domain: string;
  available: boolean;
  purchasePrice?: number | null;
  renewalPrice?: number | null;
  transferPrice?: number | null;
  currency?: string;
}

export interface DomainTransferStatus {
  domain: string;
  status: string;
  orderId?: string | null;
  message?: string | null;
  raw?: unknown;
}

export interface TransferInRequest {
  domain: string;
  authCode: string;
  years?: number;
  autoRenew?: boolean;
  expectedPrice?: number;
  contactInformation?: Record<string, unknown>;
}

export interface RegistrarProvider {
  readonly name: RegistrarName;
  /** Retrieves the provider's current registration availability and pricing. */
  getAvailability(domain: string): Promise<DomainAvailability>;
  /** Retrieves the sensitive authorization code used to transfer a domain out. */
  getAuthCode(domain: string): Promise<{ domain: string; authCode: string }>;
  /** Submits an inbound transfer; the returned status does not imply completion. */
  transferIn(request: TransferInRequest): Promise<DomainTransferStatus>;
  /** Retrieves the provider's latest transfer status for a domain. */
  getTransferStatus(domain: string): Promise<DomainTransferStatus>;
  /** Replaces the domain's registrar-managed nameservers. */
  updateNameservers(domain: string, nameservers: string[]): Promise<unknown>;
}

export class RegistrarProviderError extends Error {
  /** Creates a provider failure with an HTTP status and machine-readable API code. */
  constructor(
    message: string,
    readonly status = 502,
    readonly code = 'REGISTRAR_PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'RegistrarProviderError';
  }
}
