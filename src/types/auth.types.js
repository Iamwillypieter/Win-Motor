/**
 * User roles in the POS system.
 * @enum {string}
 */
export const UserRole = {
  CASHIER: "CASHIER",
  WAREHOUSE: "WAREHOUSE",
  OWNER: "OWNER",
};

/**
 * Array of all valid user roles.
 * @type {string[]}
 */
export const USER_ROLES = Object.values(UserRole);

/**
 * Route prefix to allowed roles mapping.
 * @type {Object.<string, string[]>}
 */
export const ROUTE_ROLE_MAP = {
  "/cashier": [UserRole.CASHIER],
  "/warehouse": [UserRole.WAREHOUSE],
  "/owner": [UserRole.OWNER],
};

/**
 * Default redirect paths per role after login.
 * @type {Object.<string, string>}
 */
export const ROLE_DEFAULT_REDIRECT = {
  [UserRole.CASHIER]: "/cashier",
  [UserRole.WAREHOUSE]: "/warehouse/queue",
  [UserRole.OWNER]: "/owner/dashboard",
};
