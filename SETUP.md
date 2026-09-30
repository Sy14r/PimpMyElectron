# Develop and run PME from source

For a prebuilt app, use the [installation guide](docs/CLIENT-RELEASES.md#install-and-update).
These instructions are for contributors working from a checkout.

## Prerequisites

- Apple Silicon Mac running macOS 13.3+ for the native client and helpers.
- Node.js 22 or later and Git.
- Apple Command Line Tools for Swift, SDKs, code signing, and icon tools.
- An official Slack and/or Spotify installation for live mod testing.

Install Command Line Tools with `xcode-select --install` if needed. The native
builder uses `/Library/Developer/CommandLineTools` explicitly. The macOS version
minimum applies to the built app; compilation also needs an SDK capable of building
the current Swift sources. Windows, Linux, and Intel Mac app builds are not provided.

```sh
git clone https://github.com/Sy14r/PimpMyElectron.git
cd PimpMyElectron
node --version
npm test
```

No GitHub authentication or `npm install` is needed. Use your own fork when
contributing. `package.json` is marked private to prevent npm publishing; the
GitHub repository itself is public.

## Build the complete client

```sh
npm run client:build
npm run client:smoke
npm run client:open
```

The builder downloads checksum-pinned Node and Sparkle artifacts, compiles the
native helpers, and creates an ad-hoc-signed `dist/PimpMyElectron.app`. It bundles
the current catalog, UI, runtime code, and release notes. The smoke check uses
temporary data and does not launch Slack or read its messages. This local build
is not a notarized distribution; use the [maintainer release workflow](docs/CLIENT-RELEASES.md#maintainer-release-workflow)
for publication.

Quit PME and stop its managed sessions before replacing a build they are using.
To keep another build intact, build to a **new**, absolute output path:

```sh
PME_CLIENT_OUTPUT="$PWD/.lab/client-dev-1/PimpMyElectron.app" npm run client:build
npm run client:smoke -- "$PWD/.lab/client-dev-1/PimpMyElectron.app"
open "$PWD/.lab/client-dev-1/PimpMyElectron.app"
```

Custom output destinations must not already exist. `client:open` always opens the
default `dist` path, so use the explicit `open` command for a custom build.
Different copies of PME still share its normal user settings and managed sessions;
a different output directory is not an isolated account environment.

In the manager, select an app and mods, then launch. Quit an ordinary running
Slack session first. Slack uses a separate integration sign-in profile; sign in
normally there. Spotify uses its existing sign-in and may request macOS Automation
permission to control playback. See the [Menu Player](docs/SPOTIFY-MENU.md) and
[Camera Pause](docs/SPOTIFY-CAMERA-PAUSE.md) guides for their separate capabilities.

## Develop Slack Triage directly

This path runs code from the checkout instead of a built PME bundle. Quit any
running Slack session normally, then:

```sh
npm run doctor
npm run dev
```

Doctor checks the installed distribution, signature, profile ownership, and local
tools without launching Slack or reading account data. The launcher defaults to
`/Applications/Slack.app`; override it for both checks and launch if necessary:

```sh
PME_SLACK_APP="$HOME/Applications/Slack.app" npm run doctor
PME_SLACK_APP="$HOME/Applications/Slack.app" npm run dev
```

The launcher detects supported direct-download and Mac App Store distributions
and uses a separate integration profile for the installed distribution. It retains
sign-ins across restarts and refuses to take over a conflicting profile. An
unrecognized installation or successful static check alone does not establish
live compatibility with a new Slack version.

The launcher builds/starts the native controller. Once Slack is signed in and
ready, startup selects Home to seed cached state, then opens the triage inbox.
An empty inbox can reflect incomplete cached state; do not add polling to hide
that condition. Test with accounts and conversations you control.

In another terminal in the same checkout:

```sh
npm run dev:status
npm run dev:reload
npm run shell:restart
npm run shell -- stock
npm run dev:stop
```

- `dev:reload` reapplies renderer/runtime mods from source.
- `shell:restart` rebuilds and restarts the native Slack controller.
- `shell -- stock` restores the standard Slack view.
- `dev:stop` stops the owned session while keeping sign-ins and preferences.
- Changes to launcher/control code require a full stop/start.

### Know which runtime you are editing

| Running workflow | Runtime and control data | Apply changes |
| --- | --- | --- |
| `npm run dev` | Source in this checkout; controls under `.lab/dev/` | Reload mods, restart the helper, or stop/start as above. |
| PME app or launch shortcut | Copied code inside that PME app; state under `~/Library/Application Support/PimpMyElectron/` | Rebuild PME, stop the old managed session, open the new build explicitly, then launch again. |

The checkout's `dev:status`, `dev:reload`, `dev:stop`, `shell`, and `mods` commands
target `.lab/dev`; they do **not** update a session launched from a PME app.
Changing source or running `git pull` does not update code already copied into a
bundle. Closing the manager window alone does not stop its mods.

## Debugging and live experiments

Everyday mode is the default. To enable arbitrary renderer evaluation,
screenshots, and experimental inspection, fully stop the source session and run:

```sh
npm run dev:debug
```

Debug mode uses the same integration sign-ins as `dev`; it does not provide a new
account sandbox. Stop it and relaunch with `npm run dev` to return to everyday
controls. A renderer reload cannot change the launcher's security mode.

Use `npm test` for automated regression tests. Scripts named `live-*`,
`acceptance-*`, `experiment`, and similar are separate, scenario-specific probes;
some depend on old UI versions or named test workspaces, and some send messages or
change read state. Inspect each script before use and obtain permission for the
specific accounts/actions. Historical research notes do not grant authorization.
See [testing guidance](CONTRIBUTING.md#testing).

## Update and recover

Stop the source session before pulling launcher changes, then `git pull --ff-only`,
run relevant tests, and restart. For the GUI path, rebuild and smoke-test the app.
Keep local modifications on a branch before updating.

If a native pane cannot open, use its recovery controls or Open in Slack. For
launch problems, run Doctor and check local runtime logs. Review and redact any
log before sharing it. Do not delete a profile or copy credentials to bypass an
ownership error. Never include `.lab/`, integration profiles, account caches, or
raw message captures in a contribution.

The old `package:pilot` source ZIP is a [historical prototype](pilot/README.md),
not the supported way to build or distribute the current client.
