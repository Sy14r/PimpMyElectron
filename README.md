# PimpMyElectron: Slack extensibility research

**Yes: arbitrary renderer JavaScript, custom UI, and substantial native window control work inside this installed, unmodified official Slack client.** The most promising foundation is a launcher using a private Chrome DevTools Protocol (CDP) pipe, a small runtime mod loader, and Slack-specific adapters.

Research performed September 17–18, 2026, against **Slack 4.52.155 / Electron 44.0.0 / macOS arm64 / Mac App Store and direct-download distributions**. Other distributions and future versions need separate checks.

- [Clone and run on your work Mac](SETUP.md)
- [Full findings, capability matrix, experiments, and sources](research/slack-extensibility.md)
- [Architecture for a SlackAssist-style triage experience](research/triage-architecture.md)
- [Direct-download validation and remaining checks](research/direct-download.md)
- [Local evidence notes](evidence/README.md)

The live development workflow now includes a menu-bar controller, global shortcut, thin edge strip, queue/reader disclosure, local Done/Later/Pin/Undo with keyboard advancement, explicit conversation Mark read, two-workspace aggregation, on-demand history and threads, native Slack replies inside triage, and independently removable runtime modules. It remains a partial activity view using private Slack interfaces. As of 0.12.0, background activity is passive: existing Slack responses, socket events and visible UI supply observations. There is no automatic API polling or reconnect retry. Optional API refreshes require selecting one workspace and clicking Refresh activity. Version 0.13.0 also hydrates cached conversations, messages and thread cursors directly from Slack’s existing local state, including background workspaces; see [passive state observation](research/passive-state.md). See the [API traffic audit](research/api-traffic.md), including the coverage tradeoff and corporate logout investigation.

## Live development

Version **0.14.0** centers the resting strip and expanded pill vertically on the
selected display's usable edge. Each active unread conversation/thread gets a dot
and an individual expanded badge. Hover a badge for its name, workspace and cached
message preview; click for native chat, or Option-click for the read-only reader.
Done and snoozed items are excluded. The strip shows up to 48 dots plus an overflow
count; the expanded list scrolls. Hovering adds no API calls and does not mark read.
See [pill behavior and validation](research/pill-polish.md).

Before moving to another Mac, run `npm run doctor` there. It checks the installed Slack distribution, version, signature, profile ownership and build prerequisites without launching Slack or reading account data. The launcher detects Mac App Store and official direct-download distributions and selects their separate development profiles. See the setup guide for the current validation status. Build a clean source transfer with `npm run package:pilot`; the zip under `dist/` includes Start/Stop command files and excludes private state and send experiments. See [pilot setup](pilot/README.md) and [next pilot proof points](research/pilot-next.md).

Quit Slack normally, then run `npm run dev`. The launcher starts official Slack in its owned development profile and automatically builds/starts the native menu controller. Existing development sign-ins persist. Press **⌘⇧Y from another app**, open or triage an item, then **⌘⇧Y** back to your work. Local triage decisions do not change Slack unread state. **Selecting an item opens Slack’s own conversation or thread pane alongside the queue immediately**, including its composer. There is no separate Reply click or custom-reader load first. **Read-only view** (or Option-click on an item) keeps the lightweight reader available. Done/Later/Pin/Undo remain above the native pane. **⌘⇧Y** collapses/reopens it while Slack keeps the draft. Opening the native view may mark the conversation read; **Done** remains local. **Open in Slack** is the ordinary-window fallback.

`npm run dev:reload` reapplies edited source; `npm run dev:status` reports health; `npm run dev:stop` stops the owned helper/client while retaining sign-ins and local state. `npm run mods -- disable triage-surface` removes the UI and restores Slack. The mod does not patch the app bundle or implement a send API. Slack owns composing, sending and drafts. Mark read is an explicit, timestamp-bounded conversation action; thread marking is not yet supported. Production-profile migration and login items are not implemented.

See [usage, architecture, recovery, validation and limitations](research/live-prototype.md) and [phase-by-phase delivery status](research/implementation-plan.md). Apple Command Line Tools are needed to compile the native helper. The persistent signed-in dev session and disposable synthetic experiments below must be run separately.

Experiment screenshots and raw reports stay on the development Mac; see [local evidence notes](evidence/README.md).

## What was verified

| Capability | Result |
|---|---|
| Custom JS, CSS, Shadow DOM | Passed inside the signed Slack application |
| Mod reapplication and removal | Passed, including reload registration and cleanup |
| Local companion communication | Passed with a fixed read-only host operation |
| Private CDP pipe | Passed; no TCP listener in the Slack parent process |
| Left/right native docking | Passed at 388px |
| Native widths | 12, 44, 68, 388, and 772px demonstrated |
| Always-on-top, minimize/restore | Passed using Slack's existing preload bridge |
| All-Spaces setting | Flag set/read successfully; full-screen interaction not manually validated |
| Arbitrary main-process Node via `--inspect` | Unavailable in the tested build; corresponding fuse disabled |
| ASAR source modification | Guarded offline patch/repack passed; patched application execution not attempted |
| Original application signature | Deep/strict verification passed after experiments |

## Reproduce

Needs the tested macOS Slack installation, Python 3, and Node 22+ with built-in `fetch` and `WebSocket`. No npm packages are required. Run from this directory.

```sh
python3 scripts/inspect_slack.py --output evidence/installed-slack.json
npm test

# Quit Slack normally first. The launcher refuses to quit an existing process.
python3 scripts/lab.py start
npm run experiment
node scripts/native-window-experiment.mjs
npm run demo -- --capture
python3 scripts/lab.py stop

# Pipe experiment launches and terminates its own signed-out test instance.
node scripts/pipe-experiment.mjs
python3 scripts/lab.py stop

# Only creates a modified archive COPY under .lab/; never installs it.
python3 scripts/asar_patch_experiment.py
```

For hands-on use: start the lab, run `npm run demo`, and use the panel buttons, `⌘⇧Y`, and `Esc`. Ctrl-C restores its original window geometry. Then run `python3 scripts/lab.py stop`. Keyboard handling in this older synthetic demo is local to Slack; the live dev workflow has a native global shortcut.

The lab uses Slack's `--integrationTestMode` profile. **Do not replace that with `--user-data-dir`: our initial probe restored an existing workspace despite that flag.** The launcher refuses to overwrite a preexisting integration-test profile. Stop preserves lab profiles under ignored `.lab/` rather than deleting them. No normal Slack profile is moved or deleted by these scripts.

The socket-based experiments use a temporary loopback debugging port and verify the signed-out URL before injecting anything. The preferred production transport is the separately verified private pipe. The demo and test code are deliberately not installed into the user's daily Slack session. No LaunchAgent, login item, or recurring automation was installed.

## Repository contents

`scripts/inspect_slack.py` reads the application bundle, fuses, archive metadata, and signature. `scripts/cdp.mjs` supplies a small bounded CDP client. `scripts/experiment.mjs` tests mod behavior. `scripts/native-window-experiment.mjs` tests reversible window changes. `scripts/pipe-experiment.mjs` verifies the preferred transport. `mods/runtime.json` is the live versioned manifest; `src/mod-loader.mjs` implements capability checks, independent installation/removal and a compatibility ledger. Other files in `mods/` support the older synthetic experiments. The loader is not a sandbox for untrusted code or a guarantee of future Slack compatibility.

`.lab/` contains disposable profiles, logs, temporary extracted application code, and the patched archive copy. It is ignored and should not be committed or shared. `evidence/` contains local experiment results and screenshots; these artifacts are also ignored. Only its explanatory README is tracked.
