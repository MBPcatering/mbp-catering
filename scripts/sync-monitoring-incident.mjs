const GITHUB_API_URL = "https://api.github.com";

export const INCIDENT_MARKER = "<!-- mbp-automation-monitoring-incident -->";
export const INCIDENT_TITLE = "Automation monitoring incident";

export class MonitoringIncidentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function validateInput({ outcome, repository, token }) {
  if (!repository || !token || !["healthy", "unhealthy"].includes(outcome)) {
    throw new MonitoringIncidentError("invalid_input", "incident synchronization input is invalid");
  }
}

function isMatchingIncident(issue) {
  return (
    issue &&
    !issue.pull_request &&
    issue.title === INCIDENT_TITLE &&
    typeof issue.body === "string" &&
    issue.body.includes(INCIDENT_MARKER) &&
    Number.isInteger(issue.number)
  );
}

async function requestGitHub(fetchFn, url, token, init = {}) {
  let response;
  try {
    response = await fetchFn(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
  } catch {
    throw new MonitoringIncidentError("github_request_failed", "GitHub incident request failed");
  }

  if (!response.ok) {
    throw new MonitoringIncidentError("github_request_failed", "GitHub incident request was rejected");
  }

  return response;
}

async function findOpenIncident(fetchFn, repository, token) {
  const response = await requestGitHub(
    fetchFn,
    `${GITHUB_API_URL}/repos/${repository}/issues?state=open&per_page=100`,
    token,
  );

  let issues;
  try {
    issues = await response.json();
  } catch {
    throw new MonitoringIncidentError("github_request_failed", "GitHub incident response was invalid");
  }

  if (!Array.isArray(issues)) {
    throw new MonitoringIncidentError("github_request_failed", "GitHub incident response was invalid");
  }

  return issues.find(isMatchingIncident) ?? null;
}

export async function syncMonitoringIncident({
  fetchFn = fetch,
  now = () => new Date(),
  outcome,
  repository,
  token,
}) {
  validateInput({ outcome, repository, token });

  const incident = await findOpenIncident(fetchFn, repository, token);

  if (outcome === "unhealthy") {
    if (incident) {
      return { action: "unchanged" };
    }

    await requestGitHub(fetchFn, `${GITHUB_API_URL}/repos/${repository}/issues`, token, {
      body: JSON.stringify({
        body: [
          "The production automation monitoring check did not return healthy.",
          "No client data, authorization headers, or monitoring response body are recorded here.",
          "",
          INCIDENT_MARKER,
        ].join("\n"),
        title: INCIDENT_TITLE,
      }),
      method: "POST",
    });

    return { action: "created" };
  }

  if (!incident) {
    return { action: "unchanged" };
  }

  const recoveredAt = now().toISOString();
  await requestGitHub(
    fetchFn,
    `${GITHUB_API_URL}/repos/${repository}/issues/${incident.number}/comments`,
    token,
    {
      body: JSON.stringify({
        body: `The production automation monitoring check returned healthy at ${recoveredAt}.`,
      }),
      method: "POST",
    },
  );
  await requestGitHub(fetchFn, `${GITHUB_API_URL}/repos/${repository}/issues/${incident.number}`, token, {
    body: JSON.stringify({ state: "closed" }),
    method: "PATCH",
  });

  return { action: "closed" };
}

async function main() {
  try {
    const result = await syncMonitoringIncident({
      outcome: process.env.MONITORING_OUTCOME,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    console.log(`automation monitoring incident: ${result.action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "incident synchronization failed";
    console.error(`automation monitoring incident synchronization failed: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
