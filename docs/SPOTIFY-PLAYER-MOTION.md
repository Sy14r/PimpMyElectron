# Spotify player motion research

> Design history: this document records experiments and alternatives, some of
> which were superseded. See [Spotify Menu Player](SPOTIFY-MENU.md) for current
> behavior and [SETUP.md](../SETUP.md) for development instructions.

Researched 2026-09-24 after live user testing still found stuttering and incorrect
scaling in the compact ↔ tab transition. Compilation and endpoint screenshots do
not validate motion quality. No further runtime changes were made for this research.

## A concrete conflict in our current implementation

`native/spotify/SpotifyMenu.swift` sets `popover.animates = true`. Its
`resizePlayer` also uses a 60 Hz timer to assign intermediate `contentSize` values
and publish intermediate SwiftUI layout values. Apple documents that changes to
`contentSize` animate while the popover is shown when `animates` is enabled. The
SDK also calls animation behavior a hint, not a guarantee.

Thus our claimed single animation driver is not actually exclusive: AppKit may
animate the geometry that our timer is already interpolating. Repeated retargeting
is a strong candidate for the lag between artwork, content, and window edges. It
is not yet established as the sole cause by a controlled runtime comparison.

Sources: [NSPopover.contentSize](https://developer.apple.com/documentation/appkit/nspopover/contentsize),
[NSPopover.animates](https://developer.apple.com/documentation/appkit/nspopover/animates),
and the installed macOS SDK's `NSPopover.h`.

## Approaches used elsewhere

Apple discusses timing inconsistencies when mixing SwiftUI and AppKit animation
implementations. Its unified `NSAnimationContext.animate(SwiftUI.Animation, …)`
API is available on macOS 15+, verified in the local SwiftUI SDK interface. PME
currently supports macOS 13.3, so that API alone is not our portable solution.
[Apple: Unifying your app's animations](https://developer.apple.com/documentation/swiftui/unifying-your-app-s-animations)

Boring Notch creates a transparent NSPanel with a configured window size. Its
SwiftUI content owns the open/closed animation. Compact and expanded artwork use
the same `matchedGeometryEffect` ID/namespace, maintaining a shared visual
identity between their two layouts. This is a source-code reference, not a claim
that we have installed or benchmarked that app.

Sources: [window creation](https://github.com/TheBoredTeam/boring.notch/blob/main/boringNotch/boringNotchApp.swift),
[compact composition](https://github.com/TheBoredTeam/boring.notch/blob/main/boringNotch/ContentView.swift),
[expanded artwork](https://github.com/TheBoredTeam/boring.notch/blob/main/boringNotch/components/Notch/NotchHomeView.swift).

NotchKit explicitly separates the native window from the animated surface. Its
window stays at expanded size; a shape reveals fixed-layout content inside it.
It delays incoming content, retains outgoing content until collapse finishes,
and guards delayed teardown against rapid reversal. Its architecture notes also
explain the resulting transparent-area hit-testing and shadow responsibilities.
These are design choices from that project, not universal AppKit requirements.
[NotchKit architecture](https://github.com/duongductrong/NotchKit/blob/master/docs/architecture.md)

## Recommended experiments

1. Establish a controlled baseline with a fixed cover and a long title. Compare
   the current transition against the same transition with AppKit's automatic
   popover animation disabled. Change only that variable. This diagnoses the
   competing drivers; it is not an automatic claim of a complete fix.
2. Prototype a separate native fixed-size transparent panel with one declarative
   SwiftUI transition. Keep the player surface anchored under the menu icon;
   animate its visible shape, use matched geometry for artwork, and reveal the
   library beneath the header. Keep text at stable endpoint layouts rather than
   continuously changing font metrics and wrapping width.
3. Compare both in motion, including rapid open/close reversals. Use frame timing
   and rendered geometry observations as well as user review. Static screenshots
   only validate endpoint layouts.

For the fixed-panel option, explicitly prove pointer alignment near screen edges,
click-through outside the visible shape, search-field keyboard focus, nested
settings popovers, hover dismissal, multiple displays/Spaces, and Reduce Motion.
Do not assume returning nil from an NSView hit test automatically forwards clicks
to another application's window. Do not add synthetic click replay or new input
permissions to solve this incidentally.

The native shell would change; Spotify integration, playback, library data,
settings persistence, and precomputed artwork can remain. The current arrow and
shadow are supplied by NSPopover and would need an explicit implementation.
A panel prototype should demonstrate the desired motion before replacing the
live player or publishing another release.

## Experiment result and selected implementation

The native Motion Lab uses the actual player views, generated local cover art,
a fixed long title, and a fixture transport instead of Spotify. Its controls
compare A (current timer plus AppKit animation), B (same timer with AppKit
animation disabled), and C (a fixed transparent panel with matched artwork
geometry). Build with `node scripts/build-spotify-motion-lab.mjs`. The lab is
separate from the release build.

In the first native geometry run, A sampled 14 distinct window heights across
expansion/collapse and reached full height around 289 ms; B sampled 29 and reached
full height around 243 ms. C retained one window height. This is a single ordered
run, subject to warm-up and scheduling effects, not a rendered-FPS benchmark or
proof of a general performance difference. Samples were recorded to the local
temporary `pme-motion-results.json` file.

The user compared the lab and explicitly selected B as the originally expected
behavior. Production now disables `NSPopover.animates` and retains the existing
240 ms driver. Text uses a subtle 1.0 → 0.94 rendered scale with fixed line breaks.
The fixed-window option remains a prototype; its complete interaction and
multi-display acceptance checks were not completed because it was not selected.
