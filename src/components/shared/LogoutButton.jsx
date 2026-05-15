"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import LoadingOverlay from "./LoadingOverlay";

/**
 * LogoutButton — tombol keluar dengan loading overlay saat proses logout.
 */
export default function LogoutButton({ className = "" }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    // Langsung redirect ke /login tanpa menunggu server response
    // signOut tetap dipanggil di background untuk membersihkan sesi
    signOut({ callbackUrl: "/login", redirect: false });
    window.location.href = "/login";
  }

  return (
    <>
      {isLoggingOut && (
        <LoadingOverlay
          message="Keluar dari sistem..."
          subMessage="Sesi Anda sedang dihapus"
        />
      )}
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className={`rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isLoggingOut ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Keluar...
          </span>
        ) : (
          "Keluar"
        )}
      </button>
    </>
  );
}
