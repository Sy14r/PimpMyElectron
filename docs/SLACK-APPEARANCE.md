# Slack Appearance

Slack Appearance is an optional, local-only renderer mod for the official Slack
desktop app. It can run alone or alongside Slack Triage, Message Polish, Reply
Tools, and Slack Layout.

## Themes and controls

Open **Configure…** on the Slack Appearance card in PME. Changes made during a
managed Slack session apply immediately without restarting or reloading Slack.
When Slack Companion is already active for Triage or Layout, the same controls
also appear in its native **Slack Settings** window.

Choose one of eight original bundled palettes—Midnight, Ocean, Forest,
Sandstone, Lavender, Aubergine, Graphite, or Sunrise—or choose **Custom
colors** and set:

- system navigation;
- selected items;
- presence indication; and
- notification badges.

The color controls require six-digit hexadecimal colors. A pasted Slack theme
string can contain either four colors in the order above or the conventional
eight-color format. For an eight-color string, PME uses the column background,
active item, active presence, and mention-badge positions. Importing a valid
string selects **Custom colors**; malformed or oversized strings are rejected
without replacing the last valid settings.

## Local-only boundary

Appearance injects scoped CSS into the managed Slack renderer. It does not read
Slack credentials, call Slack APIs, write private account preferences, contact a
theme gallery, or sync colors to another Slack client. Theme strings are parsed
and stored in PME's shared, namespaced mod-settings file; the one-time import
field itself is not retained.

Disabling or reloading the mod removes its stylesheet and root marker so Slack's
native appearance returns cleanly. The mod does not need Slack Companion, Triage
observation, or network interception.

## Interaction with other PME mods

Appearance owns shared chrome colors, while Layout owns placement and visibility.
Layout's overflow menu adopts the active Appearance surface and text colors but
falls back to an opaque dark surface when Appearance is disabled. Triage keeps
ownership of its inbox accent and translucent surfaces, and Message Polish keeps
ownership of sender tints and message presentation.

In ordinary Slack, the palette also covers channel and thread headers, channel
tabs, composer surrounds, composer cards, toolbars, editor text, and placeholder
text. Header notification, search, and overflow controls inherit that surface
instead of retaining Slack's stock button backing. Composer footer layers share
one surface and the composer card remains centered within its native container,
avoiding an unthemed band around it. These selectors explicitly exclude a
conversation pane while Triage owns it, so Triage's independently configured
detail appearance remains authoritative.

Slack's class names and private theme variables can change between releases. PME
uses both narrow theme variables and scoped DOM hooks; an unknown surface is left
alone rather than causing account-level changes.
