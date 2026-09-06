import { asString } from "@intelligent/module-template";
import { NativeConnection } from "@temporalio/worker";

/** INT-227 — retry Temporal connect so boot races do not CrashLoop the worker. */
export async function connectWithRetry(
  address: string,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    connect?: (opts: { address: string }) => Promise<NativeConnection>;
  } = {},
): Promise<NativeConnection> {
  const attempts = options.attempts ?? 12;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const connect =
    options.connect ??
    ((opts: { address: string }) => NativeConnection.connect(opts));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await connect({ address });
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.error(
        JSON.stringify({
          msg: "temporal_connect_retry",
          attempt,
          attempts,
          delayMs: delay,
          address,
          error: err instanceof Error ? err.message : asString(err),
        }),
      );
      await sleep(delay);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(asString(lastError, "temporal connect failed"));
}
