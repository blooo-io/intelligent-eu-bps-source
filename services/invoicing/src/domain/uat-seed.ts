import type { InvoiceRecord } from "./types.js";

/**
 * INT-218 — V1 UAT invoice so `/v1/me/invoices` is non-empty for uat-member
 * after pod restart (same pattern as AC-03 seedParticipants / INT-194).
 *
 * consumerId is the Keycloak fixture subject (int-realm.json). Public list
 * matches IdP sub directly and (INT-236) also the AC-03 participantId when
 * PARTICIPANTS_INTERNAL_URL resolves the binding — so UAT seed and S1 invoices
 * both work for member login.
 */
export const UAT_MEMBER_IDP_SUB = "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f";
export const UAT_MANAGER_IDP_SUB = "aca5adb7-0f18-4db8-aa04-6a0ff11b8ec6";
export const UAT_COMMUNITY_ID = "a1000000-0000-4000-8000-000000000001";

export const UAT_INVOICE_ID = "c0a1b2c3-d4e5-4f60-8a70-b8c9d0e1f203";

/**
 * Marker URL — public document handler serves an inline stub PDF instead of
 * redirecting (browser fetch + external redirect fails CORS / cluster egress).
 */
export const UAT_HOSTED_INVOICE_URL = "seed:uat218-inline-pdf";

/** Minimal valid PDF bytes for Open PDF e2e (REQ-039 path). */
export const UAT_INLINE_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  "utf8",
);

export function seedUatInvoices(): InvoiceRecord[] {
  return [
    {
      invoiceId: UAT_INVOICE_ID,
      settlementId: "s0eed000-0000-4000-8000-000000000028",
      producerId: UAT_MANAGER_IDP_SUB,
      consumerId: UAT_MEMBER_IDP_SUB,
      currency: "EUR",
      // Paid — journey asserts View/PDF; Pay stays disabled (no PSP method required).
      status: "Paid",
      total: "22.00",
      tradeIds: ["0xuat218seed000000000000000000001"],
      stripeInvoiceId: "in_test_uat218_seed",
      legalNumber: "UAT218-000001",
      hostedInvoiceUrl: UAT_HOSTED_INVOICE_URL,
      energyAmount: "20.00",
      vatAmount: "2.00",
      producerStripeAccountId: "acct_test_uat218",
      dueDate: "2026-11-30",
      communityId: UAT_COMMUNITY_ID,
      statusAudit: [],
    },
  ];
}
