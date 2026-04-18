import type { InvoiceRecord } from "./types.js";

/**
 * INT-218 — V1 UAT invoice so `/v1/me/invoices` is non-empty for uat-member
 * after pod restart (same pattern as AC-03 seedParticipants / INT-194).
 *
 * consumerId is the Keycloak fixture subject (int-realm.json), because the
 * public controller authorises with `req.user.sub` (IdP sub) today — matching
 * payments / settlement public controllers.
 */
export const UAT_MEMBER_IDP_SUB = "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f";
export const UAT_MANAGER_IDP_SUB = "aca5adb7-0f18-4db8-aa04-6a0ff11b8ec6";
export const UAT_COMMUNITY_ID = "a1000000-0000-4000-8000-000000000001";

export const UAT_INVOICE_ID = "c0a1b2c3-d4e5-4f60-8a70-b8c9d0e1f203";

/** Stable hosted URL — e2e Open PDF only needs a fetchable redirect target. */
export const UAT_HOSTED_INVOICE_URL =
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

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
