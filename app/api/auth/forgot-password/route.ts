import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma';
import { getAuthBaseUrl, sendAuthEmail } from '../../../../src/lib/email';
import { consumeAuthRateLimit } from '../../../../src/lib/rate-limit';

export async function POST(request: Request) {
  try {
    if (!(await consumeAuthRateLimit(request, 'forgot-password', 5, 15 * 60 * 1000))) {
      return NextResponse.json(
        { ok: false, error: 'Quá nhiều yêu cầu. Thử lại sau.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: true });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.passwordHash && user.emailVerified) {
      const raw = randomBytes(32).toString('hex');
      const token = createHash('sha256').update(raw).digest('hex');

      await prisma.verificationToken.deleteMany({ where: { identifier: `reset:${email}` } });
      await prisma.verificationToken.create({
        data: {
          identifier: `reset:${email}`,
          token,
          expires: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      const resetUrl = getAuthBaseUrl();
      resetUrl.pathname = '/';
      resetUrl.search = '';
      resetUrl.searchParams.set('mode', 'updatePassword');
      resetUrl.searchParams.set('token', raw);

      await sendAuthEmail(email, 'Đặt lại mật khẩu VelClawHost', resetUrl.toString());
    }

    // Always return the same response to avoid disclosing whether an account exists.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể gửi email đặt lại mật khẩu.' }, { status: 500 });
  }
}
