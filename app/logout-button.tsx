"use client";

import { logout } from "./actions/auth";

export default function LogoutButton() {
  return (
    <form action={logout} className="fixed right-4 top-4 z-[100]">
      <button type="submit" className="border border-white/20 bg-black/90 px-3 py-2 text-xs font-medium text-zinc-200 shadow-lg hover:bg-zinc-800">
        Đăng xuất
      </button>
    </form>
  );
}
