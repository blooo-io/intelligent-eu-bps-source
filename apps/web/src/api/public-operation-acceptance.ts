/**
 * Statuses the deployed-stack API e2e accepts per public operation (INT-394).
 * A call counts toward coverage only when its status is listed here.
 * Auth failures (401/403) are never coverage. Statuses absent from the
 * OpenAPI operation are listed in UNDOCUMENTED_ACCEPTED_STATUSES.
 */

export const ACCEPTED_STATUSES: Readonly<Record<string, readonly number[]>> = {
  getMe: [200],
  putMyProfile: [200],
  getCurrentTerms: [200],
  acceptTerms: [201],
  getMyPaymentAccount: [200],
  createPaymentOnboarding: [200],
  createIdentityVerification: [200],
  getMyKycStatus: [200],
  attachMyPaymentMethod: [200],
  // Deprecated KYC submit. A consumer is rejected with the documented 400.
  submitPaymentOnboardingRequirements: [200, 400],
  listMyPayouts: [200],
  requestWithdrawal: [201, 409],
  listMyBalances: [200],
  listMyInvoices: [200],
  listMyStatements: [200],
  getInvoice: [200],
  getInvoiceDocument: [200],
  sendInvoiceReminder: [202, 409],
  // 400: live "not payable" when the member has no Open invoice (not in the contract).
  payInvoice: [201, 400],
  setInvoiceStatus: [200],
  getCommunitySettings: [200],
  putCommunitySettings: [200],
  importParticipants: [201],
  listParticipants: [200],
  patchParticipant: [200],
  offboardParticipant: [202],
  startBillingRun: [202],
  getBillingRun: [200],
  getPaymentsOverview: [200],
  // 403 is documented on the contract but never counts as e2e coverage.
  getPayoutsOverview: [200],
  getParticipantHistory: [200],
  getPeriodicSummary: [200],
  getPaymentMethodReport: [200],
  listDiscrepancies: [200],
  listIntakeAnomalies: [200],
  getKpiExport: [200, 404],
  createDataSubjectRequest: [201],
  getDataSubjectRequest: [200],
  getDataSubjectExport: [200, 410],
  listJobs: [200],
  runJob: [202],
};

/** Accepted statuses that public.v1.yaml does not document for that operation. */
export const UNDOCUMENTED_ACCEPTED_STATUSES: Readonly<
  Record<string, readonly number[]>
> = {
  payInvoice: [400],
};
