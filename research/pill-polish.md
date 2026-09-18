# Centered unread pill — 0.14.0

The 12px resting strip and 44px expanded pill share the vertical center of the
selected display's work area, on either edge. Their height grows with the active
unread count. Count changes and display changes recenter them. Existing window
restoration and all-Spaces behavior remain in place.

One dot represents one observed unread conversation or thread, as chosen for this
workflow. Done and Later are excluded; a read pinned item contributes no dot.
The selected workspace scope applies, while queue text searches and filters do
not hide unread pill items. The strip displays 48 dots at most, followed by an
explicit +N overflow count. The expanded list contains every matching item and
scrolls after roughly twelve visible badges.

Badges use initials, a stable color, and a DM/channel/thread/group-chat symbol.
Their native Chromium tooltip includes the destination name, kind, workspace,
and most recent cached message (up to 260 characters). Missing previews are
identified explicitly. These are cached previews, not necessarily the first unread
message. Tooltip timing and appearance follow the native client. Names and
messages are assigned as text, never parsed as HTML.

Hovering only renders local state: no navigation, read marking, or custom API
requests. Clicking a badge follows the existing native chat flow, which can mark
read; Option-click opens the cached reader. Missing unread state remains unknown,
and the pill is limited to the observer's partial coverage.

## Validation

On September 18, 2026, tested inside the owned official direct-download Slack
4.52.155 dev client on Apple Silicon:

- Synthetic UI snapshots with 0, 1, 4 and 50 unread destinations on both edges:
  actual native bounds remained centered within half a point; dot/badge counts,
  overflow and footer visibility matched expectations.
- Live count changes resized and recentered the strip. Done, Later and read items
  were excluded, and queue search did not alter pill counts.
- Dispatched pointer events exercised delayed hover expansion/collapse. Routine
  snapshot updates preserved badge focus instead of moving it into the hidden queue.
- Tooltip attributes contained names, kinds, workspace names and literal cached
  preview text. Native tooltip appearance/timing still needs hands-on verification.
- Visually inspected a four-item expanded pill screenshot. Fixtures were confined
  to the triage renderer, and the real snapshot was restored afterward.
- Custom API request counter increased by **zero** during the fixture checks.
- All 71 automated tests passed. The existing live smoke check now also asserts
  centered compact window bounds alongside geometry restoration and all-Spaces flags.

The polish does not change observer coverage or introduce background fetching.

## Inactive hover and edge shape — 0.14.1

The empty strip is now 88px tall (previously 44px). Both compact views use a dark
surface with a flat screen-facing edge and rounded desktop-facing corners, plus
a subtle reveal fade when reduced motion is not requested. They remain centered.
This is styling within the existing opaque Slack window; it does not add native
transparency or a separate floating window.

During a reported failed hover, a live event probe recorded no pointer events in
the inactive Slack window. Compact views now also check the local pointer through
Slack's desktop screen bridge every 150ms. Only compact views query the pointer;
coordinates are neither persisted nor sent to the host or network. Hover intent
is shared with DOM events, so repeated samples do not restart the reveal delay.
Opening still waits 180ms and leaving waits 600ms, plus the sampling delay.
Hover updates the idle timer, and visibility/minimization guards prevent a hidden
window from being restored. Pending callbacks and the interval stop on disposal.

An isolated execution of the actual hover code passed cursor-only opening and
closing without any DOM events, repeated-sample coalescing, hidden/minimized
guards, and disposal checks. All 71 existing tests passed. The live geometry
smoke check now also requires the strip to be at least 88px tall. Visually checked
the new empty strip; physical hover/focus confirmation is requested from the user.
