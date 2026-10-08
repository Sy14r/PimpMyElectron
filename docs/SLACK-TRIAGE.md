# Slack Triage

Slack Triage provides an edge-docked inbox around the official Slack app. Launch
it from PME, or use the [source workflow](../SETUP.md). Slack owns sign-in,
messages, drafts, composing, and sending.

## Inbox and notifications

Startup selects Slack Home to seed cached state, then opens the inbox. Choose a
workspace by clicking its name, or select All workspaces. The filter row scrolls
horizontally: **All, Unread, Mentions, DMs, Apps & agents, Channels, Threads**.
Starred conversations appear first within the current filter; their threads
inherit the conversation's star. The text filter matches names and personal thread
aliases. Opening an item clears that text filter.

Click an item to open its native conversation or thread alongside the inbox.
Compose opens Slack's New Message view; All workspaces asks for a destination.
The Activity button opens Slack's native Activity feed. Search (⌘K or the
magnifying glass) uses Slack's native switcher and results. Selecting a person
without an existing cached DM opens Slack's recipient-filled new-message composer
beside the inbox, using the selected native search result. Unsupported destinations
can be opened in full Slack.

When a detail pane closes or triage hides, Slack is parked on conversation-free
Activity in the background so a previously selected chat does not keep consuming
new messages as read. The detail pane still closes normally. Open in Slack keeps
the intended destination when handing off to the standard window.

The minimal edge strip shows one dot per observed unread conversation or thread,
not an exact unread-message total. Hover expands the pill; individual items show
cached new-message previews. The hover card offers Mark read, Reply, and Inbox.
Quick reply uses Slack's native composer and closes after a matching successful
send is observed. Mark read updates indicators optimistically; failed or
unconfirmed actions must reconcile back to observed Slack state.

Muted conversations and their threads stay accessible under All and matching
category filters, but are excluded from Unread, pill notifications, automatic pill
reveals, and attention counts. Notification workspace scope is configurable
independently of the inbox's workspace selection.

The observer uses Slack's existing cache and traffic. It can only display data it
has observed; missing data does not prove there are no unread messages. Cached
previews do not fetch history or mark read. Opening native content can mark it
read and may cause Slack to fetch data normally.

## Keyboard controls

Standard Slack no longer carries a floating Triage button. Use the global toggle
shortcut or the Slack Companion menu-bar control to enter and leave Triage; the
edge strip remains available while Triage is resting in strip mode.

Open **Keyboard shortcuts…** from the Slack Triage menu-bar icon, or press
**⌘⇧,**, for a separate scrollable cheat sheet. Press the shortcut again while the
sheet is focused, or Escape, to close it and return focus. The sheet reflects your
configured global shortcuts and is available without opening the inbox. Change its
shortcut in Settings → Global shortcuts, or use the sheet’s **Shortcut settings…**
button. The sheet shares Settings’ theme and stays visible when switching apps.

Defaults below can differ from saved global-shortcut preferences. Inbox navigation
also works with a detail pane open when no text entry or native dialog owns focus.

| Key | Action |
| --- | --- |
| ⌘⇧Y | Toggle triage globally. |
| ⌘⇧U | Open standard Slack; there, hide/show its window. |
| ⌘⇧, | Show/close the keyboard cheat sheet. |
| J / K or ↓ / ↑ | Move the inbox highlight without opening an item. |
| 0 | Jump to the first row in the current filter. |
| 1 | Jump to the first unstarred row in the current filter; no-op if none exists. |
| H / L or ← / → | Move between inbox filters. |
| Enter | Open the highlighted item and focus the native editor. |
| X | Toggle read/unread using Slack's native actions. |
| N | Toggle the native new-message composer. |
| / | Focus the conversation filter. |
| Shift+/ | Clear the conversation filter without focusing it. |
| ⌘K | Open native Slack search/switcher. |
| ⌥⇧↓ / ⌥⇧↑ | Open next/previous observed unread item in the current scope. |
| F6 / Shift+F6 | Cycle inbox, messages, and composer focus. Some Macs need Fn. |

Escape first dismisses a popup or releases text-entry focus. With no text entry
focused, it closes an open detail pane; from the queue, it collapses the inbox.
Escape from the filter leaves the inbox open and preserves the filter text.
Navigation keys do not type into or override focused editors.

## Preferences and personal names

Slack Settings is available from the inbox's more menu, the pill gear, PME, and
the shared Slack Companion menu-bar integration. It includes
Expanded/Cozy/Compact density previews, accent color,
docking/display choices, closing behavior, pill idle delay, notification workspace
scope, global shortcuts, and a keyboard reference. Idle collapse affects only the
pill, not an open inbox or detail pane. The list scrollbar appears while scrolling
and fades afterward.

Triage preferences use PME's shared, namespaced mod-settings store. Existing
preferences migrate automatically from older `triage-state.json` files. Personal
thread aliases and Done/Later records remain in Triage's separate workflow state;
they are not general appearance settings.

**Tint messages by sender** applies subtle, stable colors to other people's
messages in native conversations and threads opened beside the inbox. It is off
by default; its separate visibility control defaults to **Always** and can instead
limit tints to **On hover**. It uses the same sender mapping and palette as Message
Polish and does not tint inbox rows or the pill. Triage owns this embedded-pane
preference even when Message Polish is also enabled. Sender IDs and their colors
are cached locally in bounded lookup tables; unresolved rendered rows remain
untinted rather than inheriting another row's sender.

Experimental translucency uses native background blur. Inbox background opacity
and a relative detail-pane opacity increase affect backgrounds, not text. It
also applies to the gutter and footer behind the native composer; the composer
card and popups remain solid for legibility. It respects Reduce Transparency;
initial native transparency setup may require a restart. Standard Slack restores
its normal opaque backing. See the
[implementation history](../research/inbox-translucency.md) for the tradeoffs.

A thread's title/pencil allows a personal alias. It appears in the inbox, preview,
and thread header and is saved on this Mac, without renaming anything for other
Slack users. Aliases do not require enabling local triage decisions. Any retained
local Done/Later state is separate from Slack read state.

## Compatibility and troubleshooting

PME uses private Slack interfaces, so a Slack update can require adapter changes.
For a stuck or incorrect native destination, use Retry or Open in Slack and report
the reproduction steps with both app versions. Do not include message content or
workspace credentials in public feedback. See [SETUP.md](../SETUP.md) for source
reload versus bundled-app rebuild instructions.
