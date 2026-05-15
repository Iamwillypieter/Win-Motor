import Link from "next/link";
import { headers } from "next/headers";
import LogoutButton from "./LogoutButton";

/**
 * Navbar — top navigation bar yang konsisten di semua halaman.
 *
 * Props:
 * - userName: string — nama user yang sedang login
 * - role: "CASHIER" | "WAREHOUSE" | "OWNER"
 * - links: Array<{ href, label }> — navigasi antar halaman dalam role
 */
export default async function Navbar({ userName, role, links = [] }) {
  // Ambil pathname dari headers untuk highlight link aktif
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || headersList.get("x-invoke-path") || "";

  const roleLabel = {
    CASHIER: "Kasir",
    WAREHOUSE: "Staf Gudang",
    OWNER: "Owner",
  }[role] ?? role;

  const roleColor = {
    CASHIER: "bg-blue-100 text-blue-700",
    WAREHOUSE: "bg-green-100 text-green-700",
    OWNER: "bg-purple-100 text-purple-700",
  }[role] ?? "bg-gray-100 text-gray-700";

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: app name + role badge */}
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">POS System</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor}`}>
            {roleLabel}
          </span>
        </div>

        {/* Center: navigation links */}
        {links.length > 0 && (
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right: user name + logout */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-sm text-gray-500">
            {userName}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
