# Direct-download qualification — September 18, 2026

The official [Slack Mac download](https://slack.com/downloads/mac) supplied
Slack 4.52.155 / Electron 44 as a universal DMG. The test copy was extracted under
ignored `.lab/`; the installed `/Applications/Slack.app` was not replaced or modified.

Slack documents separate normal profile locations for
[direct-download and App Store installations](https://slack.com/help/articles/360048367814-Update-the-Slack-desktop-app).
We also inspected the downloaded build's startup code: `--integrationTestMode`
sets `userData` to `SlackIntegrationTest` beneath Electron's application-data path.
This gives the following development profiles:

| Distribution | Development profile |
| --- | --- |
| Mac App Store | `~/Library/Containers/com.tinyspeck.slackmacgap/Data/Library/Application Support/SlackIntegrationTest` |
| Direct download | `~/Library/Application Support/SlackIntegrationTest` |

The shared detector verifies the complete bundle signature and Slack signing
identity, then classifies sandbox/receipt/Developer ID properties. Unknown
combinations stop before profile ownership changes or Slack launch. Both doctor
and dev use the same detector. `PME_SLACK_APP` can select an absolute application
path; it does not relax signature or distribution checks.

Local ownership records now retain multiple distribution-specific profiles.
The existing App Store marker migrates without discarding its ownership. An
existing unowned profile or malformed marker is preserved and rejected. The
selected executable's version is passed to the module loader instead of always
reading the version from `/Applications/Slack.app`.

## Passed checks

- Downloaded app: Slack Developer ID signature, deep/strict verification, and
  matching ASAR integrity metadata; app bundle left intact.
- Fresh direct-download launch: signed-out Slack welcome page.
- Open-file inspection: direct-download integration-test profile in use; no
  normal direct-download or App Store profile open in the Slack main process.
- CDP through inherited pipes; no TCP listener in that Slack process.
- Renderer JavaScript and Shadow DOM injection/removal.
- Native window bridge and setting/restoring the existing bounds.
- Menu controller connection and global shortcut registration.
- 55 unit tests, including distribution classification, legacy ownership
  migration, return to an owned profile, and rejection of unowned/corrupt state.
- Same unit suite from a clean source checkout without local state or dependency
  installation; Start/Stop command paths work in checkout and packaged layouts.

Raw evidence remains local in `evidence/direct-download-checks.json`.

## Still pending

The direct-download profile needs a fresh user sign-in to the test workspaces.
Signed-in aggregation, native chat, draft preservation and cross-workspace
behavior have passed on the App Store build, but have not yet been repeated on
this direct-download profile. Do not describe startup/window checks as full
workflow acceptance. The actual work laptop still needs its own doctor and live
check, including any SSO or device-management restrictions.
