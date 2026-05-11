"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import LoadingOverlay from "@/components/shared/LoadingOverlay";

/** Redirect path per role — harus sinkron dengan ROLE_DEFAULT_REDIRECT di auth.types.js */
const ROLE_REDIRECT = {
  CASHIER: "/cashier",
  WAREHOUSE: "/warehouse/queue",
  OWNER: "/owner/dashboard",
};

const ROLE_LABEL = {
  CASHIER: "Kasir",
  WAREHOUSE: "Staf Gudang",
  OWNER: "Owner",
};

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [redirectingRole, setRedirectingRole] = useState(null); // role saat redirect

  function validate() {
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email wajib diisi";
    } else if (!isValidEmail(email.trim())) {
      newErrors.email = "Format email tidak valid";
    }

    if (!password) {
      newErrors.password = "Kata sandi wajib diisi";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setAuthError("");

    if (!validate()) return;

    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setAuthError("Email atau kata sandi salah");
        setIsLoading(false);
      } else if (result?.ok) {
        // Ambil session untuk mendapatkan role
        const session = await getSession();
        const role = session?.user?.role;
        const destination = ROLE_REDIRECT[role] || "/";

        // Tampilkan overlay redirect sebelum navigasi
        setRedirectingRole(role);
        setIsLoading(false);

        // Sedikit delay agar overlay terlihat, lalu navigasi
        setTimeout(() => {
          window.location.href = destination;
        }, 800);
      }
    } catch {
      setAuthError("Terjadi kesalahan. Silakan coba lagi.");
      setIsLoading(false);
    }
  }

  return (
    <>
      {/* Overlay redirect — pakai komponen LoadingOverlay yang konsisten */}
      {redirectingRole && (
        <LoadingOverlay
          message="Login berhasil!"
          subMessage={`Mengarahkan ke halaman ${ROLE_LABEL[redirectingRole] ?? redirectingRole}...`}
        />
      )}

      <form onSubmit={handleSubmit} noValidate aria-label="Form masuk">
        {/* Generic auth error */}
        {authError && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            {authError}
          </div>
        )}

        {/* Email field */}
        <div className="mb-4">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
            }}
            disabled={isLoading || !!redirectingRole}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
              errors.email
                ? "border-red-400 bg-red-50"
                : "border-gray-300 bg-white"
            }`}
            placeholder="nama@contoh.com"
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-red-600">
              {errors.email}
            </p>
          )}
        </div>

        {/* Password field */}
        <div className="mb-6">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Kata Sandi
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password)
                setErrors((prev) => ({ ...prev, password: "" }));
            }}
            disabled={isLoading || !!redirectingRole}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
              errors.password
                ? "border-red-400 bg-red-50"
                : "border-gray-300 bg-white"
            }`}
            placeholder="••••••••"
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {errors.password}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isLoading || !!redirectingRole}
          className="w-full"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Memproses...
            </span>
          ) : (
            "Masuk"
          )}
        </Button>
      </form>
    </>
  );
}
