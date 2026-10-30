import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { AuthScreen } from "../../src/components/auth/AuthScreen";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return <AuthScreen />;
}
