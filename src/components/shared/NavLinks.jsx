"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * NavLinks — navigasi yang dipakai bersama semua role staf.
 *
 * - Desktop (>= sm): daftar link horizontal di tengah header.
 * - Mobile (< sm): tombol hamburger yang membuka dropdown panel.
 *
 * Komponen ini sengaja dipisah dari Navbar (Server Component) karena butuh
 * state interaktif (toggle menu) dan usePathname() untuk highlight aktif.
 *
 * Props:
 * - links: Array<{ href: string, label: string }>
 */
export default function NavLinks({ links = [] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Tutup menu otomatis saat route berubah (tap link / back/forward).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (links.length === 0) return null;

  const isActive = (href) =>
    pathname === href || pathname.startsWith(href + "/");

  const linkClass = (href) =>
    [
      "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive(href)
        ? "bg-gray-100 text-gray-900"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
    ].join(" ");

  return (
    <>
      {/* ── Desktop: navigasi horizontal ── */}
      <nav className="hidden sm:flex items-center gap-1" aria-label="Navigasi utama">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass(link.href)}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* ── Mobile: tombol hamburger ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
      >
        {open ? (
          // Ikon X
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Ikon hamburger
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* ── Mobile: dropdown panel ── */}
      {open && (
        <div
          id="mobile-nav-menu"
          className="sm:hidden absolute left-0 right-0 top-full border-b border-gray-200 bg-white shadow-lg"
        >
          <nav className="mx-auto max-w-7xl px-4 py-2" aria-label="Navigasi mobile">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
