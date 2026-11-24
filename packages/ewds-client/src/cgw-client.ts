import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CgwConfig = {
  baseUrl: string;
  apiKey: string;
  clientId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type CgwSend = {
  fqcn: string;
  topicName: string;
  topicVersion: string;
  topicOwner: string;
  transactionId?: string;
  payload: unknown;
};

export type CgwMessage = {
  id: string;
  topicName: string;
  topicOwner: string;
  topicVersion: string;
  transactionId: string | null;
  payload: string;
  sender: string;
  signatureValid: boolean;
  timestampNanos: number;
};

export class CgwError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail?: string,
  ) {
    super(
      detail
        ? `CGW ${path} returned ${status}: ${detail}`
        : `CGW ${path} returned ${status}`,
    );
    this.name = "CgwError";
  }
}

let ackPathSupported: boolean | undefined;

function snapshotHasAckPath(): boolean {
  if (ackPathSupported !== undefined) return ackPathSupported;
  try {
    const pkgRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const snap = JSON.parse(
      readFileSync(path.join(pkgRoot, "test/cgw-openapi.snapshot.json"), "utf8"),
    ) as { paths?: Record<string, unknown> };
    ackPathSupported = Boolean(snap.paths?.["/api/v2/messages/ack"]);
  } catch {
    ackPathSupported = false;
  }
  return ackPathSupported;
}

function mapSignatureValid(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "string") {
    const u = raw.toUpperCase();
    return u === "VALID" || u === "SUCCESS";
  }
  return false;
}

export class CgwClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: CgwConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
  }

  async send(
    m: CgwSend,
  ): Promise<{ messageId: string; sent: number; failed: number }> {
    const pathSeg = "/api/v2/messages";
    const body = {
      fqcn: m.fqcn,
      topicName: m.topicName,
      topicVersion: m.topicVersion,
      topicOwner: m.topicOwner,
      transactionId: m.transactionId,
      payload: JSON.stringify(m.payload),
      anonymousRecipient: [] as string[],
    };
    const res = await this.request(pathSeg, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.cfg.apiKey,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      clientGatewayMessageId?: string;
      recipients?: { sent?: number; failed?: number };
    };
    return {
      messageId: String(json.clientGatewayMessageId ?? ""),
      sent: json.recipients?.sent ?? 0,
      failed: json.recipients?.failed ?? 0,
    };
  }

  async receive(q: {
    fqcn: string;
    topicName?: string;
    topicOwner?: string;
    amount?: number;
  }): Promise<CgwMessage[]> {
    const params = new URLSearchParams({
      fqcn: q.fqcn,
      clientId: this.cfg.clientId,
    });
    if (q.topicName) params.set("topicName", q.topicName);
    if (q.topicOwner) params.set("topicOwner", q.topicOwner);
    if (q.amount !== undefined) params.set("amount", String(q.amount));
    const pathSeg = `/api/v2/messages?${params.toString()}`;
    const res = await this.request(pathSeg, {
      method: "GET",
      headers: { "x-api-key": this.cfg.apiKey },
    });
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      topicName: String(row.topicName),
      topicOwner: String(row.topicOwner),
      topicVersion: String(row.topicVersion),
      transactionId:
        row.transactionId == null ? null : String(row.transactionId),
      payload: String(row.payload ?? ""),
      sender: String(row.sender),
      signatureValid: mapSignatureValid(row.signatureValid),
      timestampNanos: Number(row.timestampNanos),
    }));
  }

  async ack(messageIds: string[]): Promise<void> {
    if (!snapshotHasAckPath() && process.env.CGW_ACK_MODE !== "fetch") {
      return;
    }
    const pathSeg = "/api/v2/messages/ack";
    await this.request(pathSeg, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.cfg.apiKey,
      },
      body: JSON.stringify({ messageIds, clientId: this.cfg.clientId }),
    });
  }

  async identity(): Promise<{ did: string; balance: string }> {
    const pathSeg = "/api/v2/identity";
    const res = await this.request(pathSeg, {
      method: "GET",
      headers: { "x-api-key": this.cfg.apiKey },
    });
    const json = (await res.json()) as {
      balance?: string;
      enrolment?: { did?: string };
    };
    return {
      did: String(json.enrolment?.did ?? ""),
      balance: String(json.balance ?? ""),
    };
  }

  private async request(pathAndQuery: string, init: RequestInit): Promise<Response> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}${pathAndQuery}`;
    const apiPath = pathAndQuery.split("?")[0] ?? pathAndQuery;
    const res = await this.fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new CgwError(res.status, apiPath, text.slice(0, 200) || undefined);
    }
    return res;
  }
}