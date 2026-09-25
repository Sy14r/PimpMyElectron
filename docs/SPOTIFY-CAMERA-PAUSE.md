# Spotify Camera Pause

Camera Pause is a separate, opt-in Spotify mod. Enable it in PME and launch
Spotify, then open **Camera Pause settings…** to choose installed apps. With only
Camera Pause selected, PME can attach to ordinary Spotify; no Mini Library
connection, injected code, or Spotify restart is required. With Menu Player also
selected, both capabilities share one native helper, and Menu Player retains its
existing private-pipe launch requirements.

The settings window lists watched applications with their icons and bundle IDs.
A resume-delay slider sets the wait after camera use ends, from 0 to 30 seconds
in half-second steps (default: 1.5 seconds). The value persists alongside watched
apps; the original list-only settings format is migrated on the next save. For browser meetings,
choose the browser: all its camera use counts, including a preview before joining
a meeting. Camera Pause alone has a small camera menu-bar icon for settings. When
combined with Menu Player, settings are also accessible from the player's gear.
Shortcuts save either or both mods just like other PME selections.

Standalone acceptance was verified on macOS 26.6.2 with only Camera Pause
selected and ordinary Spotify running without the Mini Library bridge. Photo
Booth camera activation paused playback, camera shutdown resumed it after the
configured delay, and the camera menu-bar icon reopened settings. The same
pause/resume cycle was also verified with Menu Player enabled.

## Detection and limits

macOS's public CoreMediaIO running-state property exposes whether a device is in
use, but does not provide a general per-app attribution API. This implementation
reads a narrowly filtered local Control Center diagnostic stream:
`Active activity attributions changed to [...]`, keeping only `cam:` bundle IDs.
These are complete active snapshots; microphone-only and recent-use messages are
not camera triggers. It does not open cameras, record audio/video, inspect browser
tabs, or request camera, microphone, Accessibility, or Full Disk Access permissions.
Spotify control uses the existing macOS Automation entitlement and user consent.

The signal was observed on the development Mac running macOS 26.6.2. It is a
version-dependent diagnostic format, not an Apple compatibility guarantee.
Earlier macOS versions, managed logging restrictions, or future changes may make
it unavailable. No fallback equates a running app with camera use. The UI shows
unknown detection state; toggling the camera off/on once can establish a fresh
snapshot. A bounded one-hour history seeds initial state using only the latest
snapshot from the current Control Center process. Old snapshots cannot overwrite
new live events, and the history is not replayed as playback actions.

Only app identifiers are retained in memory. Diagnostic output is not saved to a
log. Selected app names and bundle IDs live in `runtime/spotify/camera-pause.json`.
The helper reconnects if the stream exits and suspends on sleep/session departure.

## Playback rules

- Pause only when at least one selected app is reported using its camera and
  Spotify is playing. An already-paused track never creates resume ownership.
- Remember ownership only after the pause command succeeds and Spotify confirms
  the paused track and position. Allow up to three seconds for Spotify to report
  the new state after acknowledging the command. Ownership lives in memory, never across restarts.
- Wait the configured delay after the last selected app stops, then resume only if Spotify
  remains paused on the same track near the saved position. A second selected app
  keeps the camera session active, and a renewed camera session cancels the delay.
- Observed manual playback, track changes, seeks, stopped Spotify, lost detection,
  sleep, settings changes, and helper shutdown cancel pending auto-resume.
- **Keep Spotify paused** cancels auto-resume explicitly. A redundant manual Pause
  command while Spotify is already paused is indistinguishable from no change;
  the mod cannot detect that intent. Rapid changes between one-second playback
  observations can also be missed. Use Keep Spotify paused for an explicit veto.
- Playback checks run only during a selected camera session or pending resume;
  camera-off idle monitoring makes no Spotify playback queries. No Web API polling.

## References

- [Apple: DeviceIsRunningSomewhere](https://developer.apple.com/documentation/coremediaio/kcmiodevicepropertydeviceisrunningsomewhere)
- [Apple: camera extension attribution](https://developer.apple.com/videos/play/wwdc2022/10022/)
- [Entracte's macOS 26 diagnostic investigation](https://github.com/drmowinckels/entracte/issues/113)
- [AVIndicator's documented per-app camera limitation](https://github.com/xbsd/avindicator#known-limitations)

The implementation is original; no third-party monitoring code is incorporated.
