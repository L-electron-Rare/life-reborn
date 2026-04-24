import { randomUUID } from "node:crypto";

export type CoreHealth = {
  status: string;
  providers?: string[];
  backends?: string[];
  cache_available?: boolean;
  router_status?: Record<string, boolean>;
  issues?: string[];
};

export function getCoreUrl(): string {
  return process.env.CORE_URL || "http://localhost:8000";
}

export function buildCoreUrl(path: string): string {
  return new URL(path, getCoreUrl()).toString();
}

export function buildForwardHeaders(sourceRequest: Request, initHeaders?: HeadersInit): {
  headers: Headers;
  correlationId: string;
} {
  const headers = new Headers(initHeaders);
  const incoming = sourceRequest.headers;

  const correlationId =
    incoming.get("x-correlation-id") ??
    incoming.get("x-request-id") ??
    randomUUID();

  headers.set("x-correlation-id", correlationId);
  headers.set("x-request-id", correlationId);
  headers.set("x-forwarded-method", sourceRequest.method);

  const traceparent = incoming.get("traceparent");
  const tracestate = incoming.get("tracestate");

  if (traceparent && !headers.has("traceparent")) {
    headers.set("traceparent", traceparent);
  }
  if (tracestate && !headers.has("tracestate")) {
    headers.set("tracestate", tracestate);
  }

  return { headers, correlationId };
}

export async function fetchCore(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildCoreUrl(path), init);
}

export async function fetchCoreHealth(): Promise<CoreHealth> {
  const response = await fetchCore("/health");
  if (!response.ok) {
    throw new Error(`Core health request failed with status ${response.status}`);
  }
  return (await response.json()) as CoreHealth;
}
