# Sidebar Productivity

Sidebar Productivity is an optional renderer mod for Slack's ordinary sidebar.
It can run alone or alongside Slack Layout, Triage, Appearance, and the other
bundled mods. Unified Sidebar, destination hiding, cached preview, Open action,
and Reply action each have independent toggles.

## Capabilities

- Switch between Slack's Classic view and a Unified Sidebar that groups and
  orders only the native rows Slack has already mounted. Starred destinations
  sort first, followed by latest observed activity and stable native order.
- Create up to 20 workspace-scoped groups, assign destinations directly or by
  local name rules, collapse groups, and recover rule exclusions deterministically.
- Use the compact hamburger beside Slack's native settings and compose controls
  to switch between Classic view and Unified Inbox, open **Group rules…**, or
  review **Apply groups to Slack…** without crowding the sidebar header. The
  same menu can copy a privacy-safe rendering diagnostic for bug reports.
- Use **Group rules…** to copy or import a bounded rules-only JSON template.
  Templates contain group names and matching rules, never workspace/channel IDs
  or memberships.
- Review **Apply groups to Slack…** before PME uses Slack's own Create section
  and Move channel menus. Native apply includes channels only (not DMs), caps a
  run at 200 steps, verifies each result, and stops at the first failure.
- Hide channels, DMs, apps, or entire sections from a hover/focus control and
  restore them from **Hidden items** at the bottom of the sidebar.
- Hide Slackbot independently of the organizer.
- Independently enable the Compact strip, narrow-window Auto-hide, and
  Conversation-only small-window behaviors, with separate bounded thresholds.
- Hover or keyboard-focus a visible destination to preview one latest message
  already present in Slack's bounded renderer cache.
  If the author avatar resource is already loaded, the preview reuses it; PME
  does not call `users.info` or fetch an avatar to fill a cache miss.
- Independently show **Open** and **Reply** in the destination action card, even
  when cached previews are disabled or the destination has no cached message.
  Open uses the exact mounted Slack destination control rather than a generic
  row button and navigates the main desktop conversation view. Reply asks
  Slack's desktop window handler to open the same-origin conversation in a
  separate Slack window and focuses its real composer when available. A new
  reply window begins as a hidden blank child. PME verifies its Slack opener
  and bounded reply marker, installs a document-start cover, and only then
  navigates once to the final conversation route. Slack reveals the child
  behind that single uninterrupted cover, which is removed only after the exact
  destination composer mounts. It never exposes full Slack on a timeout. The
  dedicated window also removes Slack's workspace rail, conversation sidebar,
  global search/history/help bar, and PME navigation overflow so the remaining
  surface is focused on the requested conversation and its composer. If the
  early handshake is unavailable, the child remains hidden until the composer
  is ready rather than exposing an intermediate route. While that window
  remains open, Reply reuses one window per workspace and switches through
  Slack's already-mounted child sidebar instead of booting another renderer.
  If the row is not mounted, PME first offers the child an ordinary same-origin
  Slack link so Slack's own router can handle it without a document restart;
  it falls back to the exact route only if that handoff does not advance.
  It does not navigate, reload, cover, or disable the main Slack window. PME
  never inserts or sends text.
- Optionally keep one hidden reply renderer warm for the active workspace. It
  is seeded from the conversation already open—not the hovered destination—so
  a later Reply can reuse a booted Slack document. This is off by default
  because the speed improvement costs additional memory.

Configure the mod from its dedicated PME card. When Slack Companion is available,
the same controls appear in its native Slack Settings window and apply immediately.
Keyboard focus previews immediately; pointer hover uses the configured delay.

## Privacy and read behavior

There is no history fallback, API polling, credential access, synthetic cache
fill, section expansion, or hover prewarming. Background navigation occurs only
when **Keep quick-reply window warm** is explicitly enabled, and then only to
seed a hidden renderer from the conversation already open. Unified Sidebar never claims
to include destinations Slack has not mounted; its heading labels the count as
mounted. If a destination has no cached message, the action card says so without
filling the gap; enabled Open and Reply actions remain available. Merely showing
a cached preview or action card does not navigate or mark a conversation read. Choosing
Open or Reply uses Slack's native navigation and therefore has Slack's normal read
behavior.

The Reply action is local to ordinary desktop Slack. It does not enter, resize,
collapse, or otherwise change the Triage inbox or pill state. Slack creates and
owns the child `BrowserWindow`, its same-origin conversation route, and its native
composer; PME does not clone the editor or implement a sending path. The window
contract is a private Slack desktop interface, so PME fails visibly without
navigating the main window if Slack stops accepting it in a future build. If the
requested destination is not mounted in an already-open child, PME reloads that
child at the exact conversation route; it still never reloads the main window.

Native section apply is the one explicit mutation in this mod. It runs only
after a plan is shown and the user confirms it. PME drives Slack's own visible
menus, does not classify channels, and does not make Slack API calls. Creating
or moving a native section is an ordinary Slack account change and can therefore
appear in the user's other Slack clients. Reopen the review to rescan after a
partial run.

Destination hiding and Unified Sidebar store only stable rendered destination
identifiers, short labels, group names, and local matching rules
in the local PME Slack profile, scoped by workspace. It never stores message
content. The preview is removed when it closes.

## Composition and recovery

Slack Layout owns the rail, channel header, thread width, message toolbar, and
minimal top bar. Sidebar Productivity owns Unified Sidebar, destination hiding,
and responsive sidebar behavior. Triage remains a separate cross-workspace inbox;
it is not the browser extension's Unified Inbox. Both suspend their transformations
while Triage frames a native conversation or switcher, and both can be disabled
independently.

When Unified Sidebar is active, destination hiding uses normal flex reflow rather
than Slack's virtual-list translation. Generated group headings have a fixed flex
basis so they cannot collapse underneath conversation rows. **Copy diagnostics**
records only mod version, active modes, element counts, coarse dimensions and
overlap counts. It excludes workspace IDs, channel IDs, names, group definitions,
messages and credentials.

Existing Slack Layout and Sidebar Peek selections migrate once. Existing hidden
destinations keep using the same local storage key. A prior Layout selection keeps
the organizer and responsive settings; a prior Peek selection keeps previews.
Turning Hide controls off restores saved destinations visually without deleting
the recovery list, so turning it back on restores the chosen organization.

The preview and recovery surfaces are opaque and use Slack Appearance's solid
surface and text colors when available. Disabling the mod removes its styles,
attributes, controls, observers, timers, listeners, dialogs, and previews.
