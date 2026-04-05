import { describe, expect, it } from "vitest";
import { buildForwardHeaders } from "./core.js";

describe("buildForwardHeaders", () => {
  it("reuses incoming correlation and trace headers", () => {
    const request = new Request("http://localhost/api/chat", {
      headers: {
        "x-correlation-id": "corr-123",
        traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
        tracestate: "vendor=test",
      },
    });

    const { headers, correlationId } = buildForwardHeaders(request, {
      "Content-Type": "application/json",
    });

    expect(correlationId).toBe("corr-123");
    expect(headers.get("x-correlation-id")).toBe("corr-123");
    expect(headers.get("x-request-id")).toBe("corr-123");
    expect(headers.get("traceparent")).toContain("0123456789abcdef");
    expect(headers.get("tracestate")).toBe("vendor=test");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("generates a correlation id when none is present", () => {
    const request = new Request("http://localhost/api/browser/scrape");
    const { headers, correlationId } = buildForwardHeaders(request);

    expect(correlationId).toBeTruthy();
    expect(headers.get("x-correlation-id")).toBe(correlationId);
    expect(headers.get("x-request-id")).toBe(correlationId);
  });
});
