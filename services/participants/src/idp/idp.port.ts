/**
 * P-IDP admin port (03 §7). Token validation stays at AC-02.
 * Methods: createUser, sendInvitation, deleteUser.
 */
export type IdpCreateUserInput = {
  email: string;
  communityId: string;
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
