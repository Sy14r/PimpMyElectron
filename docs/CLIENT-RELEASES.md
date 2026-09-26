# PME client releases

PME Client is a native macOS mod manager with a bundled Node runtime and native
helpers. It supports Apple Silicon, macOS 13.3+, and the official Slack and Spotify
apps, which must be installed separately. Slack uses the everyday private-pipe
controller with developer evaluation and custom background API polling disabled.
Spotify Menu Player uses native macOS Automation and a private inherited-pipe library bridge; see [Spotify setup](SPOTIFY-MENU.md).

## Install and update

Download the versioned ZIP from [GitHub Releases](https://github.com/Sy14r/PimpMyElectron/releases),
extract it, and move **PimpMyElectron.app** into Applications. The repository and release downloads are public. Node, a compiler, and a clone are not
needed to run it. macOS performs its normal signed-app first-open check.

Choose Slack, enable Slack Triage, and click Launch Slack. Quit any existing Slack
session normally first. Use Add app if the desired official Slack installation is
outside Applications. PME uses a separate Slack sign-in profile. Existing source
users can use **Import existing setup** and choose their PME repository on the
same Mac to reuse ownership/settings and their existing integration sign-in.
Import does not copy Slack credentials or replace existing destination settings.

For updates, stop the PME-managed Slack session from PME, quit PME, replace the
app in Applications, and reopen it. Settings live outside the app at
`~/Library/Application Support/PimpMyElectron/`. Version 0.5.0 adds Sparkle update checks and installation on request; see [Client updates](CLIENT-UPDATES.md).
Closing the manager alone intentionally leaves a running modded Slack session up.

## Launch shortcuts (client 0.2.0)

On the Slack page, choose **Create shortcut…** beside **Launch Slack** (or **Open inbox** while running). Save it in
`~/Applications` (the default) or another folder you own. Finder and Spotlight
recognize it as an app; it can also be dragged onto the Dock. Its default name is
**Slack — PME**. Launching it runs PME's bundled service in the background and
never opens the manager window.

A shortcut saves the chosen Slack installation and enabled mod IDs. Changing the
manager's selection later does not change existing shortcuts; **Update selection**
copies the current selection into that shortcut. It uses the mod implementation
shipped with the installed PME version, not an archived copy of old mod code.
Settings/sign-in remain shared with the normal PME-managed Slack session.

A matching running session is brought forward. An ordinary Slack session or a
PME session with different mods is left alone, with an explanation to stop it first.
Concurrent launches are serialized across the manager and shortcut processes.
Sessions started before 0.2.0 need one restart before selection matching is known.

PME checks saved shortcut locations when refreshing the manager. A shortcut deleted
or moved in Finder is shown as missing, with **Remove from list** to forget its
saved profile without needing the app to exist. If you moved it, launch it once
to reconnect instead. Restoring it to its saved location also clears the missing
state automatically. Removing a missing entry does not delete anything from Finder.

The **Manage shortcuts** section contains **Reveal**, **Update selection**, **Rename**, and **Remove**. Remove moves the
app to Trash and removes its saved profile. A Finder rename/move retains its
profile ID; launching it updates the displayed name/location in PME. If a copying
or sync tool strips extended attributes, recreate the shortcut. Profiles are
local to this Mac; copying only the shortcut app to another Mac is insufficient.

Slack shortcuts use a dark Slack tile with an orange PME plus badge. The icon is
built into the Slack launcher template before signing; creating a shortcut never
patches its icon or other signed resources. Previously created shortcuts retain
their original icon; recreate them to adopt the new one. Spotify shortcuts use a matching dark Spotify tile with the orange PME plus badge,
also bundled in a dedicated signed launcher template. Choose **Create shortcut…**
on the Spotify page to save **Spotify — PME.app** with the current mod selection.

The launcher template is an immutable nested app, signed and notarized with PME.
The saved profile is stored under the user's PME data folder, and an opaque UUID
is attached as a bundle-root extended attribute. Creation and renaming do not
change signed resources. The release pipeline signs the launcher before the outer
app and staples/validates both. The distributed launcher only runs a PME client
signed by the same Apple Developer ID team; it revalidates the app's sealed code
and resources before executing the bundled runtime. No arbitrary command or
script path can be supplied by a profile.

Keep PME installed. The shortcut checks `/Applications`, `~/Applications`, the
last-opened PME location, its creation location, and Launch Services for a compatible
signed client. Replacing PME at its usual location keeps shortcuts working; if you
move it to a custom location, open PME there once. Ad-hoc development launchers
accept only ad-hoc development clients; that fallback is absent for Developer ID
signed shortcuts.

## Versions

`client/version.json` is the client version/build/minimum macOS source of truth.
Increase `version` and `build` for each published release. It drives Info.plist,
About, the bundled runtime metadata, release tag, and ZIP filename. Tags are
`client-vX.Y.Z`; this separates client releases from the existing Slack mod/runtime
package version. `client/catalog.json` separately versions the bundled catalog
and its individual mods.

## Local release, GitHub distribution

This adapts the local Keychain workflow from SlackAssist/Ledge: build → Developer
ID sign → test → Apple notarization → staple → Gatekeeper check → GitHub Release.
Signing/notarization run on a trusted Apple Silicon Mac. GitHub stores the source,
tag, ZIP, checksums, and non-secret manifest. Signing credentials remain in the
local Keychain; no signing keys or Apple passwords are put into GitHub Actions.
This is a scripted local publisher, not an automatic release-on-push workflow.

Install Node 22+ and Apple Command Line Tools on the **build Mac**, authenticate
`gh` to this repository, and have a Developer ID Application certificate/private
key in Keychain. Configure a `notarytool` Keychain profile interactively if needed:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools \
  xcrun notarytool store-credentials pme-notary --team-id YOURTEAMID
```

Apple prompts for credentials; do not put passwords in chat, shell arguments, or
tracked files. An existing profile for the same Apple team, including
`ledge-notary`, can be reused without copying/exporting its credentials.

Set only identifiers in your shell:

```sh
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
export PME_SIGNING_IDENTITY='Developer ID Application: Your Name (YOURTEAMID)'
export PME_TEAM_ID=YOURTEAMID
export PME_NOTARY_PROFILE=pme-notary
```

Update version/build and write `client/releases/X.Y.Z.md`. Commit the source and
push main normally; release preparation rejects a dirty checkout. Then:

```sh
npm run client:release -- all --notes client/releases/0.1.0.md
```

This builds into an isolated `.lab/releases/` directory, never overwriting the
running development app. The builder verifies the pinned Node download checksum
and allowlists packaged source/resources; it does not copy `.lab`, profiles,
logs, signing credentials, or developer data. Node's license is bundled.

The pipeline signs Node, the Slack helper, Spotify Menu Player, and each app’s shortcut template first, then the outer app. All have
hardened runtime and secure timestamps. Only Node gets `allow-jit`; Spotify Menu Player and its containing native manager get
`com.apple.security.automation.apple-events`, required for the nested helper’s
Spotify permission request. The Slack helper and launcher templates have no extra entitlements. This is **not App Sandbox**: the manager
needs to launch and manage another application. Notarization does not certify the
safety or compatibility of Slack's private interfaces.

Before submission, the exact signed Node runs the repository tests and a packaged
runtime/service smoke check in temporary data directories. Signature checks verify
Apple's Developer ID certificate chain, team, hardened runtime, timestamps, and
expected entitlements on every executable. The manifest records source commit,
version/build, code-directory hashes, and archive hashes.

## Resume and inspect

Apple processing can exceed the initial 45-second wait. Pending status exits 2;
it is not failure or acceptance. Resume the **same** printed directory:

```sh
npm run client:release -- notarize /absolute/path/to/release-directory
npm run client:release -- publish /absolute/path/to/release-directory \
  --notes client/releases/0.1.0.md
```

Individual stages are also available with `prepare`, `notarize`, `publish`, and
`verify-download`. `npm run client:release -- --help` lists them.

An uncertain submission leaves `submission-attempt.json`; inspect Apple's history
before reconciling it. Never blindly delete that file and resubmit. A crashed
notarization process can leave `.notarization-lock`; confirm the process is gone
before removing the lock. Rejections retain Apple's log and produce no final ZIP.

Only Accepted submissions are stapled. The final ZIP is built **after** stapling,
then extracted and checked again with codesign, stapler, and Gatekeeper. Publish
verifies its hashes, pushes a non-overwriting tag pinned to the recorded source
commit, creates a draft GitHub Release, downloads and validates those exact assets,
and only then publishes. Rerunning publish verifies existing assets without
clobbering published releases. Do not distribute `notarization-upload.zip`.

The public release contains:

- `PimpMyElectron-X.Y.Z-macOS-arm64.zip`
- `appcast.xml` (signed update feed) and signed Markdown release notes
- `SHA256SUMS`
- `manifest.json` (provenance, hashes, and Apple submission ID; no secrets)

For broader deployment, also test a browser download on another Mac with normal
quarantine/Gatekeeper behavior. Local acceptance and a CLI download check do not
replace that separate-machine test. Intel builds are not offered in this version.

The release pipeline embeds pinned Sparkle 2.10.0, signs its framework and installer components before the outer app, and signs the final archive/feed using the `com.pimpmyElectron.client` Sparkle Keychain account. The app reads the latest release’s `appcast.xml` asset. Keep this feed asset on every future client release; publish only client releases as GitHub’s latest release.
