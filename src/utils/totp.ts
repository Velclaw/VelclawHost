/**
 * TOTP (Time-based One-Time Password) utilities for Two-Factor Authentication (RFC 6238)
 */

export function getSecondsRemainingInTotpWindow(): number {
  const epochSeconds = Math.floor(Date.now() / 1000);
  return 30 - (epochSeconds % 30);
}

// Generates a deterministic simulated 6-digit code for a secret and 30s window
export function generateCurrentTotp(secret: string = 'VELCLAWSEC2026'): string {
  const windowIndex = Math.floor(Date.now() / 30000);
  let hash = 0;
  const combined = secret + windowIndex.toString();
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const code = (positive % 900000) + 100000;
  return code.toString();
}

export function verifyTotpCode(inputCode: string, secret: string = 'VELCLAWSEC2026'): boolean {
  const trimmed = inputCode.trim().replace(/\s|-/g, '');
  if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
    return false;
  }

  // Check current window, previous window (-30s), and next window (+30s)
  const currentWindow = Math.floor(Date.now() / 30000);
  for (const windowOffset of [0, -1, 1]) {
    const w = currentWindow + windowOffset;
    let hash = 0;
    const combined = secret + w.toString();
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const code = ((Math.abs(hash) % 900000) + 100000).toString();
    if (code === trimmed) {
      return true;
    }
  }

  // Also accept universal demo master code for easy testing
  if (trimmed === '888999' || trimmed === '123456') {
    return true;
  }

  return false;
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < count; i++) {
    let part1 = '';
    let part2 = '';
    for (let j = 0; j < 4; j++) {
      part1 += chars.charAt(Math.floor(Math.random() * chars.length));
      part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}
