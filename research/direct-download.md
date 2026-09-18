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
- 56 unit tests, including distribution classification, legacy ownership
  migration, return to an owned profile, rejection of unowned/corrupt state, and
  waiting for a newly opened native thread editor without closing its loading pane.
- Same unit suite from a clean source checkout without local state or dependency
  installation; Start/Stop command paths work in checkout and packaged layouts.

## Signed-in acceptance

Both Personal Test and haxx are signed into the direct-download profile. The
following checks passed; the restart coverage is listed explicitly below:

- Workspace aggregation and all four runtime modules are active.
- One click opens native DM and DM-thread in Personal Test, and DM and channel-thread
  in haxx, with zero intermediate custom-history requests.
- Rapid selection shows the final requested destination. Done/Later advance after
  persistence; Undo restores the previous destination and decision. Test decisions
  were restored afterward. The queue-order check reads the actual visible next
  item, since initial discovery order can change across sessions.
- Read-only view and Option-click remain explicit fallbacks. A simulated unread
  refresh retains the selected item while its native pane is open.
- Four authorized, labelled messages were sent through Slack's native controls and
  individually verified once in their intended destinations. No send API was added.
- A non-empty native draft survived collapse/reopen and a workspace round trip.
- Module removal/re-enable preserved the native editor and draft. Hide/show and
  minimize/restore passed without changing the underlying conversation.
- Both sign-ins, local decisions, menu-controller connection and shortcut registration
  survived stopping and restarting the direct-download app. The one-click/native
  decision suite passed again after that restart.

The checks exposed a race in thread opening: cleanup could close the newly opened
thread pane while its editor was still mounting. Version 0.11.1 limits that cleanup
to the previous auxiliary view. A regression test covers delayed thread editors.
The fresh sidebar also took time to populate; routing still depends on the native
sidebar and loaded message roots, so Retry/Normal Slack remains the fallback when
those are unavailable.

Raw evidence stays local in `evidence/direct-download-checks.json` and the component
reports it embeds. No profiles, credentials, captures or raw reports are committed.

## Still pending

The actual work laptop needs its own doctor and live check, including any SSO or
device-management restrictions. Arbitrarily old threads, missing-sidebar
conversations, richer native controls, hands-on composer focus across Spaces and
actual Mac sleep/wake still need dedicated acceptance. These checks qualify the
observed 4.52.155 build and tested workflows, not every Slack version or feature.
