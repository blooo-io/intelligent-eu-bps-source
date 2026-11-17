import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser } from "@playwright/test";
import {
  assertFullOperationCoverage,
  operationCoverage,
  type OperationCall,
  type OperationCoverage,
} from "../../src/api/operation-coverage";
import { ACCEPTED_STATUSES } from "../../src/api/public-operation-acceptance";
import {
  buildOperationPath,
  operationById,
  PUBLIC_OPERATIONS,
} from "../../src/api/public-operations";
import { loginAs, type UatRole } from "../helpers/auth";
import { sessionAccessToken } from "../helpers/access-token";

/**
 * Authenticated calls of every public operation against the deployed API
 * (INT-394 / REQ-052). Coverage is 100% of the contract operationIds.
 * Writes stay inside the UAT community: the imported participant is offboarded,
 * community settings are written back unchanged, and an invoice status is set
 * to the status it already has.
 */

const FETCH_RATES_JOB = "a1000000-0000-4000-8000-00000000000b";

type Hit = { status: number; text: string; contentType: string };

type Json = Record<string, unknown>;

export async function runPublicApiCoverage(input: {
  browser: Browser;
  baseURL: string;
  apiBaseUrl?: string;
}): Promise<OperationCoverage> {
  const apiBaseUrl = (
    input.apiBaseUrl ?? (await readApiBase(input.baseURL))
  ).replace(/\/$/, "");
  const member = await tokenFor(input.browser, input.baseURL, "member");
  const manager = await tokenFor(input.browser, input.baseURL, "manager");
  const operator = await tokenFor(input.browser, input.baseURL, "operator");
  const calls: OperationCall[] = [];
  const failures: string[] = [];

  async function call(
    operationId: string,
    token: string,
    values: Record<string, string>,
    body?: unknown,
  ): Promise<Hit> {
    const operation = operationById(operationId);
    if (!operation) throw new Error(`Unknown operation ${operationId}`);
    const built = buildOperationPath(operation, values);
    if ("error" in built) throw new Error(`${operationId}: ${built.error}`);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${apiBaseUrl}${built.path}`, {
      method: operation.method,
      headers,
      body: payload,
    });
    const text = await response.text();
    const hit = {
      status: response.status,
      text,
      contentType: response.headers.get("content-type") ?? "",
    };
    calls.push({ operationId, status: hit.status });
    if (!(ACCEPTED_STATUSES[operationId] ?? []).includes(hit.status)) {
      failures.push(`${operationId} ${hit.status} ${problemDetail(text)}`);
    }
    return hit;
  }

  const me = json<Json>(await call("getMe", member, {}));
  const profile = asRecord(me.profile);
  await call("putMyProfile", member, {}, {
    name: String(profile.name ?? ""),
    address: String(profile.address ?? ""),
    email: String(profile.email ?? ""),
  });
  const terms = json<Json>(await call("getCurrentTerms", member, {}));
  await call("acceptTerms", member, {}, {
    termsVersion: String(terms.termsVersion ?? ""),
    selfBillingMandate: false,
  });
  await call("getMyPaymentAccount", member, {});
  await call("createPaymentOnboarding", member, {});
  const paymentMethodId = await stripeTestPaymentMethod();
  await call("attachMyPaymentMethod", member, {}, { paymentMethodId });
  await call("submitPaymentOnboardingRequirements", member, {}, { country: "FR" });

  const balances = asArray(json<unknown>(await call("listMyBalances", member, {})));
  const invoices = asArray(json<unknown>(await call("listMyInvoices", member, {})));
  const invoice = pickInvoice(invoices);
  if (!invoice?.invoiceId) {
    failures.push("getInvoice skipped: the member has no invoice");
  } else {
    await call("getInvoice", member, { id: invoice.invoiceId });
    const document = await call("getInvoiceDocument", member, { id: invoice.invoiceId });
    if (
      document.status === 200 &&
      !document.contentType.includes("application/pdf")
    ) {
      failures.push(`getInvoiceDocument content-type ${document.contentType}`);
    }
    const payable = pickPayable(invoices) ?? invoice;
    await call("payInvoice", member, { id: payable.invoiceId });
  }

  const communityId = String(me.communityId ?? "");
  const participantId = String(me.participantId ?? "");
  const settings = json<Json>(
    await call("getCommunitySettings", manager, { id: communityId }),
  );
  await call("putCommunitySettings", manager, { id: communityId }, {
    currency: settings.currency,
    billingPeriod: settings.billingPeriod,
    threshold: settings.threshold,
    vatRate: settings.vatRate,
    billingMode: settings.billingMode,
  });

  const suffix = Date.now().toString(36);
  const imported = asArray(
    json<unknown>(
      await call("importParticipants", manager, { id: communityId }, {
        participants: [
          {
            email: `e2e-api-${suffix}@example.invalid`,
            marketActorId: `actor-${suffix}`,
            meterId: `meter-${suffix}`,
            role: "consumer",
          },
        ],
      }),
    ),
  );
  const participants = asArray(
    json<unknown>(await call("listParticipants", manager, { id: communityId })),
  );
  const importedId = String(imported[0]?.participantId ?? "");
  if (!importedId) {
    failures.push("patchParticipant skipped: import returned no participantId");
  } else {
    await call("patchParticipant", manager, { id: importedId }, {
      meterId: `meter-${suffix}-b`,
    });
    await call("offboardParticipant", manager, { id: importedId });
  }

  const producerId =
    stringField(
      balances.find((row) => typeof row.producerId === "string"),
      "producerId",
    ) ||
    stringField(
      participants.find(
        (row) => row.role === "producer" && row.status !== "Offboarded",
      ),
      "participantId",
    );
  await call(
    "createEarlySettlement",
    member,
    {},
    { producerId: producerId || participantId },
  );

  if (invoice?.invoiceId && invoice.status) {
    await call("setInvoiceStatus", manager, { id: invoice.invoiceId }, {
      status: invoice.status,
      reason: "API e2e coverage check",
    });
  } else {
    failures.push("setInvoiceStatus skipped: no invoice");
  }

  const run = json<Json>(
    await call("startBillingRun", manager, { id: communityId }, { type: "early" }),
  );
  const runId = String(run.runId ?? "");
  if (!runId) {
    failures.push("getBillingRun skipped: start returned no runId");
  } else {
    await call("getBillingRun", manager, { id: runId });
  }
  await call("getPaymentsOverview", manager, { id: communityId });
  await call("getParticipantHistory", member, { id: participantId });
  const period = currentPeriod();
  await call("getPeriodicSummary", manager, { communityId, period });
  await call("listDiscrepancies", operator, { communityId });
  await call("listIntakeAnomalies", operator, { communityId });
  await call("getKpiExport", operator, { period, communityId });

  const request = json<Json>(
    await call("createDataSubjectRequest", member, {}, { type: "export" }),
  );
  const requestId = String(request.requestId ?? "");
  if (!requestId) {
    failures.push("getDataSubjectRequest skipped: create returned no requestId");
  } else {
    await call("getDataSubjectRequest", member, { id: requestId });
  }

  await call("listJobs", operator, { communityId });
  await call("runJob", operator, { id: FETCH_RATES_JOB });

  const report = operationCoverage(
    PUBLIC_OPERATIONS.map((operation) => operation.operationId),
    calls,
    ACCEPTED_STATUSES,
  );
  writeCoverageReport(report);
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  assertFullOperationCoverage(report);
  return report;
}

function writeCoverageReport(report: OperationCoverage): void {
  const directory = path.join(process.cwd(), "test-results");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "api-e2e-coverage.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function tokenFor(
  browser: Browser,
  baseURL: string,
  role: UatRole,
): Promise<string> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await loginAs(page, role);
    return await sessionAccessToken(page);
  } finally {
    await context.close();
  }
}

async function readApiBase(baseURL: string): Promise<string> {
  const response = await fetch(`${baseURL.replace(/\/$/, "")}/config.json`);
  if (!response.ok) {
    throw new Error(`config.json ${response.status}`);
  }
  const body = (await response.json()) as { apiBaseUrl?: string };
  if (!body.apiBaseUrl) throw new Error("config.json has no apiBaseUrl");
  return body.apiBaseUrl;
}

async function stripeTestPaymentMethod(): Promise<string> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!secret.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY (sk_test_) is required to attach a card");
  }
  const body = new URLSearchParams({ type: "card", "card[token]": "tok_visa" });
  const response = await fetch("https://api.stripe.com/v1/payment_methods", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as { id?: string };
  if (!response.ok || !payload.id?.startsWith("pm_")) {
    throw new Error(`Stripe test payment method failed (${response.status})`);
  }
  return payload.id;
}

function json<T>(hit: Hit): T {
  try {
    return JSON.parse(hit.text) as T;
  } catch {
    return {} as T;
  }
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function asRecord(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function stringField(row: Json | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === "string" ? value : "";
}

function pickInvoice(invoices: Json[]): { invoiceId: string; status: string } | undefined {
  const row = invoices.find((item) => typeof item.invoiceId === "string");
  if (!row || typeof row.invoiceId !== "string") return undefined;
  return {
    invoiceId: row.invoiceId,
    status: typeof row.status === "string" ? row.status : "",
  };
}

function pickPayable(invoices: Json[]): { invoiceId: string } | undefined {
  const fresh = new Set(
    (process.env.E2E_FRESH_INVOICE_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const row = invoices.find(
    (item) =>
      item.status === "Open" &&
      typeof item.invoiceId === "string" &&
      !fresh.has(item.invoiceId),
  );
  if (!row || typeof row.invoiceId !== "string") return undefined;
  return { invoiceId: row.invoiceId };
}

function currentPeriod(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}`;
}

function problemDetail(text: string): string {
  try {
    const body = JSON.parse(text) as { detail?: string; title?: string; message?: string };
    return String(body.detail || body.title || body.message || "").slice(0, 180);
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 120);
  }
}
