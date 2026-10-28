import { describe, expect, it, vi } from "vitest";

import {
  MonitoringCheckError,
  checkAutomationMonitoring,
} from "./check-automation-monitoring.mjs";

const options = {
  secret: "test-monitor-secret",
  timeoutMs: 25,
  url: "https://example.test/api/internal/monitoring/status",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("checkAutomationMonitoring", () => {
  it("accepts only a healthy technical status", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { status: "healthy" }));

    await expect(checkAutomationMonitoring({ ...options, fetchFn })).resolves.toEqual({
      status: "healthy",
    });

    expect(fetchFn).toHaveBeenCalledWith(
      options.url,
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: `Bearer ${options.secret}`,
          "Cache-Control": "no-cache",
        }),
        method: "GET",
      }),
    );
  });

  it.each(["warning", "critical", "unknown"]) (
    "rejects the %s state",
    async (status) => {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { status }));

      await expect(checkAutomationMonitoring({ ...options, fetchFn })).rejects.toMatchObject({
        code: "unexpected_status",
      } satisfies Partial<MonitoringCheckError>);
    },
  );

  it.each([401, 503])("rejects HTTP %i without reading the response", async (httpStatus) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(httpStatus, { status: "healthy" }));

    await expect(checkAutomationMonitoring({ ...options, fetchFn })).rejects.toMatchObject({
      code: "http_status",
    } satisfies Partial<MonitoringCheckError>);
  });

  it("rejects an aborted request as a timeout", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));

    await expect(checkAutomationMonitoring({ ...options, fetchFn })).rejects.toMatchObject({
      code: "timeout",
    } satisfies Partial<MonitoringCheckError>);
  });

  it("rejects invalid JSON without including its body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("<sensitive-response>", { status: 200 }));

    await expect(checkAutomationMonitoring({ ...options, fetchFn })).rejects.toMatchObject({
      code: "invalid_json",
    } satisfies Partial<MonitoringCheckError>);
  });

  it("rejects a JSON response without a status", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { checkedAt: "2026-10-28T00:00:00Z" }));

    await expect(checkAutomationMonitoring({ ...options, fetchFn })).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<MonitoringCheckError>);
  });
});
