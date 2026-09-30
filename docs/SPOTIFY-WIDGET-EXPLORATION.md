# Spotify widget: capability and UX exploration

> Design history: this document records experiments and alternatives, some of
> which were superseded. See [Spotify Menu Player](SPOTIFY-MENU.md) for current
> behavior and [SETUP.md](../SETUP.md) for development instructions.

Research date: September 24, 2026. This document preserves the original design
exploration. The user selected concept C; the native Mini Library is now implemented
and live-tested. See [current implementation and limits](SPOTIFY-MENU.md). The HTML
concepts remain simulated, including their optional features.

## Recommendation

Use a compact player on hover, with deliberate expansion into Search, Library, or
Queue. Keep the player visible throughout. Opening a browsing view holds the widget
open; moving the pointer away must not throw away a search. Escape moves back through
the current task before closing the widget. A pin explicitly keeps it open.

Prioritize choosing the next thing to hear and returning to work. Search, saved
playlists, liked songs, and a short queue are useful here. Full artist pages, editorial
feeds, complex playlist editing, social features, and multi-pane navigation would
turn the widget into another destination and should wait.

## Three interactive concepts

Open `mockups/spotify-widget.html` in a browser; `spotify-widget.fragment.html` is
the editable source used for the in-conversation preview. Everything uses sample
music and local simulated state. No Spotify account, playback, library, or network
request is connected to the prototype.

- **A · Controls + pins:** volume, seeking, shuffle/repeat, PME-local pinned tracks,
  a small local finder, quiet-volume preset, and a simulated pause timer. Lowest
  integration complexity. Pins are not Spotify likes; the finder is not full catalog search.
- **B · Quick switcher:** hover player, then Search, Library, or Queue in an expanding
  drawer. Search filters sample songs and collections; selecting a song returns to
  the compact player by default. Adding to queue keeps the current music playing.
  This is the recommended starting direction for a client-backed implementation.
- **C · Mini library:** browse playlists, albums, and liked songs with a reduced player
  above them. Open a collection and choose tracks without collapsing the browser.
  Better for browsing sessions; takes more space and attention.

The optional design controls compare width, corner radius, artwork visibility, and
whether picking a song returns to the player. The playback toggle, next/previous,
seek, volume, search, queue add/remove, collection drilldown, categories, and local
pins respond in the mock. The pause timer only displays simulated confirmation.

## What is actually available?

### Existing native bridge

The installed `/Applications/Spotify.app/Contents/Resources/Spotify.sdef` exposes
current track metadata, volume, playback position, shuffle/repeat, play/pause,
previous/next, and `play track` for a known URI with an optional context URI.
Only the existing Menu Player actions have been live-validated so far. Additional
dictionary operations still need behavioral tests, especially context playback and
shuffle/repeat on different content types. The dictionary cannot enumerate the full
library or perform catalog search.

We can add PME-owned pins, quick volume presets, and a timer around this bridge.
A local recent list would only contain items PME actually observed or launched;
it must not imply complete Spotify listening history. The current helper only reads
track state while the popover is visible.

### Injected client bridge: the preferred research path for richer features

The user is open to running custom code inside the official client. That changes the
capability ceiling substantially. Renderer access could let us use the same stores,
queries, commands, and subscriptions as Spotify's own UI. It does not require us to
limit the design to Apple Events or to a separately authorized Web API integration.

There is concrete precedent: Spicetify supports JavaScript extensions and custom
apps inside Spotify. Its [GraphQL wrapper](https://spicetify.app/docs/development/api-wrapper/methods/graphql)
documents client queries for search results and playlist resources. Its
[Platform wrapper](https://spicetify.app/docs/development/api-wrapper/methods/platform)
documents native player operations including queue add/remove and playback, while
warning that internal APIs vary across Spotify versions. Its
[Player wrapper](https://spicetify.app/docs/development/api-wrapper/methods/player)
also describes events and saved-track actions. These are community-maintained
interfaces, not Spotify's public API stability promises.

This supports a credible path to search, collection browsing, saving tracks, queue
management, and reacting to playback changes. It is not proof that PME already has
these capabilities on Spotify 1.3.1.234. Our current adapter does not inject code.
Spotify uses CEF; Slack's Electron injection mechanism cannot be assumed to transfer.
We have not installed Spicetify, patched Spotify, or enabled a debugger for this exploration.

“Arbitrary code” also does not mean “everything is already cached.” Catalog search,
unopened playlist pages, and library pagination may require the client to fetch data.
Server-side account, subscription, content availability, and authorization checks
still apply. Renderer access does not bypass those checks or automatically provide
access to every native process component.

The candidate design is a small client adapter that exposes narrowly defined
operations to the existing native popover: search, list a library page, open a
collection, play an item, save a track, and update the queue. Keep session credentials
inside the client; send only the UI data the widget needs. Reuse caches and events,
debounce searches, discard stale responses, paginate on demand, and avoid polling
or enumerating the entire library. Client-originated requests still count as requests.

### Public Web API: an alternative, not a prerequisite

Spotify's public [search](https://developer.spotify.com/documentation/web-api/reference/search),
[saved tracks](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks),
and [queue](https://developer.spotify.com/documentation/web-api/reference/get-queue)
endpoints cover portions of the same experience. That path introduces a separate
authorization lifecycle and API access constraints.

As of this review, [development mode](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
requires the owner to have Premium and limits new apps to five allowlisted users.
Broader distribution requires approval; the published partner requirements include
a registered organization and at least 250,000 monthly active users. This makes it
a poor default dependency for distributing a small PME mod. Existing apps may have
grandfathered limits. The [July changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)
increased client IDs per developer to 25 and counts development quotas per developer
account, superseding the earlier one-client-ID rule.

The [February endpoint changes](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
also constrain new development-mode experiences, including search page sizes and
playlist contents. Those constraints should not be confused with the separate
client-backed route above. We should not promise access through either route before
testing the specific operation.

## Next proof points before implementing the richer mock

1. Establish repeatable renderer access on the installed Spotify version. Compare
   an existing extension mechanism with a PME-owned adapter; document how updates,
   signatures, startup, and removal work. Do not assume permanent debugging access
   is required or acceptable merely because it is convenient for development.
2. Read current queue and one library page without navigating the visible Spotify
   window. Verify that the observed state matches Spotify.
3. Run one user-initiated search through the client's own query interface. Check
   cancellation, empty/error states, and whether opening the widget causes extra work.
4. Play a chosen result and add another result to the queue; confirm in Spotify.
5. Subscribe to changes and prove reconnect after renderer reload and app restart.
   Capability checks should disable only unsupported features, retaining native playback.

The UX prototype can be evaluated now, independently of these integration proofs.
Its interaction logic passed isolated DOM checks. Browser visual inspection was
not completed because the available browser tool rejected local-file navigation;
the inline preview remains available for user review.
