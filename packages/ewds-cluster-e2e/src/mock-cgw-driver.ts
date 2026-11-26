/**
 * INT-454 — HTTP driver for the cluster Mock CGW.
 *
 * Speaks `/health`, CGW identity, `/test/v1/inject`, `/test/v1/queue`.
 * Evidence label: `run_path: mock` (transport stand-in; adapters stay ewds).
 */
import {
  MOCK_CGW_GATEWAY_DID,
  commandChannelScenarios,
  type CommandScenario,
} from "@intelligent/ewds-client";
import { ewdsActorFixtures } from "@intelligent/mocks";

export const CLUSTER_COMMAND_FQCN =
  "blooo.intelligent.billing.commands.sub";
export const CLUSTER_ACTOR_FQCN = "blooo.intelligent.actors.sub";
export const CLUSTER_TOPIC_OWNER =
  "integration.apps.intelligent.auth.ewc";

export type InjectResult = {
  messageId: string;
  validationErrors?: string[];
};

export type MockCgwDriver = {
  baseUrl: string;
  apiKey: string;
  health: () => Promise<{ status: string }>;
  identity: () => Promise<{ did: string; balance: string }>;
  inject: (body: {
    fqcn: string;
    topicName: string;
    topicOwner?: string;
    topicVersion?: string;
    transactionId?: string;
    payload: unknown;
    sender?: string;
  }) => Promise<InjectResult>;
  queue: () => Promise<
    Array<{
      id: string;
      fqcn: string;
      topicName: string;
      acked: boolean;
      sender: string;
      transactionId: string | null;
    }>
  >;
};

function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
  };
}

/** Build a driver against a running Mock CGW (cluster port-forward or loopback). */
export function createMockCgwDriver(
  baseUrl: string,
  apiKey = "cluster-e2e-key",
): MockCgwDriver {
  const root = baseUrl.replace(/\/$/, "");
  return {
    baseUrl: root,
    apiKey,
    async health() {
      const res = await fetch(`${root}/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      return (await res.json()) as { status: string };
    },
    async identity() {
      const res = await fetch(`${root}/api/v2/identity`, {
        headers: headers(apiKey),
      });
      if (!res.ok) throw new Error(`identity ${res.status}`);
      const body = (await res.json()) as {
        balance: string;
        enrolment: { did: string };
      };
      return { did: body.enrolment.did, balance: body.balance };
    },
    async inject(body) {
      const res = await fetch(`${root}/test/v1/inject`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as InjectResult & {
        errors?: string[];
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          `inject ${res.status}: ${json.message ?? JSON.stringify(json)}`,
        );
      }
      return json;
    },
    async queue() {
      const res = await fetch(`${root}/test/v1/queue`, {
        headers: headers(apiKey),
      });
      if (!res.ok) throw new Error(`queue ${res.status}`);
      return (await res.json()) as Awaited<ReturnType<MockCgwDriver["queue"]>>;
    },
  };
}

/** S13 — all 8 command ops as inject payloads (production FQCNs). */
export function clusterCommandInjects(
  scenarios: CommandScenario[] = commandChannelScenarios(),
): Array<{
  scenario: CommandScenario;
  body: Parameters<MockCgwDriver["inject"]>[0];
}> {
  return scenarios.map((scenario) => ({
    scenario,
    body: {
      fqcn: CLUSTER_COMMAND_FQCN,
      topicName: "billingCommandRequest",
      topicOwner: CLUSTER_TOPIC_OWNER,
      topicVersion: "1.0.0",
      transactionId: scenario.request.requestId,
      payload: scenario.request,
      sender: MOCK_CGW_GATEWAY_DID,
    },
  }));
}

/** S1 — Actor records on the actors.sub FQCN. */
export function clusterActorInjects(communityId?: string): Array<{
  actorId: string;
  body: Parameters<MockCgwDriver["inject"]>[0];
}> {
  const actors = ewdsActorFixtures(communityId);
  return actors.map((actor) => ({
    actorId: actor.actorId,
    body: {
      fqcn: CLUSTER_ACTOR_FQCN,
      topicName: "actor",
      topicOwner: CLUSTER_TOPIC_OWNER,
      topicVersion: "1.0.0",
      payload: actor,
      sender: MOCK_CGW_GATEWAY_DID,
    },
  }));
}

export const RUN_PATH_MOCK = "mock" as const;
