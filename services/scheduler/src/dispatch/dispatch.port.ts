import type { JobDefinition } from "../domain/types.js";

export const DISPATCH_PORT = Symbol("DISPATCH_PORT");

export type DispatchCommand = {
  job: JobDefinition;
  communityId?: string;
  body: Record<string, unknown>;
};

export type DispatchResult =
  | { ok: true }
  | { ok: false; error: string };

export interface DispatchPort {
  dispatch(command: DispatchCommand): Promise<DispatchResult>;
  recorded(): readonly DispatchCommand[];
}
