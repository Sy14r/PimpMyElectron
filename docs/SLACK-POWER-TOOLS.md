# Slack Power Tools

Wave 3 adds three independent, default-off Slack mods with explicit recovery and
privacy boundaries. Preset/imported themes live in
[Slack Appearance](SLACK-APPEARANCE.md), and permalink-based message previews
live in [Reply Tools](SLACK-QUOTE-REPLY.md).

Enable a mod on PME's Slack page, then choose **Configure…**. Settings apply to a
running managed Slack session immediately. If Slack Companion is already active
for Triage or Layout, the controls also appear in its native **Slack Settings**
window. None of these mods starts Companion by itself.

## Slack Custom CSS

Custom CSS is an advanced local escape hatch for small personal presentation
changes. The setting is limited to 8,000 characters and validated before it is
persisted or injected. PME rejects:

- `@import`, `url()`, `image-set()`, and equivalent network-loading paths;
- CSS escapes, which could obscure blocked syntax;
- control characters and legacy executable expressions; and
- selectors aimed directly at PME-owned elements.

The CSS is placed in a text-only style element—never parsed as HTML—and can be
changed live. CSS can still make Slack unusable by hiding or moving its own UI.
The recovery path stays outside Slack: disable **Slack Custom CSS** in PME and
relaunch if the running Slack interface is inaccessible. Disabling or reloading
the module removes the entire style element.

## Personal Emoji

Personal Emoji accepts up to 50 definitions, one per line:

```text
:shipit: https://cdn.example.com/shipit.png
:party_parrot: :parrot: https://images.example.org/parrot.gif
```

Each line can include one primary shortcode plus up to ten additional aliases.
One to three personal emoji in an otherwise emoji-only message receive Slack's
jumbo 32 px treatment. Aliases are replaced only in rendered Slack message text. Code, links, editors,
and message drafts are left untouched, and disabling the mod restores the literal
shortcodes. PME does not upload the aliases or change the message Slack stores.

Only public HTTPS hosts are accepted; local, private, credential-bearing, and
non-HTTPS URLs are rejected. Images load lazily with no referrer. The selected
image host still receives a normal image request and the Mac's public IP address,
so use a host you trust. Failed images revert to their shortcode text.

## Sidebar Productivity

The former Sidebar Peek capability is now part of the dedicated
[Sidebar Productivity](SLACK-SIDEBAR-PRODUCTIVITY.md) mod, alongside an optional
mounted-row Unified Sidebar, responsive sidebar modes, recoverable destination
hiding, full Open navigation, and optional Reply in a separate Slack conversation window. Unified ordering and previews remain
cache-only and never fill gaps with API calls. PME Triage remains a separate
cross-workspace inbox and is not presented as Unified Inbox parity.

## Settings portability

The Slack page in PME can export a versioned JSON document containing only
bundled-mod enablement and validated mod settings. Import first shows every
changed setting, then applies the reviewed document atomically. PME keeps the
exact prior settings and selection for **Undo last bulk change**. Profiles, filesystem
paths, accounts, workspaces, messages, Triage activity, credentials, and private
mod metadata are never included.

## Private-integration boundary

Company-specific URL labels, emoji registries, preview services, theme catalogs,
and classifiers are never bundled in the public PME repository. Organizations
can provide them through ignored local mod sources after their code, data access,
authentication, and licensing have been reviewed independently.

An authenticated helper must use a dedicated, narrowly authorized service
instead of relying on renderer-side command checks as its security boundary.
Private package names, settings, paths, credentials, and service details are
excluded from PME settings export and feedback. The public fallbacks—Google
Workspace URL labels, personal emoji, bundled themes, and local Unified Sidebar
groups—remain available without a private service.
