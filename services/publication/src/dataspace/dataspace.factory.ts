/**
 * DATASPACE_ADAPTER selection (A8 / Task 4.11 / INT-440).
 */
import {
  CgwClient,
  adapterMode,
  loadCgwConfig,
} from "@intelligent/ewds-client";
import type { DataSpacePort } from "@intelligent/mocks";
import { MockDataspaceAdapter } from "./mock-dataspace.adapter.js";
import { EwdsDataspaceAdapter } from "./ewds-dataspace.adapter.js";

export const DATASPACE_PORT = Symbol("DATASPACE_PORT");

const DEFAULT_FQCN = "blooo.intelligent.billing.pub";
const DEFAULT_OWNER = "integration.apps.intelligent.auth.ewc";

export function createDataspacePort(
  env: NodeJS.ProcessEnv = process.env,
): DataSpacePort {
  const mode = adapterMode(env, "DATASPACE_ADAPTER");
  if (mode === "mock") {
    return new MockDataspaceAdapter();
  }
  const cfg = loadCgwConfig(
    env,
    env.CGW_CLIENT_ID_PREFIX?.trim() || "publication",
  );
  const cgw = new CgwClient(cfg);
  return new EwdsDataspaceAdapter(cgw, {
    fqcn: env.EWDS_PUBLISH_FQCN?.trim() || DEFAULT_FQCN,
    topicOwner: env.EWDS_TOPIC_OWNER?.trim() || DEFAULT_OWNER,
    topicVersion: env.EWDS_TOPIC_VERSION?.trim() || "1.0.0",
  });
}
