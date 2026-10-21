/**
 * Rate Limiter — in-memory rate limiting using a Map.
 * Suitable for single-instance deployments.
 *
 * Key: IP address
 * Value: { count: number, resetAt: timestamp }
 */

const requestCounts = new Map();

/**
 * Extract the real client IP from a Next.js Request object.
 *
 * Priority:
 * 1. `x-real-ip`       — di-set oleh Vercel edge network, tidak bisa dimanipulasi client
 * 2. `x-forwarded-for` — ambil entri pertama (client asli), fallback jika x-real-ip tidak ada
 * 3. "unknown"         — jika tidak ada header sama sekali
 *
 * Catatan: Di Vercel production, `x-real-ip` selalu ada dan terpercaya.
 * Di environment lain tanpa trusted proxy, x-forwarded-for bisa di-spoof —
 * sehingga rate limiting tidak 100% andal tanpa infrastruktur proxy yang benar.
 *
 * @param {Request} request - Next.js Request object
 * @returns {string} IP address string
 */
export function getClientIp(request) {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return "unknown";
}

/**
 * Check whether a given IP is within the allowed request rate.
 *
 * @param {string} ip - Client IP address
 * @param {number} maxRequests - Maximum requests allowed per window (default: 10)
 * @param {number} windowMs - Time window in milliseconds (default: 60_000 = 1 minute)
 * @returns {{ allowed: true } | { allowed: false, retryAfter: number }}
 */
export function checkRateLimit(ip, maxRequests = 10, windowMs = 60_000) {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  // No entry yet, or the window has expired — start a fresh window
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  // Over the limit
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  // Within the limit — increment and allow
  entry.count++;
  return { allowed: true };
}
