# Slack Message Polish

Message Polish is an optional presentation mod for the official Slack desktop
app. Enable it in PME → Slack, then stop and relaunch a managed Slack session.
It works by itself or alongside Slack Triage and Reply Tools.

Open **Configure…** on the Message Polish card to control each treatment
independently. During a running session, settings apply immediately through PME's
shared mod-settings store. When Slack Companion is already running for Triage or
Slack Layout, the same controls also appear in its Slack Settings window.

## What changes

- Code blocks keep long lines intact and scroll horizontally.
- Block and inline code gain a keyboard-accessible **Copy** control while their
  message is hovered or the control is focused.
- Each sender can receive a subtle, stable local background tint. Its intensity
  is adjustable, and your own messages can be included or excluded. PME resolves the
  stable actor ID carried by Slack's rendered message metadata and keeps bounded
  message-to-sender and sender-to-color lookup tables. A row without an
  authoritative sender stays untinted rather than borrowing a preceding sender
  or changing when Slack virtualizes the list. PME leaves your own messages
  untinted when Slack's local workspace record identifies the current member.
- Ordinary Slack message text is slightly denser. Triage's managed native pane
  keeps its own typography so its density preferences remain authoritative.
- Compact spacing independently removes Slack's vertical message-gutter padding
  and uses an 18 px message line height.
- Supported truncated Google Docs, Sheets, and Slides URLs receive a short readable label.
  PME derives it from the URL alone, preserves Slack's original text node and
  link target, and never requests link metadata.
- The message action bar stays faint until hovered or focused. Compact native
  message-preview cards are owned by the independent Reply Tools mod.

All changes are local to this Slack session. The mod does not change messages,
send requests, fetch link metadata or history, or store message content. Copy reads only the code
you selected by pressing its control and writes that text to the macOS clipboard.

## Interaction with other PME mods

Message Polish targets Slack's native message containers. Code tools and calmer
actions therefore also appear in native conversations
and threads opened beside Slack Triage. Triage's own **Tint messages by sender**
preference controls sender tinting in that embedded pane, using the same sender
mapping and palette. Triage also keeps control of its custom inbox, pill, density,
accent, and translucency.

Reply Tools adds actions to Slack's native message toolbar. Message Polish
does not reorder or replace it; the toolbar becomes fully opaque when hovered or
keyboard-focused, so the quote action remains available. Disabling Message Polish
removes every added copy control, marker, tint, observer, timer, and stylesheet
without disabling either of the other mods.

## Compatibility

Every treatment can be disabled without turning off the rest of the mod. It uses
Slack's private DOM hooks and may need an update after a Slack release. If a copy
control, tint, or compact card looks wrong, disable that treatment or Message
Polish and report the Slack and PME versions with a sanitized screenshot.
