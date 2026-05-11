"use client";

/**
 * LoadingOverlay — full-screen overlay dengan spinner dan pesan.
 * Dipakai untuk proses yang membutuhkan waktu seperti logout, redirect, dll.
 *
 * @param {{ message?: string, subMessage?: string }} props
 */
export default function LoadingOverlay({ message = "Memproses...", subMessage = "" }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5">
        {/* Spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
          <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>

        {/* Text */}
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">{message}</p>
          {subMessage && (
            <p className="text-sm text-gray-500 mt-1">{subMessage}</p>
          )}
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
