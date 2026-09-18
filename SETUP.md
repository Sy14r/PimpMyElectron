# Run on an Apple Silicon work Mac

Repository: https://github.com/Sy14r/PimpMyElectron (private).

The launcher detects **Mac App Store or official direct-download Slack** and
selects a separate integration-test profile for that distribution. Slack normally
lives at `/Applications/Slack.app`. Both distributions of Slack 4.52.155 /
Electron 44 have passed signed-in checks on this Apple Silicon Mac. Direct-download
acceptance includes two workspaces, native DM/thread opening and delivery, draft
preservation, local triage actions, module lifecycle and a full restart. See the
[validation record](research/direct-download.md) for the exact coverage and limits.

Run the preflight below before launching. A managed laptop can still restrict
sign-in or debugging even when the distribution matches. A successful source
clone does not prove compatibility with that laptop.

## Corporate logout / API traffic update (0.12.0)

Stop an older running triage build before updating. Version 0.12.0 removes all
background enrichment polling and message/reconnect-triggered API refreshes.
Queue workspace selection is local; opening native chat uses Slack's own UI.
Optional manual refresh is scoped to one workspace and limited to once per
minute, and read-only history/Mark read still make explicit custom requests.
Background unread and thread coverage now depends on what Slack itself reports.
See the [traffic audit](research/api-traffic.md) for evidence and limitations.

`npm run dev:status` should show `feature.apiPolicy: "manual-only"`.
`feature.customApi.requests` should remain unchanged while you only leave triage
idle, switch its queue scope, or use native chat. Counters reset on runtime
restart/reload. The older `feature.methods` counter includes native Slack traffic.
The [pilot guide](pilot/README.md#api-traffic-diagnostics) also describes disabling
both optional API adapters for a strictly native-only test.

## Passive cache observer (0.13.0)

The `state-observer` module reads Slack's existing local state and subscribes to
local changes. It adds no API calls and works with both `history-reader` and
`mark-read` disabled. Those disable settings survive updates. Cached previews now
work without trying to load history; use Native chat for content Slack has not
already loaded. `feature.clientStateSnapshots` in `npm run dev:status` counts
accepted cache observations. See [coverage and validation](research/passive-state.md).

If a Slack update breaks this optional observer, disable it with
`npm run mods -- disable state-observer`; the existing DOM/network observation
and native UI continue to work. No fallback API polling is enabled.

## Centered unread pill (0.14.0)

The **0.14.0** pill polish works with the passive observer and preserves disabled
API adapters. After updating, the strip stays centered on either edge. Dots count
active unread conversations/threads in the selected workspace scope. Hover to
expand, then hover a badge for its cached preview. Clicking opens native Slack
and may mark the destination read. Done/snoozed items are omitted from the pill.

## Native hover previews (0.15.0)

For **0.15.0**, after `git pull --ff-only`, run `npm run dev:reload` followed by
`npm run shell:restart`. Both processes must be updated for the new native hover
preview. A full stop/start also works. The helper rebuilds automatically using
Command Line Tools; existing API-adapter disable settings remain in effect.

## Prerequisites


- Node.js 22 or newer, including npm.
- Apple Command Line Tools (the native menu controller compiles locally).
- Git and access to the private repository as `Sy14r`, or another authorized account.
- GitHub CLI (`gh`) for the authentication steps below.

If Homebrew is already installed, `brew install node gh` installs Node and the
GitHub CLI. Run `xcode-select --install` if Command Line Tools are missing and
finish its installer before continuing. Existing installations can be reused.
There are no npm dependencies to install.

## Clone

Authenticate on the work laptop; this does not copy credentials from another Mac:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/Sy14r/PimpMyElectron.git
cd PimpMyElectron
```

Use a short local path like the one above because macOS limits Unix socket paths.
If Git reports an unaccepted full-Xcode license but Command Line Tools are already
installed, `export DEVELOPER_DIR=/Library/Developer/CommandLineTools` selects that
toolchain for this Terminal session without changing the system's selection.

## Check and launch

```sh
npm run doctor
npm test
```

Resolve any `BLOCK` results before launch. The doctor checks distribution,
signature, profile ownership, toolchain and socket paths without reading account
data. `REVIEW` results identify things that still need a live check. If installation or distribution
is blocked, share the doctor output so that build can be checked; do not bypass
the check or replace a managed Slack installation just to run this prototype.

Quit Slack normally with **⌘Q**, then:

```sh
npm run dev
```

Keep this Terminal running. The launcher starts the installed official Slack app,
builds the native menu controller, and uses a separate development profile. Sign
in normally on this Mac; no sessions or credentials are included in the repository.
Start with a test workspace to check behavior, then sign into your work workspace.
The first sign-in may still need ordinary workspace approval or SSO.

Press **⌘⇧Y** from another app to open triage. Select an item to open its native
Slack conversation and composer. Slack owns normal read behavior and sending;
Done/Later/Pin/Undo remain local triage actions. Press **⌘⇧Y** again to collapse and
return to work. Menu-bar controls configure edge, display and resting behavior.
Preferences and local decisions are independent on each Mac.

You can also open `pilot/Start Triage.command` and `pilot/Stop Triage.command`
from this checkout. See [the pilot workflow](pilot/README.md) for more controls
and the remaining compatibility limitations.

## Stop, recover and update

Run these commands in another Terminal opened in this checkout:

```sh
npm run dev:status
npm run shell -- stock
npm run dev:stop
```

`stock` restores the normal Slack window while the launcher stays running.
`dev:stop` stops the owned development instance and preserves its sign-ins and
local decisions. After stopping, launch Slack normally for your ordinary profile.

To update this checkout, stop the development instance first, then:

```sh
git pull --ff-only
npm run doctor
npm test
npm run dev
```

If you made source changes, save them before pulling. Keep the checkout in the
same location and preserve its ignored `.lab/` directory. Do not copy `.lab/`,
Slack profiles or credentials from another Mac. A conflicting preexisting
integration-test profile causes setup to stop instead of overwriting it.

For a Slack installation in a different location, set its absolute path before
running both doctor and dev (the bundle must still verify as official Slack):

```sh
export PME_SLACK_APP="$HOME/Applications/Slack.app"
npm run doctor
npm run dev
```

The application bundle remains unmodified. New Slack releases may require
adapter changes; private Slack interfaces are not a stable extension API.
Mac sleep/wake, all rich composer controls and every Slack distribution are not
yet qualified. Automated live send/mark-read experiments are not setup steps;
`npm test` uses the unit suite and does not send Slack messages.
