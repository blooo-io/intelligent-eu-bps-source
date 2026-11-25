/**
 * MARKET_ADAPTER selection (A8 / Task 4.10 / INT-440).
 * mock = AC-15 suite; ewds = GSY request/reply over the Client Gateway.
 */
import {
  CgwClient,
  RequestReplyClient,
  adapterMode,
  loadCgwConfig,
} from "@intelligent/ewds-client";
import { createMockSuite, type MarketPort } from "@intelligent/mocks";
import { EwdsMarketAdapter } from "./ewds-market.adapter.js";

export const MARKET_PORT = Symbol("MARKET_PORT");

const GSY_REQUEST_FQCN = "gsy.intelligent.requests.pub";
const GSY_RESPONSE_FQCN = "gsy.intelligent.responses.sub";

export function createMarketPort(
  env: NodeJS.ProcessEnv = process.env,
): MarketPort {
  const mode = adapterMode(env, "MARKET_ADAPTER");
  if (mode === "mock") {
    // Default local/CI path — S1 market fixture.
    return createMockSuite("S1").market;
  }

  const cfg = loadCgwConfig(env, env.CGW_CLIENT_ID_PREFIX?.trim() || "trade-intake");
  const cgw = new CgwClient(cfg);
  const topicOwner =
    env.EWDS_TOPIC_OWNER?.trim() || "integration.apps.intelligent.auth.ewc";
  const topicVersion = env.EWDS_TOPIC_VERSION?.trim() || "1.0.0";
  const rr = new RequestReplyClient(cgw, {
    requestFqcn: env.GSY_REQUEST_FQCN?.trim() || GSY_REQUEST_FQCN,
    responseFqcn: env.GSY_RESPONSE_FQCN?.trim() || GSY_RESPONSE_FQCN,
    topicOwner,
    topicVersion,
  });

  const accepted = env.GSY_ACCEPTED_TRADE_STATUSES?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const scaleRaw = env.GSY_VALUE_SCALE?.trim();
  const valueScale = scaleRaw ? Number(scaleRaw) : 1;

  return new EwdsMarketAdapter(rr, {
    acceptedStatuses: accepted?.length ? accepted : undefined,
    valueScale: Number.isFinite(valueScale) && valueScale > 0 ? valueScale : 1,
  });
}
