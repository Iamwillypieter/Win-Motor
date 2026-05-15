/**
 * Rate Limiter — in-memory rate limiting using a Map.
 * Suitable for single-instance deployments.
 *
 * Key: IP address
 * Value: { count: number, resetAt: timestamp }
 */

const requestCounts = new Map();

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
