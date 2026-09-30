# Spotify Menu Player and Mini Library

The native menu-bar widget controls the official Spotify Mac client. Hover for
now-playing and transport controls; deliberately expand into Library, Search, or
Queue. This implementation was live-tested with Spotify 1.3.1.234 on Apple Silicon.
Spotify uses Chromium Embedded Framework, rather than Electron, so PME supplies a
separate adapter while retaining the same app/mod/shortcut workflow.

## Use

Quit Spotify normally once, select Spotify in PME, enable Menu Player, then choose
Launch Spotify. PME launches the signed official app with a private inherited pipe
and installs the Mini Library bridge in memory. Your existing sign-in is reused.
An ordinary Spotify process that is already open is left alone: the manager asks
you to quit it first.

The menu helper can take up to 60 seconds to become ready on first launch.
PME waits for its control endpoint without launching duplicate helpers. Startup
stages and failures are appended to `runtime/spotify/launcher.log` in the PME
data folder, including when the launch came from a shortcut.

Hover over the Spotify menu-bar icon to reveal the player. Move into it to interact;
move away to dismiss the compact player. Clicking the icon toggles it as well.
Library, Search, or Queue expands to a taller browser with a compact player above.
The header, artwork, tab body, and native window resize together over 240 ms.
AppKit’s automatic popover animation is disabled so it cannot compete with the
resize driver. The track header keeps fixed text metrics and scales the cover from fixed bounds,
so titles do not rewrap during the transition. Its text block shrinks by 6% in
the expanded view using a rendered scale, not changing font layout. The artwork wash stays anchored.
Animation state is separate from library data to avoid invalidating every row on
each tick. Closing a tab keeps its content in place while it recedes; switching between
open tabs does not resize the player. macOS Reduce Motion disables the resize
animation. While browsing, moving the pointer away does not dismiss the widget. Click outside
or use Close to dismiss it. Pin prevents the compact player from dismissing on
pointer exit. Escape clears a search, backs out of a collection, returns to the
compact player, then closes it.

- **Library:** All, Playlists, Albums, and Liked songs. Open a collection to see its
  tracks. Load more fetches another page of 30 items.
- **Search:** type to find songs, albums, and playlists. Searches wait 350 ms after
  typing stops. This first version shows up to eight results of each supported type.
- **Queue:** shows up to 40 upcoming tracks. Add a song from the library or search
  with its queue button. Selecting a song starts playback through Spotify; album
  and playlist selections retain the collection context.
- **Player:** artwork, track/artist/album, elapsed time, previous, play/pause, next,
  shuffle, repeat, and Open Spotify. Repeat cycles off → album/playlist → single
  track → off (skipping modes Spotify does not allow for the current content).
  Enabled modes are green; single-track repeat uses the “1” icon. The controls
  stay in sync with changes made in Spotify and work with its main window minimized.

Allow the macOS Automation request when first opening the widget. If previously
denied, enable Spotify under PimpMyElectron in System Settings → Privacy & Security
→ Automation, then choose Allow Spotify control again. The mod needs no Accessibility
permission.

Closing PME leaves the widget and bridge running. Stop widget stops only the
companion, preserving Spotify playback and its pipe owner. Launching again from
PME reuses that host. Quitting Spotify ends the host and hides the menu icon.
To restore library features after quitting Spotify, launch it through PME or a saved
PME shortcut; launching Spotify directly only restores basic Apple Events controls
while the companion remains running. Stop the widget in PME before relaunching that
ordinary session through PME. There is no login item or automatic installation.

## Mini player settings

Open the gear menu beside Pin and Open Spotify. Preferences are saved locally in
macOS defaults for `com.pimpmyElectron.spotify-menu` and survive widget restarts.

- **Artwork treatment:** Ambient wash softens the current cover into a colored
  background; Artwork bleed keeps the enlarged artwork recognizable; Gallery glow
  concentrates the color behind the cover and fades it across the player. The
  expanded browser uses the treatment in its header and keeps the list solid.
  Playback accents are derived from the cover. Missing artwork uses the neutral
  player background.
- **Open on hover:** on by default, with clicking also supported. Turn it off to
  require a click. In click-only mode moving the pointer away does not dismiss the
  player; click outside, close it, press Escape, or click the menu-bar icon again.
- **Dismiss after pointer leaves:** a 0.1–5 second slider, defaulting to 0.45
  seconds. Applies to the unpinned compact player in hover mode. Returning to the
  player cancels the countdown. The slider is disabled in click-only mode; settings
  and browsing views stay open while in use.
- **Pin:** suppresses pointer-exit dismissal in hover mode. It is not an always-on-top
  setting and does not override outside clicks, Close, or Escape. Browsing views
  already stay open on pointer exit; Pin is redundant in click-only mode.

Artwork is downsampled to at most 180 pixels and prefiltered once on a background
queue when the cover changes, with a bounded cache. It does not use live window
blur, desktop translucency, or continuous image processing during playback.

## Integration and boundaries

- The official Spotify bundle and sign-in profile are not patched or copied.
  Signature and bundle identity are verified before launch.
- No TCP inspector port is opened. The Node host owns inherited Chromium pipe
  descriptors; closing the pipe terminates Spotify, so the host lives for that
  Spotify session even if the widget stops.
- The injected adapter discovers Spotify's library, playlist, player, and GraphQL
  services. Library/search requests use those client services on user action and
  may cause normal authenticated Spotify network requests. This is not a claim of
  zero additional requests. There is no separate Web API login or copied token.
- Responses are normalized to bounded music metadata. The menu process receives
  no session credentials or general client objects. A private `bridge.sock` (0600,
  in a 0700 directory) accepts only validated library/search/queue/play actions;
  it never accepts executable source, scripts, URLs, or arbitrary CDP commands.
  Other processes running as the same macOS user can still invoke its allowed
  actions; Unix socket permissions do not isolate same-user applications.
- The injected bootstrap and each bridge action are restricted to Spotify's
  top-level `https://xpui.app.spotify.com` renderer. Spotify navigation/reloads
  trigger reconnection. The adapter rediscovers the native album query descriptor;
  the search query descriptor comes from the installed client resource, not a
  hard-coded query hash tied to one version.
- There is no background library/search polling. Repeated read requests use a small
  20-second in-memory cache. Playback metadata uses local Apple Events while the
  widget is visible, at most once per second and one request at a time.
- Images load only from allowlisted Spotify HTTPS artwork hosts with bounded
  downloads, redirect restrictions, and ephemeral sessions. The widget does not
  persist music metadata or artwork. Runtime logs may contain Spotify's own
  diagnostics and remain local in PME's private data directory.
- A separate helper socket exposes only status/show/stop. Automation permission is
  attributed to PME because the helper is nested. Both declare the entitlement and
  usage description; Node, launchers, and the Slack helper retain their previous
  entitlement boundaries. See [Apple's explanation](https://developer.apple.com/forums/thread/751802).

## Current limits

Spotify's internal APIs are private and may change. A client update can break
library/search support independently of basic Apple Events playback. Errors remain
in the widget rather than falling back to a public debug port or patching Spotify.
This first version does not include queue reordering/removal, playlist editing,
artist pages, folders, local files, saved shows, complete catalog pagination, or
all of the optional controls demonstrated by the mock. Queue data refreshes when
opened; it is not yet a continuously subscribed queue view.

Mini Library implements concept C from the [design exploration](SPOTIFY-WIDGET-EXPLORATION.md).
The HTML mocks remain simulations; this native widget is the working implementation.
