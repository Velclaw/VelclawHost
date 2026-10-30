import { redirect } from "next/navigation";
import { auth } from "../auth";
import DashboardClient from "./dashboard-client";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <DashboardClient />;
}
