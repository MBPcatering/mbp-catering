import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  INCIDENT_MARKER,
  INCIDENT_TITLE,
  MonitoringIncidentError,
  syncMonitoringIncident,
} from "./sync-monitoring-incident.mjs";

const options = {
  repository: "MBPcatering/mbp-catering",
  token: "test-github-token",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function existingIncident(id = 7) {
  return {
    body: `Technical monitoring incident.\n\n${INCIDENT_MARKER}`,
    id,
    number: id,
    title: INCIDENT_TITLE,
  };
}

describe("syncMonitoringIncident", () => {
  it("creates one generic issue for an initial anomaly", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { number: 7 }));

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "unhealthy" })).resolves.toEqual({
      action: "created",
    });

    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/MBPcatering/mbp-catering/issues",
      expect.objectContaining({
        body: expect.stringContaining(INCIDENT_MARKER),
        method: "POST",
      }),
    );
    expect(fetchFn.mock.calls[1][1].body).not.toContain(options.token);
  });

  it("does not create an issue or comment while an incident persists", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, [existingIncident()]));

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "unhealthy" })).resolves.toEqual({
      action: "unchanged",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("comments once and closes the matching issue after recovery", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [existingIncident()]))
      .mockResolvedValueOnce(jsonResponse(201, { id: 10 }))
      .mockResolvedValueOnce(jsonResponse(200, { state: "closed" }));

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "healthy" })).resolves.toEqual({
      action: "closed",
    });

    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/MBPcatering/mbp-catering/issues/7/comments",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/MBPcatering/mbp-catering/issues/7",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("does nothing on healthy when no matching issue is open", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, []));

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "healthy" })).resolves.toEqual({
      action: "unchanged",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects GitHub permission errors without including the token", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(403, { message: "forbidden" }));

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "unhealthy" })).rejects.toMatchObject({
      code: "github_request_failed",
    } satisfies Partial<MonitoringIncidentError>);
  });

  it("rejects an issue creation error without retrying or exposing the token", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(403, { message: "forbidden" }));

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "unhealthy" })).rejects.toMatchObject({
      code: "github_request_failed",
    } satisfies Partial<MonitoringIncidentError>);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][1].body).not.toContain(options.token);
  });

  it("requires a valid outcome and repository before calling GitHub", async () => {
    const fetchFn = vi.fn();

    await expect(syncMonitoringIncident({ ...options, fetchFn, outcome: "invalid" })).rejects.toMatchObject({
      code: "invalid_input",
    } satisfies Partial<MonitoringIncidentError>);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("keeps concurrent anomaly synchronizations from creating duplicates when one sees the open issue", async () => {
    const firstFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { number: 7 }));
    const secondFetch = vi.fn().mockResolvedValue(jsonResponse(200, [existingIncident()]));

    const [first, second] = await Promise.all([
      syncMonitoringIncident({ ...options, fetchFn: firstFetch, outcome: "unhealthy" }),
      syncMonitoringIncident({ ...options, fetchFn: secondFetch, outcome: "unhealthy" }),
    ]);

    expect([first.action, second.action].sort()).toEqual(["created", "unchanged"]);
    expect(firstFetch).toHaveBeenCalledTimes(2);
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });

  it("serializes monitoring runs before synchronizing GitHub issues", () => {
    const workflow = readFileSync(".github/workflows/automation-monitoring.yml", "utf8");

    expect(workflow).toContain("group: automation-monitoring");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("needs: check");
    expect(workflow).toContain("if: always()");
  });
});
