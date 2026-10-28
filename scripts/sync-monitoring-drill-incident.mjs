const GITHUB_API_URL = "https://api.github.com";

export const DRILL_INCIDENT_MARKER = "<!-- mbp-automation-monitoring-drill -->";
export const DRILL_INCIDENT_TITLE = "[DRILL] Automation monitoring notification test";

export class MonitoringDrillIncidentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function validateInput({ mode, repository, token }) {
  if (!repository || !token || !["incident", "recovery"].includes(mode)) {
    throw new MonitoringDrillIncidentError("invalid_input", "monitoring drill input is invalid");
  }
}

function isMatchingDrill(issue) {
  return (
    issue &&
    !issue.pull_request &&
    issue.title === DRILL_INCIDENT_TITLE &&
    typeof issue.body === "string" &&
    issue.body.includes(DRILL_INCIDENT_MARKER) &&
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
    throw new MonitoringDrillIncidentError("github_request_failed", "GitHub drill request failed");
  }

  if (!response.ok) {
    throw new MonitoringDrillIncidentError("github_request_failed", "GitHub drill request was rejected");
  }

  return response;
}

async function findOpenDrill(fetchFn, repository, token) {
  const response = await requestGitHub(
    fetchFn,
    `${GITHUB_API_URL}/repos/${repository}/issues?state=open&per_page=100`,
    token,
  );

  let issues;
  try {
    issues = await response.json();
  } catch {
    throw new MonitoringDrillIncidentError("github_request_failed", "GitHub drill response was invalid");
  }

  if (!Array.isArray(issues)) {
    throw new MonitoringDrillIncidentError("github_request_failed", "GitHub drill response was invalid");
  }

  return issues.find(isMatchingDrill) ?? null;
}

export async function syncMonitoringDrillIncident({
  fetchFn = fetch,
  mode,
  now = () => new Date(),
  repository,
  token,
}) {
  validateInput({ mode, repository, token });

  const drill = await findOpenDrill(fetchFn, repository, token);

  if (mode === "incident") {
    if (drill) {
      return { action: "unchanged" };
    }

    await requestGitHub(fetchFn, `${GITHUB_API_URL}/repos/${repository}/issues`, token, {
      body: JSON.stringify({
        body: [
          "This is a controlled notification drill, not a production automation incident.",
          "No client data, authorization headers, monitoring response, or secret is recorded here.",
          "",
          DRILL_INCIDENT_MARKER,
        ].join("\n"),
        title: DRILL_INCIDENT_TITLE,
      }),
      method: "POST",
    });

    return { action: "created" };
  }

  if (!drill) {
    return { action: "unchanged" };
  }

  const recoveredAt = now().toISOString();
  await requestGitHub(fetchFn, `${GITHUB_API_URL}/repos/${repository}/issues/${drill.number}/comments`, token, {
    body: JSON.stringify({
      body: `The controlled notification drill was marked recovered at ${recoveredAt}.`,
    }),
    method: "POST",
  });
  await requestGitHub(fetchFn, `${GITHUB_API_URL}/repos/${repository}/issues/${drill.number}`, token, {
    body: JSON.stringify({ state: "closed" }),
    method: "PATCH",
  });

  return { action: "closed" };
}

async function main() {
  try {
    const result = await syncMonitoringDrillIncident({
      mode: process.env.DRILL_MODE,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    console.log(`automation monitoring drill: ${result.action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "monitoring drill failed";
    console.error(`automation monitoring drill failed: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
