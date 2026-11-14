import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const proposals = [
  "mbp-catering-v3-staging-event-driven.proposal.json",
  "mbp-catering-v3-alertes-event-driven.proposal.json",
];

type Workflow = {
  active: boolean;
  settings: Record<string, unknown>;
  nodes: Array<{
    name: string;
    type: string;
    typeVersion: number;
    parameters: Record<string, unknown>;
    retryOnFail?: boolean;
    credentials?: unknown;
  }>;
};

async function readWorkflow(filename: string) {
  const raw = await readFile(resolve(process.cwd(), "docs/n8n", filename), "utf8");
  return JSON.parse(raw) as Workflow;
}

describe("event-driven n8n V3 proposals", () => {
  it.each(proposals)("keeps %s inactive, private, and free of retries", async (filename) => {
    const workflow = await readWorkflow(filename);

    expect(workflow.active).toBe(false);
    expect(workflow.settings).toMatchObject({
      saveDataErrorExecution: "none",
      saveDataSuccessExecution: "none",
      saveManualExecutions: false,
      saveExecutionProgress: false,
      availableInMCP: false,
    });
    expect(workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ retryOnFail: false }),
      ]));
    expect(workflow.nodes.every((node) => node.retryOnFail !== true)).toBe(true);
  });

  it.each(proposals)("uses an authenticated webhook and a six-hour recovery trigger in %s", async (filename) => {
    const workflow = await readWorkflow(filename);
    const webhook = workflow.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
    const schedule = workflow.nodes.find((node) => node.type === "n8n-nodes-base.scheduleTrigger");

    expect(webhook).toMatchObject({
      typeVersion: 2,
      parameters: expect.objectContaining({
        authentication: "headerAuth",
        httpMethod: "POST",
        responseMode: "onReceived",
      }),
    });
    expect(schedule?.parameters).toEqual({
      rule: { interval: [{ field: "hours", hoursInterval: 6 }] },
    });
  });

  it.each(proposals)("contains only production HTTP destinations and no embedded credentials in %s", async (filename) => {
    const workflow = await readWorkflow(filename);
    const serialized = JSON.stringify(workflow);
    const httpUrls = workflow.nodes
      .filter((node) => node.type === "n8n-nodes-base.httpRequest")
      .map((node) => node.parameters.url);

    expect(httpUrls.every((url) => typeof url === "string" && url.startsWith("https://mbp-catering.vercel.app/"))).toBe(true);
    expect(workflow.nodes.every((node) => node.credentials === undefined)).toBe(true);
    expect(serialized).not.toMatch(/localhost|127\.0\.0\.1|Bearer\s+[A-Za-z0-9_-]{16,}/i);
  });
});
