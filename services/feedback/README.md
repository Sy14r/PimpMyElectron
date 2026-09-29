# Account-free PME feedback

A Cloudflare Worker accepts user-reviewed reports and creates public issues only in
`Sy14r/PimpMyElectron`. No GitHub credential ships in the desktop application.

## Set up or recover

1. Authenticate Wrangler with account/user read and Workers/scripts write scopes.
2. Run `node scripts/setup-feedback-app.mjs` from the repository root. Follow its
   local page, create the private GitHub App, and install it on **only**
   `Sy14r/PimpMyElectron`. It requests Issues read/write plus GitHub's mandatory
   Metadata read. The generated PKCS#8 private key is saved with mode 0600 in
   ignored `.lab/private-feedback/github-app.json`; it is never printed.
3. Configure Worker secrets `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`,
   `GITHUB_APP_PRIVATE_KEY` (PKCS#8 PEM), and `IP_HASH_SECRET` (random 32+ bytes)
   using Wrangler secret bulk upload or the Cloudflare dashboard. Do not place
   them in wrangler.jsonc or any tracked file. Keep an encrypted recovery copy
   of the GitHub App key, or rotate it in GitHub's App settings if lost.
4. Deploy with `npx wrangler@4.143.1 deploy --config services/feedback/wrangler.jsonc --durable-objects-code-update-mode immediate`.
   No paid-plan upgrade is required by the implementation. SQLite Durable Objects
   are available on the free plan. Account-specific Cloudflare billing still applies.
5. Put the resulting HTTPS `/v1/reports` URL in `client/feedback.json`, test one
   disposable report through PME, and verify that retrying its ID returns the
   same issue. Close the test issue. Rebuild PME to bundle a changed endpoint.

## Data and failure behavior

- Explicit review and **Send feedback** are required. Only title, report body,
  and an opaque retry identifier leave the app. Version information is opt-in;
  logs, messages, account tokens, and workspace names are not collected.
- Drafts persist locally in the manager web view until cleared. Retry IDs survive
  relaunch. Reports older than seven days must be copied into a new report.
- Public GitHub issues contain the report and an invisible idempotency marker.
  The server stores only report hashes, status, timestamps, issue URLs, counters,
  and daily salted address hashes. Raw IPs and descriptions are not stored by
  the application service. Cloudflare/GitHub have their own infrastructure policies.
- The application does not log requests. Worker observability is disabled.
  Metadata expires after eight days; rate-limit counters after two days.
- Durable transactions limit submissions to five new reports per address per hour and 50
  globally per UTC day. Retrying a report does not spend another submission slot;
  failed attempts have a 30-second cooldown. These are abuse caps, not authentication: a public native
  client cannot keep a shared secret. Browser-origin requests are rejected.
- Retries of the same report do not create another issue. After an ambiguous
  upstream response, the service only checks GitHub for the marker and never
  repeats the create request. If it cannot find the issue (including beyond the
  newest 100 results), PME shows a pending state instead of claiming success.
- Tokens are short-lived, restricted again at issuance to this repository and
  Issues write. The GitHub App cannot read Slack, source contents, or other repos.

## Operations

Run `node --test test/feedback-service.test.mjs test/client-feedback.test.mjs`.
A deployment update preserves Durable Object data and configured secrets. To stop
intake, remove the Worker route or revoke the GitHub App installation; desktop
reports remain available to copy. Re-enable only after fixing the cause.

The signing/notarization release flow is separate from this service deployment.

References: [GitHub App manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest),
[installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
[Durable Objects](https://developers.cloudflare.com/durable-objects/).
