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
  getAvailability(domain: string): Promise<DomainAvailability>;
  getAuthCode(domain: string): Promise<{ domain: string; authCode: string }>;
  transferIn(request: TransferInRequest): Promise<DomainTransferStatus>;
  getTransferStatus(domain: string): Promise<DomainTransferStatus>;
  updateNameservers(domain: string, nameservers: string[]): Promise<unknown>;
}

export class RegistrarProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = 'REGISTRAR_PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'RegistrarProviderError';
  }
}
