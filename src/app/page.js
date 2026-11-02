import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDefaultRedirect } from "@/lib/auth";

/**
 * Root page — redirect berdasarkan status sesi:
 * - Sudah login → halaman sesuai role
 * - Belum login → halaman login
 */
export default async function RootPage() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(getDefaultRedirect(session.user.role));
  }

  // Belum login → arahkan ke halaman login
  redirect("/login");
}
