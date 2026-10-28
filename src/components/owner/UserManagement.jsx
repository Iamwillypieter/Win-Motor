"use client";

import { useState, useEffect, useCallback } from "react";

const ROLE_LABELS = {
  CASHIER: "Kasir",
  WAREHOUSE: "Staf Gudang",
  OWNER: "Owner",
};

const ROLE_COLORS = {
  CASHIER: "bg-blue-100 text-blue-700",
  WAREHOUSE: "bg-green-100 text-green-700",
  OWNER: "bg-purple-100 text-purple-700",
};

export default function UserManagement({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [forceLogoutId, setForceLogoutId] = useState(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal memuat data");
      setUsers(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch online status
  const fetchOnlineStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/users/online");
      const body = await res.json();
      if (res.ok) {
        setOnlineUserIds(new Set((body.data || []).map((u) => u.userId)));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchOnlineStatus();
    // Poll online status setiap 10 detik
    const interval = setInterval(fetchOnlineStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchUsers, fetchOnlineStatus]);

  async function handleToggleActive(user) {
    const action = user.isActive ? "nonaktifkan" : "aktifkan";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} akun ${user.name}?`)) return;

    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal memperbarui");
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isActive: !user.isActive } : u))
      );
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleForceLogout(user) {
    if (!confirm(`Paksa logout ${user.name}? Sesi mereka akan langsung berakhir.`)) return;
    setForceLogoutId(user._id);
    try {
      const res = await fetch(`/api/users/${user._id}/logout`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal logout");
      // Update online status setelah force logout
      setTimeout(fetchOnlineStatus, 1000);
    } catch (err) {
      alert(err.message);
    } finally {
      setForceLogoutId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Manajemen Karyawan</h2>
          <p className="text-sm text-gray-500">Kelola akun kasir, staf gudang, dan owner</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Indikator online */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {onlineUserIds.size} online
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            + Tambah Karyawan
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Memuat data...
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Belum ada karyawan
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nama</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Akun</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const isOnline = onlineUserIds.has(user._id);
                return (
                  <tr key={user._id} className="hover:bg-gray-50">
                    {/* Status online */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            isOnline ? "bg-green-500 animate-pulse" : "bg-gray-300"
                          }`}
                        />
                        <span className={`text-xs font-medium ${isOnline ? "text-green-700" : "text-gray-400"}`}>
                          {isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {user.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditUser(user)}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setResetUser(user)}
                          className="rounded px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
                        >
                          Reset Password
                        </button>
                        {/* Force logout — hanya untuk user yang sedang online dan bukan diri sendiri */}
                        {isOnline && user._id !== currentUserId && (
                          <button
                            onClick={() => handleForceLogout(user)}
                            disabled={forceLogoutId === user._id}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {forceLogoutId === user._id ? "..." : "Logout"}
                          </button>
                        )}
                        {user._id !== currentUserId && (
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`rounded px-2 py-1 text-xs font-medium ${
                              user.isActive
                                ? "text-gray-500 hover:bg-gray-50"
                                : "text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(newUser) => {
            setUsers((prev) => [newUser, ...prev]);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={(updated) => {
            setUsers((prev) =>
              prev.map((u) => (u._id === updated._id ? { ...u, ...updated } : u))
            );
            setEditUser(null);
          }}
        />
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
    </div>
  );
}

/* ─── Add User Modal ─────────────────────────────────────────────────────── */

function AddUserModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CASHIER" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal menambah karyawan");
      onSuccess(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Tambah Karyawan Baru" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nama Lengkap">
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Contoh: Budi Santoso"
            className="input"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="budi@toko.com"
            className="input"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Minimal 6 karakter"
            className="input"
          />
        </Field>
        <Field label="Role">
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="input"
          >
            <option value="CASHIER">Kasir</option>
            <option value="WAREHOUSE">Staf Gudang</option>
            <option value="OWNER">Owner</option>
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Batal
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Menyimpan..." : "Tambah Karyawan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Edit User Modal ────────────────────────────────────────────────────── */

function EditUserModal({ user, onClose, onSuccess }) {
  const [form, setForm] = useState({ name: user.name, role: user.role });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal memperbarui");
      onSuccess(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Edit: ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nama Lengkap">
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Role">
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="input"
          >
            <option value="CASHIER">Kasir</option>
            <option value="WAREHOUSE">Staf Gudang</option>
            <option value="OWNER">Owner</option>
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Batal
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Reset Password Modal ───────────────────────────────────────────────── */

function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal mereset password");
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Reset Password: ${user.name}`} onClose={onClose}>
      {success ? (
        <div className="space-y-4">
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            Password berhasil direset. Informasikan password baru kepada karyawan.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="btn-primary">Tutup</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Password Baru">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="input"
            />
          </Field>
          <Field label="Konfirmasi Password">
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ulangi password baru"
              className="input"
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Batal
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Menyimpan..." : "Reset Password"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ─── Shared primitives ──────────────────────────────────────────────────── */

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
