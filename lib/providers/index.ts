import { RegistrarProvider, RegistrarName } from './registrar';
import { ResellerClubRegistrarProvider } from './resellerclub-registrar';
import { VercelRegistrarProvider } from './vercel-registrar';

export function getRegistrarProvider(name = process.env.VELCLAWHOST_REGISTRAR || 'none'): RegistrarProvider {
  const normalized = name.trim().toLowerCase() as RegistrarName;

  if (normalized === 'resellerclub') return new ResellerClubRegistrarProvider();
  if (normalized === 'vercel') return new VercelRegistrarProvider();

  throw new Error('Unsupported registrar provider: ' + normalized);
}
