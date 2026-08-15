/**
 * P-IDP admin port (03 §7). Token validation stays at AC-02.
 * Methods: createUser, sendInvitation, deleteUser.
 */
export type IdpCreateUserInput = {
  email: string;
  /** Billing community UUID — stored as Keycloak attribute `community_id`. */
  communityId: string;
  /**
   * Market role from CSV (consumer|producer|prosumer). Kept for the mock /
   * registry; Keycloak invitees always receive realm role `member`.
   */
  role: string;
};

export type IdpUser = {
  /** Keycloak user id — identifiers only outside this module. */
  userId: string;
};

export interface IdpAdminPort {
  createUser(input: IdpCreateUserInput): Promise<IdpUser>;
  sendInvitation(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export const IDP_ADMIN_PORT = Symbol("IDP_ADMIN_PORT");
