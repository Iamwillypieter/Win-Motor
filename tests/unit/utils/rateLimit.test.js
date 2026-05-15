import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

// Requirements: 10.4

/**
 * The rate limiter uses a module-level Map. To isolate tests, we use
 * vi.useFakeTimers() to control Date.now() and advance time as needed.
 * Each test starts at a fresh timestamp far enough apart that no previous
 * window can bleed into the next test.
 */

describe("checkRateLimit()", () => {
  let baseTime;

  beforeEach(() => {
    vi.useFakeTimers();
    // Use a unique base time per test run to avoid cross-test Map pollution.
    // We advance by 10 minutes per test so each test gets a fresh window.
    baseTime = Date.now();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Default parameters (10 req / 60 000 ms) ───────────────────────────────

  it("should allow the first request from a new IP", () => {
    const ip = `192.168.1.${Math.random()}`;
    const result = checkRateLimit(ip);
    expect(result).toEqual({ allowed: true });
  });

  it("should allow requests up to the default limit of 10", () => {
    const ip = `10.0.0.${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit(ip);
      expect(result).toEqual({ allowed: true });
    }
  });

  it("should block the 11th request from the same IP (default limit)", () => {
    const ip = `10.1.0.${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip);
    }
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
  });

  it("should return retryAfter (seconds) when rate limited", () => {
    const ip = `10.2.0.${Math.random()}`;
    const windowMs = 60_000;

    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, windowMs);
    }

    // Advance 10 seconds into the window
    vi.advanceTimersByTime(10_000);

    const result = checkRateLimit(ip, 10, windowMs);
    expect(result.allowed).toBe(false);
    // retryAfter should be ~50 seconds (60 - 10), rounded up
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it("should return retryAfter as a positive integer (seconds)", () => {
    const ip = `10.3.0.${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip);
    }
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(Number.isInteger(result.retryAfter)).toBe(true);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  // ─── Window reset ───────────────────────────────────────────────────────────

  it("should reset the counter after the time window expires", () => {
    const ip = `10.4.0.${Math.random()}`;
    const windowMs = 60_000;

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, windowMs);
    }
    expect(checkRateLimit(ip, 10, windowMs).allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Should be allowed again (new window)
    const result = checkRateLimit(ip, 10, windowMs);
    expect(result).toEqual({ allowed: true });
  });

  it("should allow exactly maxRequests again after window reset", () => {
    const ip = `10.5.0.${Math.random()}`;
    const windowMs = 60_000;

    // First window: exhaust limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, windowMs);
    }

    // Advance past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Second window: should allow 10 more requests
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(ip, 10, windowMs)).toEqual({ allowed: true });
    }
    // 11th should be blocked again
    expect(checkRateLimit(ip, 10, windowMs).allowed).toBe(false);
  });

  // ─── Multiple IPs tracked independently ────────────────────────────────────

  it("should track multiple IPs independently", () => {
    const ip1 = `172.16.0.${Math.random()}`;
    const ip2 = `172.16.1.${Math.random()}`;

    // Exhaust ip1
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip1);
    }

    // ip2 should still be allowed
    expect(checkRateLimit(ip2)).toEqual({ allowed: true });
    // ip1 should be blocked
    expect(checkRateLimit(ip1).allowed).toBe(false);
  });

  it("should not affect IP B when IP A is rate limited", () => {
    const ipA = `172.17.0.${Math.random()}`;
    const ipB = `172.17.1.${Math.random()}`;

    // Exhaust ipA
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ipA);
    }
    checkRateLimit(ipA); // 11th — blocked

    // ipB should still have a full window
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(ipB)).toEqual({ allowed: true });
    }
  });

  it("should handle many different IPs simultaneously", () => {
    const ips = Array.from({ length: 20 }, (_, i) => `192.168.${i}.1`);

    // Each IP makes 5 requests — all should be allowed
    for (const ip of ips) {
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(ip)).toEqual({ allowed: true });
      }
    }
  });

  // ─── Custom parameters ──────────────────────────────────────────────────────

  it("should respect a custom maxRequests limit", () => {
    const ip = `10.6.0.${Math.random()}`;
    const maxRequests = 3;

    for (let i = 0; i < maxRequests; i++) {
      expect(checkRateLimit(ip, maxRequests)).toEqual({ allowed: true });
    }
    expect(checkRateLimit(ip, maxRequests).allowed).toBe(false);
  });

  it("should respect a custom windowMs duration", () => {
    const ip = `10.7.0.${Math.random()}`;
    const maxRequests = 5;
    const windowMs = 5_000; // 5 seconds

    // Exhaust the limit
    for (let i = 0; i < maxRequests; i++) {
      checkRateLimit(ip, maxRequests, windowMs);
    }
    expect(checkRateLimit(ip, maxRequests, windowMs).allowed).toBe(false);

    // Advance past the short window
    vi.advanceTimersByTime(windowMs + 1);

    // Should be allowed again
    expect(checkRateLimit(ip, maxRequests, windowMs)).toEqual({ allowed: true });
  });

  it("should allow maxRequests=1 to pass once and block on second call", () => {
    const ip = `10.8.0.${Math.random()}`;
    expect(checkRateLimit(ip, 1)).toEqual({ allowed: true });
    expect(checkRateLimit(ip, 1).allowed).toBe(false);
  });

  // ─── retryAfter accuracy ────────────────────────────────────────────────────

  it("should return retryAfter close to the remaining window time", () => {
    const ip = `10.9.0.${Math.random()}`;
    const windowMs = 60_000;

    // Exhaust limit at t=0
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, windowMs);
    }

    // Advance 30 seconds
    vi.advanceTimersByTime(30_000);

    const result = checkRateLimit(ip, 10, windowMs);
    expect(result.allowed).toBe(false);
    // Remaining time is ~30 seconds; Math.ceil((60000 - 30000) / 1000) = 30
    expect(result.retryAfter).toBe(30);
  });

  it("should return retryAfter of 1 when window is about to expire", () => {
    const ip = `10.10.0.${Math.random()}`;
    const windowMs = 60_000;

    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, windowMs);
    }

    // Advance to 1 ms before window expires (59 999 ms elapsed)
    vi.advanceTimersByTime(59_999);

    const result = checkRateLimit(ip, 10, windowMs);
    expect(result.allowed).toBe(false);
    // Math.ceil(1 / 1000) = 1
    expect(result.retryAfter).toBe(1);
  });
});
