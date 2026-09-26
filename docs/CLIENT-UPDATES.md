# Client updates

PME 0.5.0 integrates Sparkle 2.10.0 into the native AppKit manager. The repository,
feed and release assets are public; no GitHub login/token is needed. Users of
0.4.0 or older must manually install an updater-enabled build once.

## Behavior

- Check daily while PME runs. Change automatic checks in the PimpMyElectron menu.
  Shortcut-only sessions do not check independently when the manager is absent.
- Check manually from the application menu or About PME → Check for Updates.
- Sparkle shows release notes, skip/later options and install controls. No
  unattended download/install is enabled. It validates the signed archive before
  extraction, replaces the app and relaunches it.
- Before replacement, stop mods in PME and quit managed Slack/Spotify sessions
  normally, then retry Install and Relaunch. PME refuses to install while those
  sessions run; it does not force-quit host apps or discard drafts. Launch mods
  again through PME or a shortcut after updating.
- Settings, sign-ins and shortcut profiles remain outside the bundle. Camera
  Pause does not preserve auto-resume ownership across helper shutdown.

The runtime checks active helpers and inherited-pipe hosts under the same lock
used by shortcuts. A temporary update gate prevents new sessions during
replacement. A newer client clears it at startup; cancellation clears it for the
owning runtime. An interrupted gate expires after ten minutes.

## Build and publish

`client/updater.json` pins Sparkle's version/checksum, feed URL, public signing key
and Keychain account name. The builder embeds the framework with preserved
symlinks and its license. The release pipeline signs its installer components,
framework and PME with Developer ID and notarizes the complete bundle.

After stapling and ZIP verification, the publisher generates an appcast and
signs the archive, Markdown notes and feed with Sparkle's Ed25519 key. Its private
key remains in the release Mac's Keychain under `com.pimpmyElectron.client`.
Back it up securely; never commit it or put it in a log.

The stable feed is
`https://github.com/Sy14r/PimpMyElectron/releases/latest/download/appcast.xml`.
Every release includes a complete signed feed pointing to versioned assets. The
draft is downloaded and verified before publication as latest. Future latest
releases must keep this feed asset. Edits to a signed feed or notes invalidate
the signatures. The numeric build in `client/version.json` determines update
ordering; increment it for each release. Preserve the signing keys and Apple team
so existing clients continue to trust updates.

## Validation

Automated checks cover active-session refusal, background-host detection,
process-inspection failure, cancellation, gate expiry, new-build recovery and
serialization with shortcut launches. Distribution checks verify nested code,
notarization, archive hashes, signed feeds and the packaged runtime. Use an
isolated older signed app and signed feed for live installation testing.

## References

- [Sparkle setup and signing](https://sparkle-project.org/documentation/)
- [Programmatic AppKit integration](https://sparkle-project.org/documentation/programmatic-setup/)
- [Appcast publishing and informational updates](https://sparkle-project.org/documentation/publishing/)

Implementation: 2026-09-26.
