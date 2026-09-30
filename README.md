# PimpMyElectron

PimpMyElectron (PME) is a native macOS mod manager for extending supported desktop
apps. It discovers installed apps, lets you choose bundled mods, and launches the
official app with those mods active. It does not replace Slack or Spotify or patch
their signed application bundles on disk.

**Available for Apple Silicon Macs running macOS 13.3 or later.** Install the
official Slack or Spotify app separately. Spotify uses Chromium Embedded Framework
(CEF), rather than Electron; PME has a dedicated adapter for it.

[Download PME](https://github.com/Sy14r/PimpMyElectron/releases/latest) ·
[Install and update](docs/CLIENT-RELEASES.md#install-and-update) ·
[Develop from source](SETUP.md) · [Contribute](CONTRIBUTING.md)

## Included mods

| App | Mod | What it adds |
| --- | --- | --- |
| Slack | [Slack Triage](docs/SLACK-TRIAGE.md) | Edge strip, unread pill previews, keyboard-driven inbox, and native conversations, threads, compose, search, and Activity alongside the inbox. |
| Spotify | [Menu Player](docs/SPOTIFY-MENU.md) | Menu-bar player with artwork treatments, playback controls, Mini Library, search, and queue. |
| Spotify | [Camera Pause](docs/SPOTIFY-CAMERA-PAUSE.md) | Pause when selected apps use the camera, then resume after a configurable delay only if the mod paused playback. Works without Menu Player. |

Create app-specific launch shortcuts beside the Launch button, then put them in
Applications or the Dock. Shortcuts save their mod selection and use the installed
PME version. Manage them from the app's details page.

About PME includes **What's new** with bundled release history and **Share
Feedback**. Feedback is reviewed before submission and creates a public GitHub
issue without requiring a GitHub account. PME supports update notifications and
user-initiated installation through [Sparkle](docs/CLIENT-UPDATES.md).

## Development

The repository is public; cloning and local builds require no GitHub login,
Apple Developer membership, or release signing credentials. Source development
requires Node.js 22+; native builds also require Apple Command Line Tools on an
Apple Silicon Mac. There are no npm dependencies to install.

```sh
git clone https://github.com/Sy14r/PimpMyElectron.git
cd PimpMyElectron
npm test
npm run client:build
npm run client:smoke
npm run client:open
```

See [SETUP.md](SETUP.md) before launching mods: it explains the separate Slack
profile, app permissions, source versus packaged runtimes, and how to reload the
right instance. Read [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, testing,
mod metadata, and pull request guidance. The client bundles its runtime, so people
using a release do not need Node or a compiler.

## Boundaries

Mods run trusted code inside an authenticated app and rely on private interfaces
that app updates can change. PME is not affiliated with or supported by Slack or
Spotify. Platform labels describe compatibility, not a sandbox.

Everyday injected sessions use inherited debugging pipes rather than a listening
TCP debugger port. Slack's arbitrary evaluation and screenshot controls require
an explicit development-mode launch. Local socket permissions reduce exposure but
do not isolate code running as the same macOS user.

Slack Triage observes data Slack already fetches, with no custom background API
polling by default. Native navigation, read/unread actions, search, and sending
still cause Slack's normal requests. Coverage depends on available cached state;
it is not a complete independent synchronization client.

## Documentation

- [Contributor guide and architecture map](CONTRIBUTING.md)
- [Mod platform compatibility](docs/MOD-COMPATIBILITY.md)
- [Build, sign, notarize, and publish](docs/CLIENT-RELEASES.md#maintainer-release-workflow)
- [Update delivery and signing](docs/CLIENT-UPDATES.md)
- [Feedback service development and deployment](services/feedback/README.md)
- [Research archive](research/README.md) — dated experiments and earlier designs,
  not current setup instructions
- [Local evidence handling](evidence/README.md)

Current checkout behavior can be newer than the published app. Use the bundled
What's new screen or [versioned release notes](client/releases/) to see what a
particular release includes.

## License

Original PME code and accompanying project materials are licensed under the
[Mozilla Public License 2.0](LICENSE). See [COPYING](COPYING) for the scope,
source availability, and third-party exclusions. Distributed modifications to
covered files remain under MPL; separate files containing no covered code may
use other licenses. The license does not require contributing changes upstream.
