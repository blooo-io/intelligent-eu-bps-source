import { describe, expect, it } from "vitest";
import {
  CommandAuthorizer,
  parseAllowedCommandDids,
} from "./command-authorizer.js";
import type {
  ActorAuthzView,
  BillingCommandRequest,
  InvoiceAuthzView,
} from "./billing-command.types.js";
import { StubActorAuthzClient } from "./participants-authz.client.js";
import { StubInvoiceLookupClient } from "./invoice-lookup.client.js";

const ALLOWED = "did:ethr:0xUI";
const C1 = "a1000000-0000-4000-8000-000000000001";
const C2 = "b2000000-0000-4000-8000-000000000002";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const OTHER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const INV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("CommandAuthorizer (REQ-052 / A7 / REQ-049)", () => {
  it("A7: unknown sender DID -> forbidden, no internal call", async () => {
    const authz = new StubActorAuthzClient();
    const invoices = new StubInvoiceLookupClient();
    const a = new CommandAuthorizer([ALLOWED], authz, invoices);
    const req = baseReq("startPayment", { invoiceId: INV });
    expect(await a.decide("did:ethr:0xEVIL", true, req)).toEqual({
      allow: false,
      code: "forbidden",
    });
    expect(authz.calls).toBe(0);
  });

  it("A7: signatureValid false -> forbidden", async () => {
    const authz = new StubActorAuthzClient();
    const invoices = new StubInvoiceLookupClient();
    const a = new CommandAuthorizer([ALLOWED], authz, invoices);
    const req = baseReq("startPayment", { invoiceId: INV });
    expect(await a.decide(ALLOWED, false, req)).toEqual({
      allow: false,
      code: "forbidden",
    });
    expect(authz.calls).toBe(0);
  });

  it("REQ-049: manager of C2 cannot setInvoiceStatus on invoice of C1", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C2));
    const invoices = new StubInvoiceLookupClient();
    invoices.set(invoice(INV, C1, OTHER));
    const a = new CommandAuthorizer([ALLOWED], authz, invoices);
    const req = baseReq("setInvoiceStatus", {
      invoiceId: INV,
      status: "Void",
      reason: "wrong community",
    });
    expect(await a.decide(ALLOWED, true, req)).toEqual({
      allow: false,
      code: "forbidden",
    });
  });

  it("REQ-014: member cannot startPayment on an invoice issued to someone else", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(ACTOR, C1, "consumer"));
    const invoices = new StubInvoiceLookupClient();
    invoices.set(invoice(INV, C1, OTHER));
    const a = new CommandAuthorizer([ALLOWED], authz, invoices);
    const req = baseReq("startPayment", {
      invoiceId: INV,
      surface: "hosted",
      returnUrl: "https://example.invalid/return",
    });
    expect(await a.decide(ALLOWED, true, req)).toEqual({
      allow: false,
      code: "forbidden",
    });
  });

  it("consumer-only member requestWithdrawal -> forbidden", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(ACTOR, C1, "consumer"));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    const req = baseReq("requestWithdrawal", { currency: "EUR" });
    expect(await a.decide(ALLOWED, true, req)).toEqual({
      allow: false,
      code: "forbidden",
    });
  });

  it("operator triggerBillingRun on any community -> allow role operator", async () => {
    const authz = new StubActorAuthzClient();
    authz.set({
      actorId: ACTOR,
      status: "active",
      memberships: [
        {
          communityId: "00000000-0000-4000-8000-000000000099",
          role: "operator",
        },
      ],
    });
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    const req = baseReq("triggerBillingRun", {
      communityId: C2,
      period: "2026-11",
      type: "periodic",
    });
    expect(await a.decide(ALLOWED, true, req)).toEqual({
      allow: true,
      communityId: C2,
      role: "operator",
    });
  });

  it("REQ-014: member startPayment on own invoice -> allow", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(ACTOR, C1, "consumer"));
    const invoices = new StubInvoiceLookupClient();
    invoices.set(invoice(INV, C1, ACTOR));
    const a = new CommandAuthorizer([ALLOWED], authz, invoices);
    const req = baseReq("startPayment", {
      invoiceId: INV,
      surface: "hosted",
      returnUrl: "https://example.invalid/return",
    });
    expect(await a.decide(ALLOWED, true, req)).toEqual({
      allow: true,
      communityId: C1,
      role: "member",
    });
  });

  it("missing invoice -> not_found", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C1));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    const req = baseReq("setInvoiceStatus", {
      invoiceId: INV,
      status: "Void",
      reason: "gone",
    });
    expect(await a.decide(ALLOWED, true, req)).toEqual({
      allow: false,
      code: "not_found",
    });
  });

  it("producer requestWithdrawal -> allow", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(ACTOR, C1, "producer"));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("requestWithdrawal", { currency: "EUR" }),
      ),
    ).toEqual({ allow: true, communityId: C1, role: "member" });
  });

  it("manager startKyc -> allow role manager (identity)", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C1));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("startKyc", {
          surface: "hosted",
          returnUrl: "https://example.invalid/return",
        }),
      ),
    ).toEqual({ allow: true, communityId: C1, role: "manager" });
  });

  it("member startKyc -> allow role member (connect_account)", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(ACTOR, C1, "consumer"));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("startKyc", { surface: "embedded" }),
      ),
    ).toEqual({ allow: true, communityId: C1, role: "member" });
  });

  it("startKyc with no membership -> forbidden", async () => {
    const authz = new StubActorAuthzClient();
    authz.set({ actorId: ACTOR, status: "active", memberships: [] });
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(ALLOWED, true, baseReq("startKyc", { surface: "hosted" })),
    ).toEqual({ allow: false, code: "forbidden" });
  });

  it("manager sendReminder on own community invoice -> allow", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C1));
    const invoices = new StubInvoiceLookupClient();
    invoices.set(invoice(INV, C1, OTHER));
    const a = new CommandAuthorizer([ALLOWED], authz, invoices);
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("sendReminder", { invoiceId: INV }),
      ),
    ).toEqual({ allow: true, communityId: C1, role: "manager" });
  });

  it("manager triggerBillingRun for own community -> allow", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C1));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("triggerBillingRun", {
          communityId: C1,
          period: "2026-11",
          type: "periodic",
        }),
      ),
    ).toEqual({ allow: true, communityId: C1, role: "manager" });
  });

  it("triggerBillingRun without communityId -> forbidden", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C1));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(ALLOWED, true, baseReq("triggerBillingRun", {})),
    ).toEqual({ allow: false, code: "forbidden" });
  });

  it("setupPaymentMethod for member -> allow", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(ACTOR, C1, "consumer"));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("setupPaymentMethod", {
          surface: "hosted",
          returnUrl: "https://example.invalid/r",
        }),
      ),
    ).toEqual({ allow: true, communityId: C1, role: "member" });
  });

  it("setupPaymentMethod without member role -> forbidden", async () => {
    const authz = new StubActorAuthzClient();
    authz.set(activeManager(ACTOR, C1));
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("setupPaymentMethod", { surface: "embedded" }),
      ),
    ).toEqual({ allow: false, code: "forbidden" });
  });

  it("offboarded actor -> forbidden after DID check", async () => {
    const authz = new StubActorAuthzClient();
    authz.set({ actorId: ACTOR, status: "offboarded", memberships: [] });
    const a = new CommandAuthorizer(
      [ALLOWED],
      authz,
      new StubInvoiceLookupClient(),
    );
    expect(
      await a.decide(
        ALLOWED,
        true,
        baseReq("requestWithdrawal", { currency: "EUR" }),
      ),
    ).toEqual({ allow: false, code: "forbidden" });
  });

  it("parseAllowedCommandDids splits and trims", () => {
    expect(parseAllowedCommandDids(undefined)).toEqual([]);
    expect(parseAllowedCommandDids("  did:a , did:b ")).toEqual([
      "did:a",
      "did:b",
    ]);
  });
});

function baseReq(
  operation: BillingCommandRequest["operation"],
  payload: Record<string, unknown>,
): BillingCommandRequest {
  return {
    requestId: "cccccccc-dddd-4eee-8fff-000000000001",
    operation,
    actorId: ACTOR,
    payload,
  };
}

function activeMember(
  actorId: string,
  communityId: string,
  participantRole: "consumer" | "producer" | "prosumer",
): ActorAuthzView {
  return {
    actorId,
    status: "active",
    memberships: [{ communityId, role: "member", participantRole }],
  };
}

function activeManager(actorId: string, communityId: string): ActorAuthzView {
  return {
    actorId,
    status: "active",
    memberships: [{ communityId, role: "manager" }],
  };
}

function invoice(
  invoiceId: string,
  communityId: string,
  invoiceIssuedTo: string,
): InvoiceAuthzView {
  return {
    invoiceId,
    communityId,
    invoiceIssuedTo,
    invoiceIssuedBy: OTHER,
  };
}
