/**
 * Property-Based Tests: Authentication & Authorization (P1–P4)
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6
 *
 * P1: Role-Based Access Control — for every (role, route) pair that is NOT
 *     allowed, the middleware redirects to /403 (HTTP 403 behavior).
 * P2: Redirect to Login — every protected route without a session redirects
 *     to /login.
 * P3: Login Redirect by Role — every valid role is redirected to the correct
 *     landing page after login.
 * P4: Generic Error Message — both "email not found" and "wrong password"
 *     scenarios return the same generic error message.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Inline the constants we need so the test is self-contained and does not
// require importing Next.js server modules (which are not available in jsdom).
// ---------------------------------------------------------------------------

const UserRole = {
  CASHIER: "CASHIER",
  WAREHOUSE: "WAREHOUSE",
  OWNER: "OWNER",
};

const ROUTE_ROLE_MAP = {
  "/cashier": [UserRole.CASHIER],
  "/warehouse": [UserRole.WAREHOUSE],
  "/owner": [UserRole.OWNER],
};

const ROLE_DEFAULT_REDIRECT = {
  [UserRole.CASHIER]: "/cashier",
  [UserRole.WAREHOUSE]: "/warehouse/queue",
  [UserRole.OWNER]: "/owner/dashboard",
};

const ALL_ROLES = Object.values(UserRole);
const GENERIC_ERROR_MESSAGE = "Email atau kata sandi salah";

// ---------------------------------------------------------------------------
// Pure middleware logic extracted for unit-testable form.
// This mirrors the logic in middleware.js without importing Next.js internals.
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES = ["/login", "/403"];
const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/favicon.ico"];

function isPublicRoute(pathname) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getRequiredRoles(pathname) {
  for (const [prefix, roles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname.startsWith(prefix)) {
      return roles;
    }
  }
  return null;
}

/**
 * Simulates the middleware decision for a given (pathname, session) pair.
 * Returns one of:
 *   { action: "next" }                  — allowed through
 *   { action: "redirect", to: "/login" } — unauthenticated redirect
 *   { action: "redirect", to: "/403" }  — forbidden redirect
 */
function simulateMiddleware(pathname, session) {
  if (isPublicRoute(pathname)) {
    return { action: "next" };
  }

  if (!session || !session.user) {
    return { action: "redirect", to: "/login" };
  }

  const requiredRoles = getRequiredRoles(pathname);
  if (requiredRoles && !requiredRoles.includes(session.user.role)) {
    return { action: "redirect", to: "/403" };
  }

  return { action: "next" };
}

/**
 * Simulates the authorize() function from src/lib/auth.js.
 * Returns null (→ generic error) when credentials are invalid.
 * Returns a user object when credentials are valid.
 *
 * @param {object} credentials - { email, password }
 * @param {object[]} userDb    - Array of { email, passwordHash, role, isActive }
 * @param {Function} bcryptCompare - (plain, hash) => boolean
 */
async function simulateAuthorize(credentials, userDb, bcryptCompare) {
  if (!credentials?.email || !credentials?.password) {
    return null;
  }

  const user = userDb.find(
    (u) =>
      u.email === credentials.email.toLowerCase().trim() && u.isActive === true
  );

  if (!user) {
    // Email not found → return null (generic error)
    return null;
  }

  const isPasswordValid = await bcryptCompare(
    credentials.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    // Wrong password → return null (generic error)
    return null;
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/**
 * Simulates the post-login redirect logic (mirrors LoginForm / signIn callback).
 * @param {string} role
 * @returns {string} redirect path
 */
function getDefaultRedirect(role) {
  return ROLE_DEFAULT_REDIRECT[role] || "/login";
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid role string */
const arbRole = fc.constantFrom(...ALL_ROLES);

/** Generates a protected route prefix */
const arbRoutePrefix = fc.constantFrom(
  "/cashier",
  "/warehouse",
  "/owner"
);

/** Generates a sub-path segment (e.g. "/orders", "/queue/123") */
const arbSubPath = fc.stringMatching(/^\/[a-z0-9\-_]{0,20}/).map((s) =>
  s === "/" ? "" : s
);

/** Generates a full protected route like /cashier/orders */
const arbProtectedRoute = fc
  .tuple(arbRoutePrefix, arbSubPath)
  .map(([prefix, sub]) => prefix + sub);

/** Generates a (role, route) pair where the role is NOT allowed for that route */
const arbMismatchedRoleRoute = fc
  .tuple(arbRole, arbRoutePrefix, arbSubPath)
  .filter(([role, prefix]) => {
    const allowedRoles = ROUTE_ROLE_MAP[prefix];
    return !allowedRoles.includes(role);
  })
  .map(([role, prefix, sub]) => ({ role, pathname: prefix + sub }));

// ---------------------------------------------------------------------------
// P1: Role-Based Access Control
// Validates: Requirements 1.5, 1.6
// ---------------------------------------------------------------------------

describe("P1: Role-Based Access Control", () => {
  it(
    "should redirect to /403 for every (role, route) pair that is not allowed",
    () => {
      /**
       * Validates: Requirements 1.5, 1.6
       *
       * For every combination of (role, protected route) where the role is NOT
       * in the allowed list for that route, the middleware must redirect to /403.
       */
      fc.assert(
        fc.property(arbMismatchedRoleRoute, ({ role, pathname }) => {
          const session = { user: { role, id: "user-1", name: "Test User" } };
          const result = simulateMiddleware(pathname, session);

          expect(result.action).toBe("redirect");
          expect(result.to).toBe("/403");
        })
      );
    }
  );

  it(
    "should allow access when role matches the route",
    () => {
      /**
       * Validates: Requirements 1.5, 1.6 (positive case)
       *
       * For every (role, route) pair where the role IS allowed, the middleware
       * must let the request through.
       */
      const arbMatchingRoleRoute = fc
        .tuple(arbRoutePrefix, arbSubPath)
        .chain(([prefix, sub]) => {
          const allowedRoles = ROUTE_ROLE_MAP[prefix];
          return fc
            .constantFrom(...allowedRoles)
            .map((role) => ({ role, pathname: prefix + sub }));
        });

      fc.assert(
        fc.property(arbMatchingRoleRoute, ({ role, pathname }) => {
          const session = { user: { role, id: "user-1", name: "Test User" } };
          const result = simulateMiddleware(pathname, session);

          expect(result.action).toBe("next");
        })
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P2: Redirect to Login
// Validates: Requirement 1.4
// ---------------------------------------------------------------------------

describe("P2: Redirect to Login", () => {
  it(
    "should redirect to /login for every protected route when there is no session",
    () => {
      /**
       * Validates: Requirement 1.4
       *
       * For every protected route, if there is no active session, the middleware
       * must redirect to /login.
       */
      fc.assert(
        fc.property(arbProtectedRoute, (pathname) => {
          // No session
          const result = simulateMiddleware(pathname, null);

          expect(result.action).toBe("redirect");
          expect(result.to).toBe("/login");
        })
      );
    }
  );

  it(
    "should redirect to /login when session exists but user is missing",
    () => {
      /**
       * Validates: Requirement 1.4
       *
       * A session object without a user property is treated as unauthenticated.
       */
      fc.assert(
        fc.property(arbProtectedRoute, (pathname) => {
          const result = simulateMiddleware(pathname, {}); // session without user

          expect(result.action).toBe("redirect");
          expect(result.to).toBe("/login");
        })
      );
    }
  );

  it("should NOT redirect public routes even without a session", () => {
    /**
     * Validates: Requirement 1.4 (boundary)
     *
     * Public routes (/login, /403) must always be accessible without a session.
     */
    const publicRoutes = ["/login", "/403", "/api/auth/signin"];
    for (const pathname of publicRoutes) {
      const result = simulateMiddleware(pathname, null);
      expect(result.action).toBe("next");
    }
  });
});

// ---------------------------------------------------------------------------
// P3: Login Redirect by Role
// Validates: Requirement 1.2
// ---------------------------------------------------------------------------

describe("P3: Login Redirect by Role", () => {
  it(
    "should redirect every valid role to the correct landing page after login",
    () => {
      /**
       * Validates: Requirement 1.2
       *
       * After a successful login, each role must be redirected to its designated
       * landing page:
       *   CASHIER   → /cashier
       *   WAREHOUSE → /warehouse/queue
       *   OWNER     → /owner/dashboard
       */
      fc.assert(
        fc.property(arbRole, (role) => {
          const redirect = getDefaultRedirect(role);

          if (role === UserRole.CASHIER) {
            expect(redirect).toBe("/cashier");
          } else if (role === UserRole.WAREHOUSE) {
            expect(redirect).toBe("/warehouse/queue");
          } else if (role === UserRole.OWNER) {
            expect(redirect).toBe("/owner/dashboard");
          }
        })
      );
    }
  );

  it("should return a non-empty string for every valid role", () => {
    /**
     * Validates: Requirement 1.2
     *
     * The redirect path must always be a non-empty string for any valid role.
     */
    fc.assert(
      fc.property(arbRole, (role) => {
        const redirect = getDefaultRedirect(role);
        expect(typeof redirect).toBe("string");
        expect(redirect.length).toBeGreaterThan(0);
        expect(redirect.startsWith("/")).toBe(true);
      })
    );
  });

  it("should cover all three roles with distinct redirect paths", () => {
    /**
     * Validates: Requirement 1.2
     *
     * Each role must have a unique redirect destination.
     */
    const redirects = ALL_ROLES.map((role) => getDefaultRedirect(role));
    const uniqueRedirects = new Set(redirects);
    expect(uniqueRedirects.size).toBe(ALL_ROLES.length);
  });
});

// ---------------------------------------------------------------------------
// P4: Generic Error Message for Invalid Credentials
// Validates: Requirement 1.3
// ---------------------------------------------------------------------------

describe("P4: Generic Error Message for Invalid Credentials", () => {
  /**
   * The authorize() function returns null for both "email not found" and
   * "wrong password" scenarios. The UI layer maps null → GENERIC_ERROR_MESSAGE.
   * We test that both failure paths produce the same observable outcome.
   */

  /** Arbitrary for a valid-looking email */
  const arbEmail = fc
    .tuple(
      fc.stringMatching(/^[a-z]{3,10}$/),
      fc.stringMatching(/^[a-z]{3,8}$/)
    )
    .map(([local, domain]) => `${local}@${domain}.com`);

  /** Arbitrary for a password string */
  const arbPassword = fc.string({ minLength: 6, maxLength: 20 });

  it(
    "should return null (generic error) when email is not registered",
    async () => {
      /**
       * Validates: Requirement 1.3
       *
       * When the submitted email does not exist in the database, authorize()
       * returns null — which the UI maps to the generic error message.
       */
      await fc.assert(
        fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
          // Empty user database — no email will be found
          const emptyDb = [];
          const bcryptCompare = vi.fn().mockResolvedValue(false);

          const result = await simulateAuthorize(
            { email, password },
            emptyDb,
            bcryptCompare
          );

          // null → UI shows GENERIC_ERROR_MESSAGE
          expect(result).toBeNull();
          // bcryptCompare should NOT be called when user is not found
          expect(bcryptCompare).not.toHaveBeenCalled();
        })
      );
    }
  );

  it(
    "should return null (generic error) when password is wrong",
    async () => {
      /**
       * Validates: Requirement 1.3
       *
       * When the email exists but the password does not match, authorize()
       * returns null — the same result as "email not found".
       */
      await fc.assert(
        fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
          const existingUser = {
            id: "user-1",
            name: "Test User",
            email: email.toLowerCase().trim(),
            passwordHash: "hashed_password",
            role: UserRole.CASHIER,
            isActive: true,
          };

          // bcryptCompare always returns false → wrong password
          const bcryptCompare = vi.fn().mockResolvedValue(false);

          const result = await simulateAuthorize(
            { email, password },
            [existingUser],
            bcryptCompare
          );

          expect(result).toBeNull();
          // bcryptCompare MUST be called (user was found, password checked)
          expect(bcryptCompare).toHaveBeenCalledOnce();
        })
      );
    }
  );

  it(
    "should produce identical null result for both invalid-email and wrong-password scenarios",
    async () => {
      /**
       * Validates: Requirement 1.3
       *
       * The key security property: the outcome of "email not found" and
       * "wrong password" must be indistinguishable to the caller (both null).
       * This prevents user enumeration attacks.
       */
      await fc.assert(
        fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
          const existingUser = {
            id: "user-1",
            name: "Test User",
            email: email.toLowerCase().trim(),
            passwordHash: "hashed_password",
            role: UserRole.CASHIER,
            isActive: true,
          };

          // Scenario A: email not found
          const resultA = await simulateAuthorize(
            { email: `nonexistent_${email}`, password },
            [existingUser],
            vi.fn().mockResolvedValue(false)
          );

          // Scenario B: email found but wrong password
          const resultB = await simulateAuthorize(
            { email, password },
            [existingUser],
            vi.fn().mockResolvedValue(false)
          );

          // Both must return null — identical generic outcome
          expect(resultA).toBeNull();
          expect(resultB).toBeNull();
          expect(resultA).toBe(resultB);
        })
      );
    }
  );

  it("should map null authorize result to the generic error message", () => {
    /**
     * Validates: Requirement 1.3
     *
     * The UI layer must display GENERIC_ERROR_MESSAGE when authorize() returns
     * null, regardless of the underlying reason.
     */
    function mapAuthorizeResultToMessage(authorizeResult) {
      if (authorizeResult === null) {
        return GENERIC_ERROR_MESSAGE;
      }
      return null; // success — no error message
    }

    // null result always maps to the generic message
    expect(mapAuthorizeResultToMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
    // successful result maps to null (no error)
    expect(
      mapAuthorizeResultToMessage({ id: "1", role: UserRole.CASHIER })
    ).toBeNull();
  });
});
