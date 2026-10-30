import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";

/**
 * Navbar — top navigation bar yang konsisten di semua halaman.
 *
 * - Desktop (>= sm): navigasi horizontal di tengah header + tombol Keluar di kanan.
 * - Mobile (< sm): tombol hamburger yang membuka dropdown (lihat NavLinks),
 *   tombol Keluar ada di dalam dropdown — tidak ada di header.
 *
 * Props:
 * - userName: string — nama user yang sedang login
 * - role: "CASHIER" | "WAREHOUSE" | "OWNER"
 * - links: Array<{ href, label }> — navigasi antar halaman dalam role
 */
export default function Navbar({ userName, role, links = [] }) {
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
    // sticky + z-40 agar header (dan dropdown mobile yang absolute top-full)
    // tetap terlihat saat scroll, dan berada di atas konten halaman.
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: app name + role badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-base font-bold text-gray-900 whitespace-nowrap">
            POS System
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${roleColor}`}
          >
            {roleLabel}
          </span>
        </div>

        {/* Center: navigation (desktop horizontal + mobile hamburger+logout dropdown) */}
        <NavLinks links={links} userName={userName} />

        {/* Right: user name + logout — hanya tampil di desktop */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          <span className="text-sm text-gray-500 max-w-[12rem] truncate">
            {userName}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
