# Local experiment evidence

Experiment reports and screenshots are generated here during development and are
excluded from Git. Research documents sometimes reference local artifacts that
will not exist in a fresh clone. Do not commit generated evidence containing
account data; use sanitized fixtures for regression tests.

Use `npm test` for the automated suite. Live probes are separate, may depend on
historical UI assumptions, and can navigate Slack, send messages, or change read
state. Inspect each script and obtain permission for the specific test accounts
and actions. An old experiment's authorization is not permission for a new run.
See [the contributor guide](../CONTRIBUTING.md#testing).

Do not copy Slack profiles, `.lab/`, credentials, screenshots, or message captures
between machines to set up the application. Sign in normally on each machine.
