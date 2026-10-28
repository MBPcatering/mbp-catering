import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  DRILL_INCIDENT_MARKER,
  DRILL_INCIDENT_TITLE,
  syncMonitoringDrillIncident,
} from "./sync-monitoring-drill-incident.mjs";
import { INCIDENT_MARKER, INCIDENT_TITLE } from "./sync-monitoring-incident.mjs";

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

function existingDrill(number = 42) {
  return {
    body: `Notification drill.\n\n${DRILL_INCIDENT_MARKER}`,
    number,
    title: DRILL_INCIDENT_TITLE,
  };
}

function realMonitoringIncident(number = 7) {
  return {
    body: `Production incident.\n\n${INCIDENT_MARKER}`,
    number,
    title: INCIDENT_TITLE,
  };
}

describe("syncMonitoringDrillIncident", () => {
  it("creates one generic drill issue for an incident simulation", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { number: 42 }));

    await expect(syncMonitoringDrillIncident({ ...options, fetchFn, mode: "incident" })).resolves.toEqual({
      action: "created",
    });

    const body = fetchFn.mock.calls[1][1].body;
    expect(body).toContain(DRILL_INCIDENT_TITLE);
    expect(body).toContain(DRILL_INCIDENT_MARKER);
    expect(body).not.toContain(options.token);
    expect(body).not.toContain(INCIDENT_MARKER);
  });

  it("does not duplicate an open drill issue", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, [existingDrill()]));

    await expect(syncMonitoringDrillIncident({ ...options, fetchFn, mode: "incident" })).resolves.toEqual({
      action: "unchanged",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("adds a recovery comment and closes only the drill issue", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [existingDrill()]))
      .mockResolvedValueOnce(jsonResponse(201, { id: 12 }))
      .mockResolvedValueOnce(jsonResponse(200, { state: "closed" }));

    await expect(
      syncMonitoringDrillIncident({
        ...options,
        fetchFn,
        mode: "recovery",
        now: () => new Date("2026-10-28T21:00:00.000Z"),
      }),
    ).resolves.toEqual({ action: "closed" });

    expect(fetchFn.mock.calls[1][0]).toContain("/issues/42/comments");
    expect(fetchFn.mock.calls[2][0]).toContain("/issues/42");
    expect(fetchFn.mock.calls[1][1].body).not.toContain(options.token);
  });

  it("never recognizes or closes the real monitoring incident", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, [realMonitoringIncident()]));

    await expect(syncMonitoringDrillIncident({ ...options, fetchFn, mode: "recovery" })).resolves.toEqual({
      action: "unchanged",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps the drill workflow manual, isolated from production monitoring, and serialized", () => {
    const workflow = readFileSync(".github/workflows/automation-monitoring-drill.yml", "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("group: automation-monitoring-drill");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("MONITOR_SECRET");
    expect(workflow).not.toContain("mbp-catering.vercel.app");
    expect(workflow).toContain("sync-monitoring-drill-incident.mjs");
  });
});
