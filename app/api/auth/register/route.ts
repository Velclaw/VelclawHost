import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma';
import { hashPassword } from '../../../../src/lib/password';
import { getAuthBaseUrl, sendAuthEmail } from '../../../../src/lib/email';
import { consumeAuthRateLimit } from '../../../../src/lib/rate-limit';

export async function POST(request: Request) {
  try {
    if (!(await consumeAuthRateLimit(request, 'register', 5, 15 * 60 * 1000))) {
      return NextResponse.json({ error: 'Quá nhiều yêu cầu. Thử lại sau.' }, { status: 429, headers: { 'Retry-After': '900' } });
    }

    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.fullName ?? '').trim();

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không hợp lệ.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    // Do not reveal whether an address already has an account. An unverified
    // credentials account may request a fresh verification link without changing
    // its existing password.
    if (existing?.emailVerified || (existing && !existing.passwordHash)) {
      return NextResponse.json({ ok: true });
    }

    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          name: name.slice(0, 100),
          passwordHash: await hashPassword(password),
        },
      });
    }

    const raw = randomBytes(32).toString('hex');
    const token = createHash('sha256').update(raw).digest('hex');
    await prisma.verificationToken.deleteMany({
      where: { identifier: email, expires: { lte: new Date() } },
    });
    await prisma.verificationToken.create({
      data: { identifier: email, token, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const verificationUrl = getAuthBaseUrl();
    verificationUrl.pathname = '/api/auth/verify-email';
    verificationUrl.search = '';
    verificationUrl.searchParams.set('token', raw);
    verificationUrl.searchParams.set('email', email);

    await sendAuthEmail(email, 'Xác minh email Cloudxx', verificationUrl.toString());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể đăng ký hoặc gửi email xác minh. Kiểm tra cấu hình email.' }, { status: 500 });
  }
}
