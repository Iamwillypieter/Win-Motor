"use client";

import { useState } from "react";

const STATUS = {
  idle: null,
  loading: "loading",
  success: "success",
  error: "error",
};

/**
 * BackupPage — halaman owner untuk membuat dan mengunduh backup database manual.
 *
 * Cara kerja:
 *  - Klik tombol → panggil GET /api/cron/backup-db dengan header Authorization
 *  - Response adalah file JSON → otomatis trigger download di browser
 *  - Tampilkan statistik ringkasan dari field meta di response
 */
export default function BackupPage() {
  const [status, setStatus] = useState(STATUS.idle);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastBackup, setLastBackup] = useState(null); // { date, meta }

  const handleBackup = async () => {
    setStatus(STATUS.loading);
    setErrorMsg("");

    try {
      // Di development, CRON_SECRET tidak di-set sehingga endpoint tidak memerlukan auth.
      // Di production, NEXT_PUBLIC_CRON_SECRET harus diisi di env agar request bisa lewat.
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET ?? "";

      const headers = {};
      if (cronSecret) headers["Authorization"] = `Bearer ${cronSecret}`;

      const res = await fetch("/api/cron/backup-db", { headers });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          msg = body?.error?.message ?? msg;
        } catch {
          // ignore parse error
        }
        throw new Error(msg);
      }

      // Baca response sebagai blob untuk trigger download
      const blob = await res.blob();

      // Parse json dari blob untuk menampilkan ringkasan
      const text = await blob.text();
      let meta = null;
      try {
        const parsed = JSON.parse(text);
        meta = parsed?.meta ?? null;
      } catch {
        // tidak masalah jika parse gagal — file tetap didownload
      }

      // Trigger download di browser
      const dateLabel = new Date().toISOString().slice(0, 10);
      const filename = `backup-${dateLabel}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setLastBackup({ date: new Date(), meta });
      setStatus(STATUS.success);
    } catch (err) {
      setErrorMsg(err.message ?? "Terjadi kesalahan tidak diketahui");
      setStatus(STATUS.error);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup Database</h1>
        <p className="mt-1 text-sm text-gray-500">
          Unduh snapshot seluruh data transaksi, produk, dan pengguna dalam
          format JSON. Simpan file di tempat aman (Google Drive, USB, dsb.).
        </p>
      </div>

      {/* ── Info card ── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">📦 Isi backup meliputi:</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Semua pesanan (Orders)</li>
          <li>Semua invoice</li>
          <li>Semua produk (termasuk yang di-nonaktifkan)</li>
          <li>Data karyawan (tanpa password)</li>
          <li>Riwayat pergerakan stok</li>
        </ul>
      </div>

      {/* ── Tombol backup ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Backup Manual</p>
            <p className="text-xs text-gray-500 mt-0.5">
              File JSON akan langsung terunduh ke perangkat Anda
            </p>
          </div>
          <button
            onClick={handleBackup}
            disabled={status === STATUS.loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {status === STATUS.loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Memproses…
              </>
            ) : (
              <>⬇️ Unduh Backup Sekarang</>
            )}
          </button>
        </div>

        {/* Status feedback */}
        {status === STATUS.success && lastBackup && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p className="font-semibold">✅ Backup berhasil diunduh!</p>
            <p className="text-xs text-green-600 mt-1">
              {lastBackup.date.toLocaleString("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>
            {lastBackup.meta && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-green-700">
                <span>📋 {lastBackup.meta.collections.orders} pesanan</span>
                <span>🧾 {lastBackup.meta.collections.invoices} invoice</span>
                <span>📦 {lastBackup.meta.collections.products} produk</span>
                <span>👤 {lastBackup.meta.collections.users} pengguna</span>
                <span>
                  📊 {lastBackup.meta.collections.stockMovements} riwayat stok
                </span>
              </div>
            )}
          </div>
        )}

        {status === STATUS.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">❌ Backup gagal</p>
            <p className="text-xs text-red-600 mt-1">{errorMsg}</p>
            <p className="text-xs text-red-500 mt-1">
              Pastikan Anda sudah set <code className="bg-red-100 px-1 rounded">CRON_SECRET</code> di{" "}
              <code className="bg-red-100 px-1 rounded">.env.local</code> atau gunakan mode development.
            </p>
          </div>
        )}
      </div>

      {/* ── Panduan restore ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <p className="font-semibold text-gray-900">📖 Cara restore backup</p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>
            Install <code className="bg-gray-100 px-1 rounded text-xs">mongoimport</code> (bagian dari MongoDB Database Tools)
          </li>
          <li>
            Jalankan perintah berikut untuk setiap koleksi:
            <pre className="mt-1 rounded-lg bg-gray-900 text-green-400 text-xs p-3 overflow-x-auto whitespace-pre-wrap">
{`# Contoh restore koleksi orders dari file backup
node scripts/restore.mjs backup-2026-10-28.json`}
            </pre>
          </li>
          <li>
            Atau gunakan script restore bawaan:{" "}
            <code className="bg-gray-100 px-1 rounded text-xs">npm run db:restore -- backup-2026-10-28.json</code>
          </li>
        </ol>
      </div>

      {/* ── Rekomendasi jadwal ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">💡 Rekomendasi jadwal backup</p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-700 text-xs">
          <li>Backup manual: minimal 1x seminggu</li>
          <li>
            Backup otomatis: tambahkan cron harian di{" "}
            <code className="bg-amber-100 px-1 rounded">vercel.json</code> —
            path <code className="bg-amber-100 px-1 rounded">/api/cron/backup-db</code>,
            jadwal <code className="bg-amber-100 px-1 rounded">0 18 * * *</code> (01:00 WIB)
          </li>
          <li>Simpan minimal 3 versi backup terakhir</li>
          <li>Simpan di lokasi berbeda (cloud + lokal)</li>
        </ul>
      </div>
    </main>
  );
}
