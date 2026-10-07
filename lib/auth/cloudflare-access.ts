import { createHmac, createPublicKey, createVerify, timingSafeEqual } from "node:crypto";

export type VelclawRole = "owner" | "admin" | "member" | "viewer";

export type VelclawUser = {
  id: string;
  email: string;
  role: VelclawRole;
  provider: "cloudflare-access";
  lastSeenAt: string;
};

type AccessClaims = {
  sub?: string;
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  type?: string;
};

type SessionPayload = {
  v: 1;
  sid: string;
  uid: string;
  email: string;
  role: VelclawRole;
  iat: number;
  exp: number;
};

const ACCESS_AUD = process.env.CLOUDFLARE_ACCESS_AUD?.trim() || "";
const SESSION_SECRET = process.env.VELCLAWHOST_SESSION_SECRET?.trim() || "";
const SESSION_TTL_SECONDS = Math.max(900, Number(process.env.VELCLAWHOST_SESSION_TTL_SECONDS || 86400));
const keyCache = new Map<string, { expiresAt: number; keys: Array<{ kid: string; key: any }> }>();

function base64urlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function audMatches(aud: string | string[] | undefined) {
  if (!ACCESS_AUD || !aud) return false;
  return Array.isArray(aud) ? aud.includes(ACCESS_AUD) : aud === ACCESS_AUD;
}

async function loadSigningKey(issuer: string, kid: string) {
  const cached = keyCache.get(issuer);
  if (!cached || cached.expiresAt <= Date.now()) {
    const response = await fetch(issuer.replace(/\/$/, "") + "/cdn-cgi/access/certs", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Cloudflare Access signing-key endpoint returned HTTP " + response.status);
    const body = await response.json() as { keys?: Array<{ kid: string; kty: string; n: string; e: string; alg?: string }> };
    const keys = (body.keys || []).filter((key) => key.kty === "RSA" && key.n && key.e).map((key) => ({
      kid: key.kid,
      key: createPublicKey({ key: { kty: "RSA", n: key.n, e: key.e }, format: "jwk" }),
    }));
    if (!keys.length) throw new Error("Cloudflare Access returned no RSA signing keys.");
    keyCache.set(issuer, { expiresAt: Date.now() + 10 * 60 * 1000, keys });
    return keys.find((entry) => entry.kid === kid)?.key;
  }
  return cached.keys.find((entry) => entry.kid === kid)?.key;
}

async function verifyAccessJwt(token: string): Promise<AccessClaims> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Malformed Access JWT.");

  const header = base64urlJson<{ alg?: string; kid?: string }>(encodedHeader);
  const claims = base64urlJson<AccessClaims>(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Access JWT signing algorithm.");
  if (!claims.iss || !/^https:\/\/[^/]+\.cloudflareaccess\.com\/?$/i.test(claims.iss)) throw new Error("Invalid Access JWT issuer.");
  if (!audMatches(claims.aud)) throw new Error("Access JWT audience mismatch.");

  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) throw new Error("Access JWT expired.");
  if (claims.nbf && claims.nbf > now + 30) throw new Error("Access JWT is not active yet.");

  const key = await loadSigningKey(claims.iss, header.kid);
  if (!key) throw new Error("Unknown Cloudflare Access signing key.");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(encodedHeader + "." + encodedPayload);
  verifier.end();
  const valid = verifier.verify(key, Buffer.from(encodedSignature, "base64url"));
  if (!valid) throw new Error("Cloudflare Access JWT signature verification failed.");
  if (!claims.sub || !claims.email) throw new Error("Access JWT does not contain an identity.");

  return claims;
}

function signSession(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return body + "." + mac;
}

function verifySession(token: string): SessionPayload | null {
  if (!SESSION_SECRET) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", SESSION_SECRET).update(body).digest();
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.v !== 1 || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookie(header: string | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function setSessionCookie(res: { setHeader(name: string, value: string): void }, session: string, maxAge: number) {
  res.setHeader("Set-Cookie", "velclaw_session=" + session + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge);
}

export async function authenticateVelclawRequest(req: {
  header(name: string): string | undefined;
  headers: Record<string, unknown>;
}, res: { setHeader(name: string, value: string): void }): Promise<VelclawUser> {
  if (!ACCESS_AUD) throw new Error("CLOUDFLARE_ACCESS_AUD is not configured.");
  if (!SESSION_SECRET) throw new Error("VELCLAWHOST_SESSION_SECRET is not configured.");

  const accessToken = req.header("cf-access-jwt-assertion") || req.header("cf-access-token");
  if (!accessToken) throw new Error("Cloudflare Access authentication is required.");

  const claims = await verifyAccessJwt(accessToken);
  const role = resolveRole(String(claims.email).toLowerCase());
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sid: cryptoRandomId(),
    uid: String(claims.sub),
    email: String(claims.email).toLowerCase(),
    role,
    iat: now,
    exp: Math.min(Number(claims.exp), now + SESSION_TTL_SECONDS),
  };
  setSessionCookie(res, signSession(payload), payload.exp - now);

  return {
    id: payload.uid,
    email: payload.email,
    role: payload.role,
    provider: "cloudflare-access",
    lastSeenAt: new Date().toISOString(),
  };
}

function cryptoRandomId() {
  return createHmac("sha256", SESSION_SECRET).update(String(Date.now()) + ":" + Math.random()).digest("hex").slice(0, 32);
}

function resolveRole(email: string): VelclawRole {
  const owners = parseEmails(process.env.VELCLAWHOST_OWNER_EMAILS);
  const admins = parseEmails(process.env.VELCLAWHOST_ADMIN_EMAILS);
  const viewers = parseEmails(process.env.VELCLAWHOST_VIEWER_EMAILS);
  if (owners.has(email)) return "owner";
  if (admins.has(email)) return "admin";
  if (viewers.has(email)) return "viewer";
  return "member";
}

function parseEmails(value: string | undefined) {
  return new Set((value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export function roleAtLeast(role: VelclawRole, required: VelclawRole) {
  const rank: Record<VelclawRole, number> = { viewer: 10, member: 20, admin: 30, owner: 40 };
  return rank[role] >= rank[required];
}

export function clearVelclawSession(res: { setHeader(name: string, value: string): void }) {
  res.setHeader("Set-Cookie", "velclaw_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}
