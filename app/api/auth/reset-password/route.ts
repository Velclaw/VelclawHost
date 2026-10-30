import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma';
import { hashPassword } from '../../../../src/lib/password';
import { consumeAuthRateLimit } from '../../../../src/lib/rate-limit';

export async function POST(request: Request) {
  try {
    if (!(await consumeAuthRateLimit(request, 'reset-password', 10, 15 * 60 * 1000))) {
      return NextResponse.json({ error: 'Quá nhiều yêu cầu. Thử lại sau.' }, { status: 429, headers: { 'Retry-After': '900' } });
    }

    const body = await request.json();
    const raw = String(body.token ?? '');
    const password = String(body.password ?? '');

    if (!raw || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }

    const token = createHash('sha256').update(raw).digest('hex');
    const now = new Date();

    const consumed = await prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findFirst({
        where: { identifier: { startsWith: 'reset:' }, token, expires: { gt: now } },
        select: { identifier: true },
      });

      if (!record) return false;

      const result = await tx.verificationToken.deleteMany({
        where: { identifier: record.identifier, token, expires: { gt: now } },
      });
      if (result.count !== 1) return false;

      // Revoke every outstanding reset link for this account after consuming one.
      await tx.verificationToken.deleteMany({
        where: { identifier: record.identifier },
      });

      const passwordHash = await hashPassword(password);

      await tx.user.update({
        where: { email: record.identifier.slice(6) },
        data: { passwordHash },
      });
      return true;
    });

    if (!consumed) {
      return NextResponse.json({ error: 'Liên kết đã hết hạn hoặc không hợp lệ.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể cập nhật mật khẩu.' }, { status: 400 });
  }
}
