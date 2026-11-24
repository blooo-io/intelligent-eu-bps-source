import { Logger } from "@nestjs/common";
import {
  CgwClient,
  EwdsTopicConsumer,
  InMemoryInboundStore,
  loadCgwConfig,
  type InboundMessageStore,
} from "@intelligent/ewds-client";
import { formatUnitPrice, tariffCovers } from "./tariff-window.js";
import type { Tariff, TariffPort } from "./tariff.port.js";

/**
 * REQ-004 — EWDS tariff topic body (ontology Tariff).
 * Numbers are converted to UnitPrice strings on ingest.
 */
export type EwdsTariffRecord = {
  tariffId: string;
  communityId: string;
  currency: string;
  validFrom: string;
  validUntil?: string | null;
  gridFeePerKWh: number;
  levyPerKWh: number;
  taxPerKWh: number;
};

export type TariffTopicConsumer = {
  pull(
    max?: number,
  ): Promise<Array<{ messageId: string; sender: string; body: EwdsTariffRecord }>>;
  done(messageId: string, ok: boolean): Promise<void>;
};

type CacheRow = {
  communityId: string;
  validFrom: string;
  validUntil: string | null;
  body: Tariff;
};

/**
 * REQ-004 / REQ-053 / A10.2 — EWDS transport for `TariffPort`.
 *
 * Consumes topic `EWDS_TARIFF_TOPIC` (default `tariff`) into a local cache
 * keyed on `(community_id, valid_from)`. `getTariff` reads the cache only
 * (no live CGW call during a billing run).
 */
export class EwdsTariffAdapter implements TariffPort {
  private readonly logger = new Logger(EwdsTariffAdapter.name);
  /** Cache key: `${communityId}\0${validFrom}` */
  private readonly cache = new Map<string, CacheRow>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly consumer: TariffTopicConsumer,
    private readonly pollMs = 5_000,
    startPolling = true,
  ) {
    if (startPolling) {
      this.timer = setInterval(() => {
        void this.ingest();
      }, this.pollMs);
    }
  }

  /** Drain CGW into the local tariff_cache (upsert on community_id, valid_from). */
  async ingest(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let n = 0;
    try {
      const pulled = await this.consumer.pull();
      for (const msg of pulled) {
        const tariff = toTariff(msg.body);
        if (!tariff) {
          await this.consumer.done(msg.messageId, false);
          continue;
        }
        const key = cacheKey(tariff.communityId, tariff.validFrom);
        this.cache.set(key, {
          communityId: tariff.communityId,
          validFrom: tariff.validFrom,
          validUntil: tariff.validUntil,
          body: tariff,
        });
        await this.consumer.done(msg.messageId, true);
        n += 1;
        this.logger.debug(
          `tariff upsert communityId=${tariff.communityId} validFrom=${tariff.validFrom}`,
        );
      }
    } finally {
      this.ticking = false;
    }
    return n;
  }

  /**
   * REQ-004 — read cache only (no live call). Returns null when none covers `at`
   * (caller prints "grid fees billed by supplier/DSO").
   */
  async getTariff(communityId: string, at: string): Promise<Tariff | null> {
    let best: Tariff | null = null;
    for (const row of this.cache.values()) {
      if (row.communityId !== communityId) continue;
      if (!tariffCovers(row.body, at)) continue;
      if (!best || row.validFrom > best.validFrom) {
        best = row.body;
      }
    }
    return best ? { ...best } : null;
  }

  /** Test helper — seed cache without CGW. */
  upsert(record: EwdsTariffRecord): void {
    const tariff = toTariff(record);
    if (!tariff) return;
    this.cache.set(cacheKey(tariff.communityId, tariff.validFrom), {
      communityId: tariff.communityId,
      validFrom: tariff.validFrom,
      validUntil: tariff.validUntil,
      body: tariff,
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function isEwdsTariffRecord(x: unknown): x is EwdsTariffRecord {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.tariffId === "string" &&
    typeof o.communityId === "string" &&
    typeof o.currency === "string" &&
    typeof o.validFrom === "string" &&
    typeof o.gridFeePerKWh === "number" &&
    typeof o.levyPerKWh === "number" &&
    typeof o.taxPerKWh === "number"
  );
}

function toTariff(body: EwdsTariffRecord): Tariff | null {
  if (body.currency !== "EUR" && body.currency !== "CHF") return null;
  return {
    tariffId: body.tariffId,
    communityId: body.communityId,
    currency: body.currency,
    validFrom: body.validFrom,
    validUntil: body.validUntil ?? null,
    gridFeePerKWh: formatUnitPrice(body.gridFeePerKWh),
    levyPerKWh: formatUnitPrice(body.levyPerKWh),
    taxPerKWh: formatUnitPrice(body.taxPerKWh),
    source: "ewds",
  };
}

function cacheKey(communityId: string, validFrom: string): string {
  return `${communityId}\0${validFrom}`;
}

/**
 * Build a live EWDS TariffPort from env (REQ-004 / NFR-017).
 * Topic default `tariff`.
 */
export function createEwdsTariffAdapter(
  env: NodeJS.ProcessEnv = process.env,
  deps?: {
    consumer?: TariffTopicConsumer;
    store?: InboundMessageStore;
    cgw?: CgwClient;
    startPolling?: boolean;
  },
): EwdsTariffAdapter {
  if (deps?.consumer) {
    return new EwdsTariffAdapter(
      deps.consumer,
      5_000,
      deps.startPolling ?? false,
    );
  }

  const cgw =
    deps?.cgw ?? new CgwClient(loadCgwConfig(env, "ac-13-reference-data"));
  const store = deps?.store ?? new InMemoryInboundStore();
  const consumer = new EwdsTopicConsumer<EwdsTariffRecord>(
    cgw,
    store,
    {
      fqcn: env.EWDS_TARIFF_FQCN?.trim() || "blooo.intelligent.tariff.sub",
      topicName: env.EWDS_TARIFF_TOPIC?.trim() || "tariff",
      topicOwner:
        env.EWDS_TOPIC_OWNER?.trim() ||
        "integration.apps.intelligent.auth.ewc",
    },
    isEwdsTariffRecord,
  );
  return new EwdsTariffAdapter(
    consumer,
    Number(env.EWDS_TARIFF_POLL_MS ?? 5_000) || 5_000,
    deps?.startPolling ?? true,
  );
}
