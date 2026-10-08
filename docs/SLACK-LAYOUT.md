# Slack Layout

Slack Layout is an optional renderer mod for ordinary Slack. It can run alone or
alongside Slack Triage, Message Polish, and Reply Tools. Every presentation
change is off by default.

## Controls

Open **Configure…** on the Slack Layout card in PME to choose. Before launch,
PME shows the configuration sheet. During a running session with Slack Companion
enabled, the same action opens its native **Slack Settings** window at the Slack
Layout section. With Companion off, PME keeps using its own live configuration
sheet:

- individual Home, Direct messages, Activity, Files, Later, Agents & tools,
  Create, sidebar focus, profile, overflow, and workspace-switcher visibility;
- back/forward visibility;
- individual channel-header controls for favorites, members, huddles,
  notifications, in-channel search, and canvas/bookmarks;
- an optional single-line channel header, adjustable thread-pane width, and
  a message toolbar that follows the pointer; and
- full, hidden, or top-bar navigation rail modes. Hidden actions stay reachable
  from an opaque local overflow in the top bar or beside the sidebar header.
  Top-bar and hidden modes place the workspace switcher just beyond the macOS
  window controls, anchor the profile control at the opposite edge, and reclaim
  the empty rail width.

Settings are validated and saved in PME's shared, namespaced mod-settings store.
Use `0` for Slack's native thread width or choose 320–900 pixels. When Slack is
already running under PME, toggles and released slider changes are
pushed to the renderer immediately; Slack does not need to quit or reload.

Sidebar organization and responsive modes live in the independent
[Sidebar Productivity](SLACK-SIDEBAR-PRODUCTIVITY.md) mod. This keeps navigation
chrome decisions separate from destination workflow and lets either mod run alone.

## Interaction with Triage

Slack Layout owns only ordinary Slack chrome. It automatically suspends its rail,
and top-bar transformations while Triage is framing a native conversation,
quick reply, background read, parking transition, or switcher. Message Polish
continues to own message presentation, and Reply Tools continues to own its
composer action.

Disabling or reloading the mod removes its styles, attributes, controls, observer,
listeners, dialogs, and menus. Slack updates can change private DOM selectors; if
the module cannot identify a surface confidently, it leaves Slack's native layout
visible.

## Interaction with Slack Appearance

When Slack Appearance is enabled, Layout's local overflow menu uses the selected
appearance surface and text colors. Layout remains responsible for positioning,
hit testing, and restoring navigation controls; Appearance owns colors only.
Either mod can be disabled independently, and the menu falls back to its opaque
native-looking dark surface when Appearance is off.
