import { redirect } from "next/navigation";

/**
 * Root page — redirect semua pengunjung ke halaman login.
 * Middleware akan menangani redirect ke halaman yang sesuai
 * jika pengguna sudah memiliki sesi aktif.
 */
export default function RootPage() {
  redirect("/login");
}
