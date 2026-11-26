/**
 * INT-453 — canonical catalogue of EWDS project-path scenarios (07-scenario-flows S1–S14).
 * Every id must be covered by at least one `markCovered("Sn")` call in the e2e suite.
 */
export const PROJECT_PATH_SCENARIOS = [
  {
    id: "S1",
    title: "Onboard participants (Actor create)",
    req: ["REQ-008"],
    uat: ["UAT-008"],
    ontology: ["int:Actor"],
  },
  {
    id: "S2",
    title: "Update administrative profile (Actor republish + 409)",
    req: ["REQ-009"],
    uat: ["UAT-009"],
    ontology: ["int:Actor"],
  },
  {
    id: "S3",
    title: "Accept T&C / self-billing → billingKycStatus",
    req: ["REQ-050"],
    uat: ["UAT-062"],
    ontology: ["int:UserAccount"],
  },
  {
    id: "S4",
    title: "KYC / payment-method setup (PspHandoff)",
    req: ["REQ-051", "REQ-040"],
    uat: ["UAT-063", "UAT-051"],
    ontology: ["int:UserAccount"],
  },
  {
    id: "S5",
    title: "Readiness to Ready (gates)",
    req: ["REQ-045"],
    uat: ["UAT-056"],
    ontology: ["int:Actor", "int:UserAccount"],
  },
  {
    id: "S6",
    title: "Settled trade intake",
    req: ["REQ-001", "REQ-058"],
    uat: ["UAT-001", "UAT-075"],
    ontology: ["int:EnergyTrade"],
  },
  {
    id: "S7",
    title: "Periodic billing run (statement + invoice publish)",
    req: ["REQ-054", "REQ-059", "REQ-048"],
    uat: ["UAT-071", "UAT-076", "UAT-070"],
    ontology: ["int:Billing", "int:Invoice"],
  },
  {
    id: "S8",
    title: "Pay an invoice",
    req: ["REQ-014"],
    uat: ["UAT-014"],
    ontology: ["int:Payment", "int:Invoice"],
  },
  {
    id: "S9",
    title: "Payment failure & reminder",
    req: ["REQ-016", "REQ-061"],
    uat: ["UAT-016", "UAT-078"],
    ontology: ["int:Payment", "int:Invoice"],
  },
  {
    id: "S10",
    title: "Payout / withdrawal",
    req: ["REQ-015", "REQ-060"],
    uat: ["UAT-015", "UAT-077"],
    ontology: ["int:Payout"],
  },
  {
    id: "S11",
    title: "Manager invoice status change",
    req: ["REQ-044"],
    uat: ["UAT-055"],
    ontology: ["int:Invoice"],
  },
  {
    id: "S12",
    title: "Data-subject erasure",
    req: ["REQ-013"],
    uat: ["UAT-013"],
    ontology: ["int:Actor", "int:UserAccount", "int:Invoice"],
  },
  {
    id: "S13",
    title: "Command channel authorization layers",
    req: ["REQ-052"],
    uat: ["UAT-064"],
    ontology: [
      "int:Actor",
      "int:UserAccount",
      "int:Invoice",
      "int:Payment",
      "int:Payout",
      "int:Billing",
      "int:Community",
    ],
  },
  {
    id: "S14",
    title: "Publication purge (≤ 7 days)",
    req: ["REQ-053"],
    uat: ["UAT-069"],
    ontology: [
      "int:Billing",
      "int:Invoice",
      "int:Payment",
      "int:Payout",
      "int:UserAccount",
    ],
  },
] as const;

export type ProjectPathScenarioId =
  (typeof PROJECT_PATH_SCENARIOS)[number]["id"];

/** Shared stable ids matching docs/architecture/ewds-topics examples. */
export const IDS = {
  community: "c0ffee00-1234-4abc-8def-0123456789ab",
  consumer: "11111111-2222-4333-8444-555555555555",
  producer: "66666666-7777-4888-9999-aaaaaaaaaaaa",
  invoice: "3f1c2a9e-8b7d-4c21-9a0e-5d6f7a8b9c01",
  settlement: "a2b4c6d8-1e3f-4a5b-8c7d-9e0f1a2b3c4d",
  issuerStatement: "d3e5f7a9-2b4c-4d6e-8f0a-1b2c3d4e5f6a",
  payment: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  payout: "b1b2b3b4-b5b6-4788-9999-cccccccccccc",
  allowedDid: "did:ethr:0xUI",
  returnPrefix: "https://ui.intelligent-project.eu/",
} as const;
