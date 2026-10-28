# Controlled GitHub Actions notification drill

`Automation Monitoring Notification Drill` is a manual-only workflow for validating GitHub incident notifications without contacting the production monitoring endpoint, Supabase, n8n, or SMTP.

It manages only issues with this exact title and internal marker:

- Title: `[DRILL] Automation monitoring notification test`
- Marker: `<!-- mbp-automation-monitoring-drill -->`

It never reads, creates, comments on, or closes the production monitoring incident, whose title and marker are distinct.

## Before publication

1. Review the workflow and its tests.
2. Confirm that GitHub Issues are enabled for the repository.
3. Confirm that the intended technical account receives GitHub notifications for new issues and issue activity.
4. Confirm that no drill issue with the exact drill title and marker is currently open.

The workflow uses GitHub's ephemeral `github.token`; it does not use `MONITOR_SECRET` or any application secret.

## Controlled test

1. From the Actions tab, run **Automation Monitoring Notification Drill** manually with `mode = incident`.
2. Confirm exactly one issue titled `[DRILL] Automation monitoring notification test` is created.
3. Confirm the notification arrives at the configured GitHub notification address.
4. Re-run `mode = incident` only if a deliberate deduplication check is required; it must leave the open drill issue unchanged.
5. Run the workflow manually with `mode = recovery`.
6. Confirm it adds one generic recovery comment and closes that same drill issue.

No customer data, HTTP response bodies, authorization headers, or application secrets belong in the issue or comment.

## Cleanup and limits

The `recovery` mode is the required cleanup step for an open drill issue. The workflow does not prove downstream mail delivery by GitHub; it proves that GitHub created or updated the issue and that the account's configured GitHub notification path received it. Email filtering, recipient preferences, and GitHub delivery delays remain outside the repository's control.

Runs are serialized under a dedicated `automation-monitoring-drill` concurrency group. This prevents overlapping drill runs from this workflow, but administrators should avoid manually creating lookalike issues or running equivalent scripts outside GitHub Actions.
