# Contributing to PimpMyElectron

Start with [SETUP.md](SETUP.md) to run the current checkout. Small bug fixes,
reproducible reports, accessibility improvements, and documentation corrections
are welcome. For a new host app or a substantial architectural change, open an
issue describing the intended behavior and platform requirements before building
an adapter around assumptions that may not hold.

## Development workflow

1. Fork the public repository and create a focused branch from `main`.
2. Reproduce the problem or describe the expected interaction. Record PME, host
   app, and macOS versions for app-specific behavior.
3. Make the smallest coherent change and add regression coverage where it protects
   behavior. Follow the existing JavaScript modules and Swift conventions; avoid
   unrelated formatting changes. There is no repository-wide formatter or lint
   command currently configured.
4. Run relevant checks below, and update the current guide if behavior changes.
5. Open a pull request explaining the problem, resulting behavior, validation,
   and any remaining compatibility limitations. Include a sanitized screenshot or
   short recording for visual changes when useful.

Ordinary PRs do not need a version bump, signing credentials, live production
access, or a release build. The maintainer assigns release versions and publishes
from a trusted Mac. Do not rewrite previously published release notes.

## Architecture map

| Path | Responsibility |
| --- | --- |
| `client/native/` | Native macOS manager, window lifecycle, Sparkle updates, launcher templates, and icon generation. |
| `client/ui/` | Manager web UI hosted by WKWebView. |
| `client/core/`, `client/service.mjs` | Validated app/mod selections, discovery, managed sessions, shortcuts, feedback, and service operations. |
| `client/catalog.json` | Bundled supported-app/mod metadata, versions, dependencies, and platforms. |
| `src/`, `src/renderer/` | Slack runtime, passive state observation, native navigation, triage rendering, and private control protocol. |
| `mods/runtime.json` | Slack renderer module manifest and required runtime capabilities. |
| `native/TriageController.swift` | Slack menu-bar helper, settings, shortcuts, previews, and native window integration. |
| `src/spotify/`, `scripts/spotify-host.mjs` | Spotify renderer/library bridge and inherited-pipe host. |
| `native/spotify/` | Spotify Menu Player and independent Camera Pause integration. |
| `scripts/` | Source launch/control, native builds, packaging, release tools, and historical live probes. |
| `test/` | Node test runner suites, fixtures, and native policy checks. |
| `services/feedback/` | Separately deployed Cloudflare Worker and GitHub issue submission protocol. |
| `docs/` | Current feature guides and implementation references. |
| `research/`, `evidence/` | Historical findings and local-only experiment artifacts. |

PME itself is a native macOS app with a bundled Node service. Slack is Electron;
Spotify is CEF. Shared transport or catalog code does not make their private
renderer APIs interchangeable.

## Testing

```sh
npm test
# Example focused regression suite:
node --test test/inbox-keyboard.test.mjs
# After changes affecting bundled code, native helpers, or packaging:
npm run client:build
npm run client:smoke
```

The standard test suite uses fixtures, mocks, temporary directories, and some
native checks; an Apple Silicon Mac with Command Line Tools is the full supported
development environment. Tests do not require signing in to Slack or Spotify.
The packaged smoke check verifies the copied runtime, service, and shortcut
resources without launching Slack. There is no checked-in GitHub Actions workflow;
report the commands and results actually run in your PR.

For native UI changes, also exercise the affected flow in the correct local
build. Check keyboard focus, Escape behavior, window transitions, and Reduce
Motion/Transparency where relevant. For observer changes, check new activity,
read/unread reconciliation, muted conversations, multiple workspaces, and hidden
views. Do not infer read state from missing data or retain optimistic state after
a failed native action.

Live probes are **not** part of `npm test`. Existing `test:live` and
`test:workspaces` scripts retain assumptions from earlier prototypes and are not a
universal acceptance suite. Read their code before running them. Use only accounts
and destinations for which you have explicit testing permission. Sends, read-state
changes, camera usage, and playback controls are real actions. Permission recorded
in an old experiment applies only to that experiment.

## Mod authoring and compatibility

The catalog is bundled and reviewed with the client. There is no external mod
marketplace, remote-code installation flow, or stable third-party plugin SDK yet.

For a supported app, add or update its entry in `client/catalog.json` and implement
the corresponding runtime behavior. `requires` there contains **mod IDs for that
app**; `modules` selects existing Slack renderer modules. Spotify integrations
currently use native/host routing instead of Slack modules. Metadata alone does
not implement a new mod or app adapter.

Declare a nonempty `platforms` array using `mac`, `windows`, `linux`, or `global`.
Use `global` alone, only if the implementation and dependencies support every
host. See [platform validation](docs/MOD-COMPATIBILITY.md). All currently shipped
mods and the client build are macOS-only.

Slack modules are separately declared in `mods/runtime.json`: `source` points to
the renderer file, `global` identifies its lifecycle object, and `requires` lists
**runtime capabilities**, not catalog mod dependencies. Review `src/mod-loader.mjs`
for validation and install/uninstall expectations. Make removal restore modified
UI/window state and clean up observers, timers, listeners, and styles.

A new host app also needs reviewed discovery/launch/control support in
`client/core/`, an entry in `app-support.mjs`, packaging resources, and tests.
Preserve independent operation of optional mods; Camera Pause must remain usable
without Menu Player. Check the explicit resource allowlist in
`scripts/build-client.mjs` whenever adding a runtime file.

## Data and security practices

- Keep everyday launches on private inherited pipes; do not add a network debugger
  listener or make arbitrary evaluation available through normal controls.
- Validate operation names, destinations, sender identity, and bounded payloads at
  bridges. Do not turn catalog or shortcut data into executable paths or commands.
- Slack background observation must remain passive by default. User-triggered
  native actions can make normal host requests; do not introduce polling or
  credential extraction to fill gaps in cached data.
- Treat messages, names, artwork metadata, and feedback as untrusted content.
  Preserve safe rendering and link handling.
- Never commit profiles, tokens, private keys, session captures, or unredacted logs.
  Ignored directories are not a substitute for reviewing a diff and attachments.

Bug reports and in-app feedback create **public** issues. Supply reproduction
steps and sanitized diagnostics, not account data. Do not publish exploit details
or credentials in a normal issue; use GitHub private vulnerability reporting if
available, or arrange a private channel with the maintainer first.

The production feedback endpoint is included in local builds too. Do not send
routine automated tests to it: use mocked tests or a separately configured staging
service. [Feedback service instructions](services/feedback/README.md) are for
contributors changing that service; Cloudflare/GitHub App credentials are not
needed to work on the ordinary client.

## Documentation and releases

Keep current instructions in the root guides and `docs/`. Put dated experiments
in `research/`, with the tested versions and limits. Do not promote a one-machine
experiment into an unconditional compatibility claim. Evidence containing account
content remains local.

`client/version.json` controls the distributed app version and increasing build
number; `client/catalog.json` versions the catalog and mods separately.
`package.json` and `mods/runtime.json` describe the Slack runtime/module versions.
They need not equal the client version. Coordinate relevant version changes with
the maintainer rather than changing every number together.

Release maintainers follow [CLIENT-RELEASES.md](docs/CLIENT-RELEASES.md#maintainer-release-workflow):
commit the intended source and release notes, build and test signed artifacts,
notarize/staple, then publish verified assets and the signed update feed. Pushing a
commit does not automatically create a release.

## Contribution license

Submit original contributions under **MPL-2.0**, the project's existing license.
You retain copyright in your contributions. Only submit material you have the
right to license, and identify any third-party code and its original notices for
review. Do not replace a third-party license with the project's license.

The repository-wide notice in [COPYING](COPYING) covers original PME files;
[LICENSE](LICENSE) contains the unmodified MPL 2.0 text. When extracting files for
another distribution, preserve their licensing information. A source comment such
as `SPDX-License-Identifier: MPL-2.0` can keep the license clear for standalone code.

Distributing modified covered files requires making their source available under
MPL and informing recipients where to obtain it; it does not require sending a PR
here. Release builds include the license and source-location notice. Keep those
notices and the bundled dependencies' license files in redistributed apps and
shortcuts. See [Mozilla's FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) for details.
