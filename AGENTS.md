# PimpMyElectron contributor guide

PimpMyElectron (PME) is a native macOS mod manager for supported desktop apps. The manager is Swift/WKWebView with a bundled Node service; Slack is Electron and Spotify uses CEF. Do not assume their adapters or private APIs are interchangeable.

## Sources of truth

- Read `README.md` for the product boundary and shipped mods, `SETUP.md` for current source workflows, and `CONTRIBUTING.md` before making architectural or release changes.
- `client/catalog.json` defines bundled apps and mod metadata. `mods/runtime.json` separately declares Slack renderer modules and runtime capabilities.
- Current behavior belongs in `docs/`. Treat `research/`, `evidence/`, `pilot/`, live probes, and experiment scripts as historical or scenario-specific unless current documentation says otherwise.
- All currently shipped builds and mods target Apple Silicon macOS 13.3 or later.

## Architecture

- `client/native/`, `client/ui/`, `client/core/`, and `client/service.mjs`: native manager, WKWebView UI, app/mod selection, managed sessions, shortcuts, feedback, and updates.
- `src/` and `src/renderer/`: Slack runtime, passive observation, native navigation/reply, triage, and renderer mods.
- `native/TriageController.swift`: Slack menu-bar helper, settings, global shortcuts, previews, and window integration.
- `src/spotify/`, `scripts/spotify-host.mjs`, and `native/spotify/`: Spotify bridge, Menu Player, and Camera Pause.
- `scripts/`: development, packaging, release, and historical probe tooling. `test/`: Node regression suites and native policy checks.
- `services/feedback/`: independently deployed feedback service; do not exercise production from routine tests.

## Development and validation

- Node 22+ is required. There are no npm dependencies to install and no repository-wide formatter or lint command.
- Run `npm test`; for focused work use `node --test test/<suite>.test.mjs`.
- After bundled runtime, native helper, or packaging changes, run `npm run client:build` and `npm run client:smoke` on a supported Mac.
- For source Slack development use `npm run doctor`, `npm run dev`, and the documented `dev:*`/`shell` commands in `SETUP.md`. A source reload does not update code already copied into a PME app bundle.
- Live scripts can send messages, change read state, control playback, or depend on old fixtures. Read them first and use only accounts and destinations explicitly authorized for the exact test.

## Change rules

- Keep changes focused and preserve optional-mod independence. A manifest or catalog edit alone does not implement behavior.
- Slack modules must install and uninstall cleanly, restoring changed UI/window state and removing observers, timers, listeners, and styles.
- Update current documentation and regression coverage when behavior changes. Do not rewrite published release notes or bump release versions unless coordinating a release.
- Preserve MPL-2.0 licensing and third-party notices. Do not commit profiles, credentials, signing material, raw account data, or unredacted captures.

## Security and compatibility

- Keep normal control on private inherited pipes; do not add an ordinary-mode debugger listener or arbitrary evaluation path.
- Validate bridge operations, senders, paths, destinations, and payload bounds. Treat host content and metadata as untrusted.
- Slack observation is passive by default. Do not add polling or credential extraction to fill cache gaps, and do not infer “read” or “empty” from missing observations.
- Private Slack/Spotify interfaces can change. Record tested app versions and avoid turning one-machine observations into unconditional compatibility claims.
