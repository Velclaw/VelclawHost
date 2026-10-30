import { signIn } from "../../auth";

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const blocked = params.error === "AccessDenied";
  return (
    <main className="grid min-h-screen place-items-center bg-[#030304] px-5 py-12 text-zinc-100">
      <section className="w-full max-w-md border border-white/10 bg-[#09090b] p-7 shadow-2xl sm:p-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">VelClawHost Auth</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Đăng nhập</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">Đăng nhập an toàn để truy cập VelClawHost Dashboard.</p>
        </div>
        {blocked && <p role="alert" className="mb-5 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Tài khoản này chưa được cấp quyền truy cập VelClawHost.</p>}
        <div className="grid gap-3">
          <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
            <button className="w-full border border-white/15 bg-white py-3 text-sm font-semibold text-black transition hover:bg-zinc-200" type="submit">Tiếp tục với GitHub</button>
          </form>
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
            <button className="w-full border border-white/15 bg-transparent py-3 text-sm font-semibold text-white transition hover:bg-white/5" type="submit">Tiếp tục với Google</button>
          </form>
        </div>
        <p className="mt-7 border-t border-white/10 pt-5 text-xs leading-5 text-zinc-500">Chỉ email được chủ hệ thống cho phép mới có thể đăng nhập. Phiên đăng nhập tự hết hạn sau 8 giờ.</p>
      </section>
    </main>
  );
}
