"use client";

import dynamic from "next/dynamic";
import LogoutButton from "./logout-button";

const Dashboard = dynamic(() => import("../src/App"), {
  ssr: false,
  loading: () => (
    <main className="grid min-h-screen place-items-center bg-[#030304] px-6 text-center text-sm text-zinc-400">
      <div><div className="mb-3 text-base font-semibold text-zinc-100">VelClawHost</div><p>Đang khởi tạo VelClawHost Dashboard…</p></div>
    </main>
  ),
});

export default function DashboardClient() {
  return <><LogoutButton /><Dashboard /></>;
}
