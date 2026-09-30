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
magnifying glass) uses Slack's native switcher and results. Unsupported destinations
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

Defaults below can differ from saved global-shortcut preferences. Inbox navigation
also works with a detail pane open when no text entry or native dialog owns focus.

| Key | Action |
| --- | --- |
| ⌘⇧Y | Toggle triage globally. |
| ⌘⇧U | Open standard Slack; there, hide/show its window. |
| J / K or ↓ / ↑ | Move the inbox highlight without opening an item. |
| 0 | Jump to the first row in the current filter. |
| 1 | Jump to the first unstarred row in the current filter; no-op if none exists. *Added after client 0.6.0; currently available from source.* |
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

Settings is available from the inbox's more menu, the pill gear, and the menu-bar
controller. It includes Expanded/Cozy/Compact density previews, accent color,
docking/display choices, closing behavior, pill idle delay, notification workspace
scope, global shortcuts, and a keyboard reference. Idle collapse affects only the
pill, not an open inbox or detail pane. The list scrollbar appears while scrolling
and fades afterward.

Experimental translucency uses native background blur. Inbox background opacity
and a relative detail-pane opacity increase affect backgrounds, not text. It
respects Reduce Transparency; initial native transparency setup may require a
restart. Standard Slack restores its normal opaque backing. See the
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
