"use server";
import { signOut } from "../../src/auth";
export async function logout() {
  await signOut({ redirectTo: "/login" });
}
