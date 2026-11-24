import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxService } from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import { SEED_COMMUNITY_ID } from "../domain/seed.js";
import type { ParticipantRecord } from "../domain/types.js";
import { ActorAuthorizationService } from "./actor-authorization.service.js";
import { CommunityManagersStore } from "./community-managers.store.js";
import { OPERATOR_SCOPE_COMMUNITY_ID } from "./actor-authorization.types.js";

const C = SEED_COMMUNITY_ID;
const P = "a2222222-0000-4000-8000-000000000002";
const M = "a9999999-0000-4000-8000-000000000099";
const OP = "a0000000-0000-4000-8000-000000000010";

describe("ActorAuthorizationService (REQ-049 / REQ-010)", () => {
  let store: ParticipantsStore;
  let managers: CommunityManagersStore;
  let outbox: { append: ReturnType<typeof vi.fn> };
  let svc: ActorAuthorizationService;

  beforeEach(() => {
    store = new ParticipantsStore();
    store.reset();
    managers = new CommunityManagersStore();
    outbox = { append: vi.fn(async () => "evt-1") };
    svc = new ActorAuthorizationService(
      store,
      managers,
      outbox as unknown as OutboxService,
    );
    delete process.env.OPERATOR_ACTOR_IDS;
  });

  it("REQ-049: participant P (producer, community C) -> member of C with participantRole producer", async () => {
    putParticipant(store, {
      participantId: P,
      communityId: C,
      role: "producer",
      status: "Ready",
    });
    expect(await svc.authorize(P)).toEqual({
      actorId: P,
      status: "active",
      memberships: [
        { communityId: C, role: "member", participantRole: "producer" },
      ],
    });
  });

  it("REQ-049: bound manager M of C -> role manager", async () => {
    await svc.bindManager(C, M, "operator-1");
    expect(await svc.authorize(M)).toEqual({
      actorId: M,
      status: "active",
      memberships: [{ communityId: C, role: "manager" }],
    });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AuditableActionPerformed",
        data: expect.objectContaining({
          action: "community.manager.bind",
          target: `actor:${M}`,
        }),
      }),
    );
  });

  it("offboarded participant -> status offboarded, memberships []", async () => {
    putParticipant(store, {
      participantId: P,
      communityId: C,
      role: "consumer",
      status: "Offboarded",
    });
    expect(await svc.authorize(P)).toEqual({
      actorId: P,
      status: "offboarded",
      memberships: [],
    });
  });

  it("unknown id -> status unknown (HTTP 200, not 404, so callers cannot probe ids by status code)", async () => {
    expect(await svc.authorize("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toEqual(
      {
        actorId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        status: "unknown",
        memberships: [],
      },
    );
  });

  it("REQ-030: OPERATOR_ACTOR_IDS yields operator membership", async () => {
    process.env.OPERATOR_ACTOR_IDS = OP;
    expect(await svc.authorize(OP)).toEqual({
      actorId: OP,
      status: "active",
      memberships: [
        { communityId: OPERATOR_SCOPE_COMMUNITY_ID, role: "operator" },
      ],
    });
  });
});

function putParticipant(
  store: ParticipantsStore,
  partial: Pick<
    ParticipantRecord,
    "participantId" | "communityId" | "role" | "status"
  >,
): void {
  store.putParticipant({
    participantId: partial.participantId,
    communityId: partial.communityId,
    role: partial.role,
    status: partial.status,
    marketActorId: `mkt-${partial.participantId.slice(0, 8)}`,
    meterId: `m-${partial.participantId.slice(0, 8)}`,
    idpUserId: null,
    profile: null,
    termsVersionAccepted: null,
    selfBillingMandate: false,
    paymentAccountReady: false,
    paymentBlockReason: null,
    source: "import",
    postalAddress: null,
    phone: null,
    termsAcceptedAt: null,
    kycVerified: false,
    actorVersion: null,
  });
}
