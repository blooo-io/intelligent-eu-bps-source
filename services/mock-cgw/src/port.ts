/** INT-454 — listen port helpers (kept out of main for coverage). */
import { pathToFileURL } from "node:url";

export function resolvePort(envPort = process.env.PORT): number {
  const parsed = Number(envPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8080;
}

export function isDirectRun(
  metaUrl: string,
  argv1: string | undefined,
): boolean {
  if (argv1 === undefined) return false;
  return metaUrl === pathToFileURL(argv1).href;
}
