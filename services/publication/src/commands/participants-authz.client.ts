import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";
import type { ActorAuthzView } from "./billing-command.types.js";

/**
 * REQ-052 — GET /internal/v1/actors/{actorId}/authorization (AC-03).
 */
export interface ActorAuthzClient {
  getAuthorization(actorId: string): Promise<ActorAuthzView>;
  readonly calls: number;
}

export class HttpActorAuthzClient implements ActorAuthzClient {
  calls = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getAuthorization(actorId: string): Promise<ActorAuthzView> {
    this.calls += 1;
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/actors/${encodeURIComponent(actorId)}/authorization`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-10-publication", this.auth)),
      },
    });
    if (!res.ok) {
      throw new Error(`participants authorization failed with ${res.status}`);
    }
    return (await res.json()) as ActorAuthzView;
  }
}

/** Test double that records call counts. */
export class StubActorAuthzClient implements ActorAuthzClient {
  calls = 0;

  constructor(
    private readonly byId: Map<string, ActorAuthzView> = new Map(),
  ) {}

  set(view: ActorAuthzView): void {
    this.byId.set(view.actorId, view);
  }

  async getAuthorization(actorId: string): Promise<ActorAuthzView> {
    this.calls += 1;
    return (
      this.byId.get(actorId) ?? {
        actorId,
        status: "unknown",
        memberships: [],
      }
    );
  }
}
