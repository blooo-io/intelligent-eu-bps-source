import { randomUUID } from "node:crypto";
import type { IdpAdminPort, IdpCreateUserInput, IdpUser } from "./idp.port.js";

/**
 * Local mock for P-IDP (V1 tests / offline). Production uses Keycloak admin REST.
 * Does not persist e-mail beyond the call; only userId is retained by AC-03.
 */
export class MockIdpAdapter implements IdpAdminPort {
  readonly created = new Map<string, { communityId: string; role: string }>();
  readonly invitations = new Set<string>();
  readonly deleted = new Set<string>();

  async createUser(input: IdpCreateUserInput): Promise<IdpUser> {
    void input.email;
    const userId = randomUUID();
    this.created.set(userId, {
      communityId: input.communityId,
      role: input.role,
    });
    return { userId };
  }

  async sendInvitation(userId: string): Promise<void> {
    if (!this.created.has(userId) || this.deleted.has(userId)) {
      throw new Error(`unknown IdP user ${userId}`);
    }
    this.invitations.add(userId);
  }

  async deleteUser(userId: string): Promise<void> {
    this.deleted.add(userId);
    this.created.delete(userId);
    this.invitations.delete(userId);
  }
}
