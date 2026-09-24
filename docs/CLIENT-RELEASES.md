# PME client releases

PME Client is a native macOS mod manager with a bundled Node runtime and native
triage helper. This first release supports Apple Silicon, macOS 13.3+, and the
official Slack app. It does not contain Slack itself. The client always launches
mods through the everyday private-pipe controller, with developer evaluation and
custom background API polling disabled.

## Install and update

Download the versioned ZIP from [GitHub Releases](https://github.com/Sy14r/PimpMyElectron/releases),
extract it, and move **PimpMyElectron.app** into Applications. Repository access is
required while this repository is private. Node, a compiler, and a clone are not
needed to run it. macOS performs its normal signed-app first-open check.

Choose Slack, enable Slack Triage, and click Launch Slack. Quit any existing Slack
session normally first. Use Add app if the desired official Slack installation is
outside Applications. PME uses a separate Slack sign-in profile. Existing source
users can use **Import existing setup** and choose their PME repository on the
same Mac to reuse ownership/settings and their existing integration sign-in.
Import does not copy Slack credentials or replace existing destination settings.

For updates, stop the PME-managed Slack session from PME, quit PME, replace the
app in Applications, and reopen it. Settings live outside the app at
`~/Library/Application Support/PimpMyElectron/`. There is no automatic updater yet.
Closing the manager alone intentionally leaves a running modded Slack session up.

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

The pipeline signs Node and the native helper first, then the outer app. All have
hardened runtime and secure timestamps. Only Node gets `allow-jit`; the native
client/helper have no extra entitlements. This is **not App Sandbox**: the manager
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

The private release contains:

- `PimpMyElectron-X.Y.Z-macOS-arm64.zip`
- `SHA256SUMS`
- `manifest.json` (provenance, hashes, and Apple submission ID; no secrets)

For broader deployment, also test a browser download on another Mac with normal
quarantine/Gatekeeper behavior. Local acceptance and a CLI download check do not
replace that separate-machine test. Intel builds are not offered in this version.
