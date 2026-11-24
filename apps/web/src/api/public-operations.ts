/**
 * Every public operation (contracts/openapi/public.v1.yaml).
 * The reference UI calls these with the session token (REQ-052).
 * Regenerate from the contract when an operation is added; the spec
 * locks the operationId set.
 */
export type PublicParam = {
  in: "path" | "query";
  name: string;
  required: boolean;
};

export type PublicOperation = {
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path under the gateway `/v1` prefix. */
  path: string;
  tag: string;
  summary: string;
  params: PublicParam[];
  /** Example JSON body, or null when the operation has none. */
  body: unknown;
};

export const PUBLIC_OPERATIONS: readonly PublicOperation[] = [
  {
    "operationId": "getMe",
    "method": "GET",
    "path": "/me",
    "tag": "Profile",
    "summary": "Caller profile, roles, community and readiness",
    "params": [],
    "body": null
  },
  {
    "operationId": "putMyProfile",
    "method": "PUT",
    "path": "/me/profile",
    "tag": "Profile",
    "summary": "Update the caller's billing profile",
    "params": [],
    "body": {
      "name": "",
      "address": "",
      "email": ""
    }
  },
  {
    "operationId": "getCurrentTerms",
    "method": "GET",
    "path": "/terms/current",
    "tag": "Terms",
    "summary": "Current terms",
    "params": [],
    "body": null
  },
  {
    "operationId": "acceptTerms",
    "method": "POST",
    "path": "/me/terms-acceptance",
    "tag": "Terms",
    "summary": "Accept the current terms",
    "params": [],
    "body": {
      "termsVersion": "",
      "selfBillingMandate": false,
      "acceptedAt": ""
    }
  },
  {
    "operationId": "getMyPaymentAccount",
    "method": "GET",
    "path": "/me/payment-account",
    "tag": "Payments",
    "summary": "Read the caller's payment account",
    "params": [],
    "body": null
  },
  {
    "operationId": "createPaymentOnboarding",
    "method": "POST",
    "path": "/me/payment-account/onboarding",
    "tag": "Payments",
    "summary": "Start payment-account onboarding",
    "params": [],
    "body": null
  },
  {
    "operationId": "attachMyPaymentMethod",
    "method": "POST",
    "path": "/me/payment-account/payment-method",
    "tag": "Payments",
    "summary": "Attach consumer payment method after SetupIntent",
    "params": [],
    "body": {
      "paymentMethodId": ""
    }
  },
  {
    "operationId": "submitPaymentOnboardingRequirements",
    "method": "POST",
    "path": "/me/payment-account/onboarding/requirements",
    "tag": "Payments",
    "summary": "Submit Connect KYC requirements",
    "params": [],
    "body": {
      "accountToken": "",
      "country": "",
      "businessType": "individual",
      "businessProfileUrl": "",
      "businessProfileMcc": "",
      "representative": {
        "firstName": "",
        "lastName": "",
        "email": "",
        "phone": "",
        "dob": {
          "day": 0,
          "month": 0,
          "year": 0
        },
        "address": {
          "line1": "",
          "city": "",
          "postalCode": "",
          "country": ""
        }
      },
      "identityDocumentFront": "",
      "identityDocumentAdditionalFront": "",
      "externalAccount": {
        "country": "",
        "currency": "",
        "accountNumber": "",
        "routingNumber": ""
      },
      "tosAccepted": false
    }
  },
  {
    "operationId": "listMyBalances",
    "method": "GET",
    "path": "/me/balances",
    "tag": "Balances",
    "summary": "Unbilled balances per counterpart",
    "params": [],
    "body": null
  },
  {
    "operationId": "listMyInvoices",
    "method": "GET",
    "path": "/me/invoices",
    "tag": "Invoices",
    "summary": "Invoices of the caller",
    "params": [],
    "body": null
  },
  {
    "operationId": "getInvoice",
    "method": "GET",
    "path": "/invoices/{id}",
    "tag": "Invoices",
    "summary": "Invoice detail",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "getInvoiceDocument",
    "method": "GET",
    "path": "/invoices/{id}/document",
    "tag": "Invoices",
    "summary": "Invoice PDF",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "payInvoice",
    "method": "POST",
    "path": "/invoices/{id}/payments",
    "tag": "Payments",
    "summary": "Pay an invoice",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "setInvoiceStatus",
    "method": "POST",
    "path": "/invoices/{id}/status",
    "tag": "Invoices",
    "summary": "Set an invoice status manually",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": {
      "status": "Draft",
      "reason": ""
    }
  },
  {
    "operationId": "getCommunitySettings",
    "method": "GET",
    "path": "/communities/{id}/settings",
    "tag": "Communities",
    "summary": "Read community billing settings",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "putCommunitySettings",
    "method": "PUT",
    "path": "/communities/{id}/settings",
    "tag": "Communities",
    "summary": "Update community billing settings",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": {
      "currency": "",
      "billingPeriod": "",
      "threshold": "",
      "vatRate": "",
      "billingMode": "live"
    }
  },
  {
    "operationId": "importParticipants",
    "method": "POST",
    "path": "/communities/{id}/participants:import",
    "tag": "Participants",
    "summary": "Import participants",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": {
      "participants": [
        {
          "email": "",
          "marketActorId": "",
          "meterId": "",
          "role": "consumer",
          "existingIdpSubject": ""
        }
      ]
    }
  },
  {
    "operationId": "listParticipants",
    "method": "GET",
    "path": "/communities/{id}/participants",
    "tag": "Participants",
    "summary": "List participants of a community",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "patchParticipant",
    "method": "PATCH",
    "path": "/participants/{id}",
    "tag": "Participants",
    "summary": "Update trade-attribution identifiers",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": {
      "marketActorId": "",
      "meterId": "",
      "role": "consumer"
    }
  },
  {
    "operationId": "offboardParticipant",
    "method": "POST",
    "path": "/participants/{id}:offboard",
    "tag": "Participants",
    "summary": "Offboard a participant",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "startBillingRun",
    "method": "POST",
    "path": "/communities/{id}/billing-runs",
    "tag": "Billing",
    "summary": "Start a billing run",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": {
      "type": "periodic",
      "period": ""
    }
  },
  {
    "operationId": "getBillingRun",
    "method": "GET",
    "path": "/billing-runs/{id}",
    "tag": "Billing",
    "summary": "Read a billing run",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "getPaymentsOverview",
    "method": "GET",
    "path": "/communities/{id}/payments-overview",
    "tag": "Reports",
    "summary": "Payment overview of a community",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "getParticipantHistory",
    "method": "GET",
    "path": "/participants/{id}/history",
    "tag": "Reports",
    "summary": "Member history",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "getPeriodicSummary",
    "method": "GET",
    "path": "/reports/summary",
    "tag": "Reports",
    "summary": "Periodic summary",
    "params": [
      {
        "in": "query",
        "name": "communityId",
        "required": true
      },
      {
        "in": "query",
        "name": "period",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "listDiscrepancies",
    "method": "GET",
    "path": "/reconciliation/discrepancies",
    "tag": "Operations",
    "summary": "Reconciliation discrepancies",
    "params": [
      {
        "in": "query",
        "name": "communityId",
        "required": false
      }
    ],
    "body": null
  },
  {
    "operationId": "listIntakeAnomalies",
    "method": "GET",
    "path": "/intake/anomalies",
    "tag": "Operations",
    "summary": "Intake anomalies",
    "params": [
      {
        "in": "query",
        "name": "communityId",
        "required": false
      }
    ],
    "body": null
  },
  {
    "operationId": "getKpiExport",
    "method": "GET",
    "path": "/kpi-exports/{period}",
    "tag": "Reports",
    "summary": "KPI export for a period",
    "params": [
      {
        "in": "path",
        "name": "period",
        "required": true
      },
      {
        "in": "query",
        "name": "communityId",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "createDataSubjectRequest",
    "method": "POST",
    "path": "/data-subject-requests",
    "tag": "Privacy",
    "summary": "Request an export or an erasure",
    "params": [],
    "body": {
      "type": "export",
      "participantId": ""
    }
  },
  {
    "operationId": "getDataSubjectRequest",
    "method": "GET",
    "path": "/data-subject-requests/{id}",
    "tag": "Privacy",
    "summary": "Read a data-subject request",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  },
  {
    "operationId": "listJobs",
    "method": "GET",
    "path": "/jobs",
    "tag": "Operations",
    "summary": "List scheduled jobs",
    "params": [
      {
        "in": "query",
        "name": "communityId",
        "required": false
      }
    ],
    "body": null
  },
  {
    "operationId": "runJob",
    "method": "POST",
    "path": "/jobs/{id}:run",
    "tag": "Operations",
    "summary": "Run a job now",
    "params": [
      {
        "in": "path",
        "name": "id",
        "required": true
      }
    ],
    "body": null
  }
];

export function operationById(operationId: string): PublicOperation | undefined {
  return PUBLIC_OPERATIONS.find((op) => op.operationId === operationId);
}

/** Build `/v1/...` with path params substituted and query params appended. */
export function buildOperationPath(
  operation: PublicOperation,
  values: Readonly<Record<string, string>>,
): { path: string } | { error: string } {
  let path = operation.path;
  for (const param of operation.params) {
    if (param.in !== "path") continue;
    const raw = (values[param.name] ?? "").trim();
    if (!raw) return { error: `Missing ${param.name}` };
    path = path.replace(`{${param.name}}`, encodeURIComponent(raw));
  }
  const query = new URLSearchParams();
  for (const param of operation.params) {
    if (param.in !== "query") continue;
    const raw = (values[param.name] ?? "").trim();
    if (!raw) {
      if (param.required) return { error: `Missing ${param.name}` };
      continue;
    }
    query.set(param.name, raw);
  }
  const qs = query.toString();
  return { path: `/v1${path}${qs ? `?${qs}` : ""}` };
}
