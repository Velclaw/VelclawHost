import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma';
import { escapeHtml, getAuthBaseUrl } from '../../../../src/lib/email';
import { consumeAuthRateLimit } from '../../../../src/lib/rate-limit';

function redirectToStatus(status: 'success' | 'invalid' | 'rate-limited') {
  return NextResponse.redirect(new URL(`/?verified=${status}`, getAuthBaseUrl()), 303);
}

// Email security scanners often prefetch GET links. Only display a confirmation
// form on GET; consume the single-use token after the user submits the form.
export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const raw = requestUrl.searchParams.get('token') ?? '';
    const email = (requestUrl.searchParams.get('email') ?? '').trim().toLowerCase();

    if (!raw || !email) return redirectToStatus('invalid');

    const token = createHash('sha256').update(raw).digest('hex');
    const record = await prisma.verificationToken.findFirst({
      where: { identifier: email, token, expires: { gt: new Date() } },
      select: { identifier: true },
    });

    if (!record) return redirectToStatus('invalid');

    const html = `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xác minh email VelClawHost</title></head>
<body style="margin:0;background:#000;color:#f5f5f5;font-family:Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px">
<main style="max-width:420px;width:100%;border:1px solid #262626;border-radius:16px;background:#0a0a0a;padding:28px;box-sizing:border-box">
<p style="color:#a3a3a3;font-size:12px;letter-spacing:3px;text-transform:uppercase">VelClawHost</p>
<h1 style="font-size:22px">Xác minh địa chỉ email</h1>
<p style="color:#a3a3a3;line-height:1.6">Nhấn nút bên dưới để xác minh email và kích hoạt tài khoản VelClawHost.</p>
<form method="post" action="/api/auth/verify-email">
<input type="hidden" name="token" value="${escapeHtml(raw)}">
<input type="hidden" name="email" value="${escapeHtml(email)}">
<button type="submit" style="width:100%;padding:14px;border:0;border-radius:10px;background:#fff;color:#000;font-weight:700">Xác minh email</button>
</form>
</main></body></html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return redirectToStatus('invalid');
  }
}

export async function POST(request: Request) {
  try {
    if (!(await consumeAuthRateLimit(request, 'verify-email', 10, 15 * 60 * 1000))) {
      return NextResponse.redirect(new URL('/?verified=rate-limited', getAuthBaseUrl()), 303);
    }

    const form = await request.formData();
    const raw = String(form.get('token') ?? '');
    const email = String(form.get('email') ?? '').trim().toLowerCase();

    if (!raw || !email) return redirectToStatus('invalid');

    const token = createHash('sha256').update(raw).digest('hex');
    const now = new Date();

    const verified = await prisma.$transaction(async (tx) => {
      const result = await tx.verificationToken.deleteMany({
        where: { identifier: email, token, expires: { gt: now } },
      });

      if (result.count !== 1) return false;

      await tx.user.update({
        where: { email },
        data: { emailVerified: now },
      });
      return true;
    });

    return redirectToStatus(verified ? 'success' : 'invalid');
  } catch {
    return redirectToStatus('invalid');
  }
}
