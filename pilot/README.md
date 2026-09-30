# Historical Slack source bundle

This directory contains the earlier Slack-only prototype packaging instructions
and launcher files. The `npm run package:pilot` script remains for reference;
its fixed file allowlist and version predate the current client and have not been
qualified for current distribution. Do not use its ZIP as the supported release.

For current installation, download the signed/notarized PME app from
[GitHub Releases](https://github.com/Sy14r/PimpMyElectron/releases/latest).
For source development, follow
[SETUP.md](https://github.com/Sy14r/PimpMyElectron/blob/main/SETUP.md).
For maintainers, use the
[client release workflow](https://github.com/Sy14r/PimpMyElectron/blob/main/docs/CLIENT-RELEASES.md).

Never transfer Slack profiles, credentials, `.lab/`, or message captures with a
source bundle. Sign in normally on each Mac.
