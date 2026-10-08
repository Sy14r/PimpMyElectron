# Slack Companion

Slack Companion is PME's optional session-level native integration for Slack. It
is enabled by default when Slack Triage or Slack Layout is selected, but its
integration card in PME has an independent switch. Changing the switch while
Slack is running starts or stops the helper immediately. It is not a renderer mod
and does not modify Slack by itself.

It is started by Slack Triage or Slack Layout. Once active, it can host live
settings for every enabled bundled Slack mod. It provides:

- a menu-bar entry and session status;
- Triage global shortcuts, edge surfaces, and native panels when Triage is enabled;
- one native **Slack Settings** window containing sections for enabled mods; and
- a live settings channel to the Slack renderer.

The PME manager remains the place to select mods and configure them before Slack
starts. While Slack is running with Companion enabled, **Slack settings…** and each enabled mod's
**Configure…** action open the Companion window, optionally jumping directly to
that mod. Both entry points use the same validated, namespaced settings store.
With Companion off, **Configure…** stays in PME and settings still apply live to
the running Slack renderer.

Turning Companion off leaves the selected Slack mods enabled. It removes the
menu-bar item and native settings window. For Triage it also removes global
shortcuts, native previews, and backdrop integration; PME calls this out beside
the switch rather than silently changing Triage behavior.

Layout-only sessions do not start Triage observation, notification collection,
global shortcuts, or edge UI. Likewise, renderer-only mods that do not declare a
Companion-backed capability do not start the helper.
