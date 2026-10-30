import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import DashboardClient from "../dashboard-client";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <DashboardClient />;
}
