import { metrics, trace } from "@opentelemetry/api";

/**
 * Thin OpenTelemetry accessors for modules (TD-4 / TD-10).
 * The SDK is wired at process start by each service; this package only uses the API.
 */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

export function getMeter(name: string) {
  return metrics.getMeter(name);
}

export function startModuleSpan(moduleName: string, spanName: string) {
  return getTracer(moduleName).startSpan(spanName);
}
