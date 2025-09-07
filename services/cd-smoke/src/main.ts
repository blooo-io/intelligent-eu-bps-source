import { pathToFileURL } from "node:url";
import { listen, resolvePort } from "./server.js";

/** True when this file is the process entry point (container CMD / `node dist/main.js`). */
export function isDirectRun(metaUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  return metaUrl === pathToFileURL(argv1).href;
}

// Entry point for the container CMD (and local `npm start`).
export function main(): void {
  const port = resolvePort();
  listen(port);
  // Identifiers only — no personal data (NFR-015).
  console.log(JSON.stringify({ msg: "cd-smoke listening", port }));
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main();
}
