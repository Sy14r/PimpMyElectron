# PimpMyElectron: Slack extensibility research

**Yes: arbitrary renderer JavaScript, custom UI, and substantial native window control work inside this installed, unmodified official Slack client.** The most promising foundation is a launcher using a private Chrome DevTools Protocol (CDP) pipe, a small runtime mod loader, and Slack-specific adapters.

Research performed September 17–18, 2026, against **Slack 4.52.155 / Electron 44.0.0 / macOS arm64 / Mac App Store and direct-download distributions**. Other distributions and future versions need separate checks.

- [Clone and run on your work Mac](SETUP.md)
- [Full findings, capability matrix, experiments, and sources](research/slack-extensibility.md)
- [Architecture for a SlackAssist-style triage experience](research/triage-architecture.md)
- [Direct-download validation and remaining checks](research/direct-download.md)
- [Local evidence notes](evidence/README.md)

The live development workflow now includes a menu-bar controller, global shortcut, thin edge strip, queue/reader disclosure, local Done/Later/Pin/Undo with keyboard advancement, explicit conversation Mark read, two-workspace aggregation, on-demand history and threads, native Slack replies inside triage, and independently removable runtime modules. It remains a partial activity view using private Slack interfaces. As of 0.12.0, background activity is passive: existing Slack responses, socket events and visible UI supply observations. There is no automatic API polling or reconnect retry. Optional API refreshes require selecting one workspace and clicking Refresh activity. Version 0.13.0 also hydrates cached conversations, messages and thread cursors directly from Slack’s existing local state, including background workspaces; see [passive state observation](research/passive-state.md). See the [API traffic audit](research/api-traffic.md), including the coverage tradeoff and corporate logout investigation.

Version **0.19.0** defaults to everyday controls: arbitrary evaluation, screenshots
and network experiments require the explicit `npm run dev:debug` launch. Callback
senders are checked against the current top-level Slack execution context. Fully
stop and restart after upgrading; a mod reload cannot harden an old launcher.
See [launch modes and security boundaries](SETUP.md#everyday-controls-and-development-mode-0190).

Version **0.20.0** gives the inbox the full window width, removes redundant header
copy, and makes the workspace title open a compact custom picker. Compose, standard
Slack, and close-to-pill use header icons; detail controls sit beside the filters.
In All workspaces, Compose asks for a destination workspace without changing the
inbox scope. Escape dismisses the picker before affecting the inbox or native chat.
On an already-running 0.19.0 launcher, `npm run dev:reload` applies this UI update.

## Live development

Version **0.14.0** centers the resting strip and expanded pill vertically on the
selected display's usable edge. Each active unread conversation/thread gets a dot
and an individual expanded badge. Hover a badge for its name, workspace and cached
message preview; click for native chat, or Option-click for the read-only reader.
Done and snoozed items are excluded. The strip shows up to 48 dots plus an overflow
count; the expanded list scrolls. Hovering adds no API calls and does not mark read.
See [pill behavior and validation](research/pill-polish.md).

**0.14.1** doubles the strip's minimum height to 88px, uses a dark shape attached
to the screen edge, and adds local cursor detection for inactive macOS windows
that do not deliver hover events. This uses only the desktop bridge, with no Slack
API requests or focus activation.

**0.14.2** fixes missed incoming unread activity: the observer now prioritizes
Slack's live per-conversation counts over unchanged startup counts. Existing
unread DMs in both test workspaces reappeared without extra API calls.

**0.15.0** hides macOS window buttons in the strip/pill and replaces browser
tooltips with a native hover popup. It previews up to three cached messages newer
than Slack's read cursor, with author names and an explicit cached-overflow label.
Unknown boundaries and missing new content are identified. Hovering neither
opens a conversation nor marks it read. After pulling this update, run both
`npm run dev:reload` and `npm run shell:restart` to update the native helper.

**0.15.1** hides window controls in every custom triage view and makes the inbox,
reader and native-chat layouts fill the selected display's usable height on either
edge. The list footer and shortcut legend are removed, giving their space to the
scrollable queue. Use the menu-bar controller for docking and the icon rail for
collapse/normal Slack. The centered resting strip and pill keep their compact size.

**0.15.2** removes the custom top bar once the native conversation/thread pane is
ready, giving Slack's own view the full height. Escape outside native text entry
closes that pane and keeps the inbox open.
Loading/error states retain recovery controls. Native drafts are preserved.

**0.15.3** makes the first Escape in the native composer release typing focus
without changing the draft. Press Escape again to return to the queue. Holding
Escape does not advance through both steps; active IME composition stays with Slack.

**0.15.4** turns the empty pill’s check mark into an accessible button. Click it
to open the triage inbox, even when there are no unread items.

**0.16.0** jumps to the latest messages when a native conversation or thread opens.
The **↓** button in the inbox rail repeats that action after you scroll upward.
Thread opening now uses Slack’s mounted navigation callback, so the parent message
does not need to be rendered. Navigation errors show recovery controls instead of
leaving a stuck loading state. See [native navigation checks](research/native-navigation.md).

**0.16.1** hides the inbox scrollbar while retaining scrolling, including on Macs
configured to always show scrollbars. Inbox filters are now All, Unread, Mentions,
DMs and Threads. Saved Attention/Later/Done filter selections reset to All.

The inbox’s **Activity** bell opens Slack’s native Activity feed in a themed side
pane. In All workspaces mode, choose which workspace’s Activity to display.
Escape still closes the detail pane to the queue (and first releases focus when
used inside the composer). Closing details or hiding triage also parks native
Slack on Activity **in the background**, closing Activity’s remembered detail so
an invisible conversation cannot consume incoming messages as read. Returning to
triage starts at the inbox. Normal Slack handoffs retain the visible destination.
See [Activity parking and validation](research/activity-parking.md).

**0.17.0** adds **Compose** at the top right of the inbox. It opens Slack’s native
New Message view beside the queue, including recipient selection and the editor.
It uses the selected workspace, or the active Slack workspace when All workspaces
is selected. Collapse/reopen preserves Slack’s draft. The inbox’s observed-count
and cached-state explanations have been removed. See [compose checks](research/native-compose.md).

**0.18.0** animates the inbox’s side pane opening and closing. Native content is
prepared behind the queue, then slides out with macOS’s animated window resize;
direct content switches remain instant. Reduce Motion disables the animation.
Idle collapse now applies only to the expanded pill, never to the inbox or its
detail panes. The menu setting is labeled “Collapse pill when idle.” Update both
the renderer and helper, or stop/start the app. See [motion checks](research/detail-motion.md).

**0.18.1** makes the pill collapse delay authoritative. The old 600ms mouse-leave
timer is gone. Leaving the pill starts the configured countdown to the thin strip;
returning cancels it. Never disables automatic collapse. Inbox/detail views remain
open until explicitly dismissed.

Before moving to another Mac, run `npm run doctor` there. It checks the installed Slack distribution, version, signature, profile ownership and build prerequisites without launching Slack or reading account data. The launcher detects Mac App Store and official direct-download distributions and selects their separate development profiles. See the setup guide for the current validation status. Build a clean source transfer with `npm run package:pilot`; the zip under `dist/` includes Start/Stop command files and excludes private state and send experiments. See [pilot setup](pilot/README.md) and [next pilot proof points](research/pilot-next.md).

Quit Slack normally, then run `npm run dev`. The launcher starts official Slack in its owned development profile and automatically builds/starts the native menu controller. Existing development sign-ins persist. Press **⌘⇧Y from another app**, open or triage an item, then **⌘⇧Y** back to your work. Local triage decisions do not change Slack unread state. **Selecting an item opens Slack’s own conversation or thread pane alongside the queue immediately**, including its composer. There is no separate Reply click or custom-reader load first. **Option-click on an item** opens the lightweight cached reader. The ready native pane uses Slack’s own header; local triage actions remain in the cached reader and through keyboard shortcuts when focus is on the queue. **⌘⇧Y** collapses/reopens it while Slack keeps the draft. Opening the native view may mark the conversation read; **Done** remains local. **Open in Slack** is the ordinary-window fallback.

Use the **Inbox density** button beside the conversation filter to choose **Expanded** (the original two-line preview cards), **Cozy** (one-line previews with timestamps), or **Compact** (slim name/status rows). Compact rows keep their cached preview and full status in the hover tooltip and accessible label. Workspace labels remain visible in All workspaces. The choice is saved across launches and also appears in Settings → Appearance & behavior → Inbox density. Changing density affects the inbox list without resizing or reopening the native side pane.

Native profiles remain usable in triage. Their **Recent DMs** entries open the selected conversation alongside the inbox, including returning to the same DM; the profile’s Back button restores the previous conversation. Interrupted navigation offers Retry instead of an indefinite loading cover.

To give a thread a **personal alias**, open it in triage and click its title/pencil in the native thread header. Names appear in the inbox, pill preview, and thread header; the inbox filter matches both the alias and the original conversation name. Clear the name to restore the original label. Aliases are stored only on this Mac, are separate from read/Done/pin state, and make no Slack API calls or changes visible to other people.

**⌘K**, or the magnifying-glass button in the inbox header, opens Slack's native search/switcher above triage. Choose a channel or existing DM with Enter or a click to open it in the right-hand pane. Escape dismisses the popup and restores the previous focus and cursor without changing a draft. Search uses the open conversation's workspace, or the selected inbox workspace when no conversation is open; All workspaces uses Slack's currently active workspace. Full message searches and recent search queries open as a themed results pane beside the inbox, with Slack’s own filters and sorting. Click a result or reply count to open its conversation/thread at the matching message; Escape closes the results pane. Workflows and destinations whose identity cannot be verified still open in full Slack. Search requests remain Slack's own, initiated by your interaction; this adds no custom search API or background polling.

**⌘⇧U** (the default Normal Slack shortcut) globally opens normal Slack from any triage view. When already in normal Slack, it hides or restores the same window (restoring a minimized window first); hiding returns focus to your previous app. **⌘⇧Y** remains the separate triage toggle by default. Both are configurable in Settings → Global shortcuts, which shows whether each combination registered successfully.

**Inbox keyboard triage:** **N** toggles the native new-message composer when no text field has focus; All workspaces first asks which workspace to compose in. **/** focuses and selects the conversation filter. **J/K** or **↓/↑** moves the row highlight without opening conversations. **H/L** or **←/→** cycles All, Unread, Mentions, DMs, and Threads. **Enter** opens the highlighted item and focuses Slack’s native composer (or focuses the existing editor if already open). **X** toggles the highlighted item between read and unread through Slack’s native actions; an open detail pane closes back to the queue first. Mark unread starts at the newest loaded message (or reply for a thread), preserving the parent conversation’s separate read state. The highlight stays on the item unless it leaves the Unread filter, in which case it moves to the next row. Indicators update optimistically and revert to the last observed state if Slack does not confirm. If read state is unknown, X checks Slack’s existing local cache first (no API request). If it is still unknown, X explicitly marks the item read through the hidden native view; after confirmation, X toggles normally. These keys stay inactive while typing; the filter field accepts ↓/↑ to move into the results and Enter to open one. Escape from the filter text field returns focus to the list (or the selected filter button when empty), preserving the text and keeping the inbox open. H/L never focuses text entry. Escape from the composer releases focus; the next Escape closes the detail pane, and Escape in the queue collapses the inbox. The inbox opens with a row focused so navigation is ready immediately.

**⌥⇧↓ / ⌥⇧↑** opens the next/previous observed unread item within the current inbox workspace, search and filters. It skips local Done/Later and pending read items, wraps once, and leaves the current conversation alone when there is nothing else to read. The small next-unread button beside the filters does the same thing. These actions focus messages rather than the composer. **F6 / ⇧F6** cycles focus through inbox, messages and composer (some Macs require Fn-F6). Slack keeps drafts when navigating. Native dialogs and text composition retain their keys, and these shortcuts do not alter full Slack or quick reply.

`npm run dev:reload` reapplies edited source; `npm run dev:status` reports health; `npm run dev:stop` stops the owned helper/client while retaining sign-ins and local state. `npm run mods -- disable triage-surface` removes the UI and restores Slack. The mod does not patch the app bundle or implement a send API. Slack owns composing, sending and drafts. Read/unread changes use Slack’s native conversation and thread actions. A thread with no loaded replies has no separate reply to mark unread; use its parent conversation instead. Production-profile migration and login items are not implemented.

The menu-bar controller's **Settings…** window is resizable, with a fixed section sidebar and scrollable settings. Clicking a section jumps to it; the current section is bold as you scroll.
It groups appearance, triage notifications, global shortcuts, and a keyboard reference. The menu's **More window actions** submenu holds
Hide, Minimize, and an explicit Open normal Slack command.

**When closing the inbox** chooses Edge strip, Pill, or Hidden. **Shrink pill to
edge strip after** controls only the pill's idle timer; it never closes the inbox
or a conversation. **Inbox density** offers clickable Expanded, Cozy, and Compact
previews with the same sample conversations; selecting one saves and applies it immediately.
**Accent color** offers Lavender (the default), Blue, Teal, Green, Amber, and Rose,
plus **Custom…** for the macOS color picker. The choice applies across the inbox,
pill and edge strip, embedded native panes and composer, and Settings previews.
It saves on this Mac and updates without reopening the conversation. Accent text
and indicators are lightened when needed for contrast; normal Slack keeps its own theme.
**Translucent inbox (experimental)** is off by default. It uses one macOS native
blur material behind the inbox list, supplied by the menu-bar helper so it stays
active when Slack loses focus. Messages, the composer, popups, and the pill stay
opaque. The inbox's native window shadow is hidden to avoid outlining the detail
pane before it slides into view. First activation prepares Slack’s native window transparency. If
Settings says a restart is needed, stop and relaunch with the usual Pimp My
Electron launcher (a mod reload is not enough). Subsequent on/off changes apply
live. Turning it off restores the previous native transparency preference.
The effect respects macOS Reduce Transparency. If the helper is unavailable, blur
falls back to following Slack's focus. See [prototype findings and
performance checks](research/inbox-translucency.md) before using it on another Mac.

Local Done remains separate from Slack read state.
Personal thread names are always available from their thread headers; no setting enables them. Preferences and names
save automatically on this Mac.

**Workspaces shown in triage notifications** controls the menu count, pill
destinations, and cached hover previews. It does not change Slack's native
notification preferences:

- **All connected workspaces** includes every observed signed-in workspace,
  independently of the inbox filter (the default).
- **Choose workspaces…** includes only checked workspaces. Selecting none disables
  these notification surfaces without changing the inbox.
- **Follow the selected inbox workspace** uses the workspace dropdown, not the
  All / Unread / Mentions / DMs / Threads filters;
  selecting All workspaces includes them all.

With **Expand the edge strip when new activity arrives** enabled (the default),
new unread activity reveals only the pill, without activating Slack; additional
activity resets the pill's idle timer. Turn it off to keep the strip quiet while
unread dots, counts, and cached previews continue to update. Startup hydration and preference changes
do not announce existing unread items. Clicking a background workspace's pill
item selects that workspace in the inbox and opens its native conversation.
Notification awareness uses Slack's existing client cache and observed traffic;
it adds no Slack API calls and cannot cover data the client has not loaded.

See [usage, architecture, recovery, validation and limitations](research/live-prototype.md) and [phase-by-phase delivery status](research/implementation-plan.md). Apple Command Line Tools are needed to compile the native helper. The persistent signed-in dev session and disposable synthetic experiments below must be run separately.

Experiment screenshots and raw reports stay on the development Mac; see [local evidence notes](evidence/README.md).

## What was verified

| Capability | Result |
|---|---|
| Custom JS, CSS, Shadow DOM | Passed inside the signed Slack application |
| Mod reapplication and removal | Passed, including reload registration and cleanup |
| Local companion communication | Passed with a fixed read-only host operation |
| Private CDP pipe | Passed; no TCP listener in the Slack parent process |
| Left/right native docking | Passed at 388px |
| Native widths | 12, 44, 68, 388, and 772px demonstrated |
| Always-on-top, minimize/restore | Passed using Slack's existing preload bridge |
| All-Spaces setting | Flag set/read successfully; full-screen interaction not manually validated |
| Arbitrary main-process Node via `--inspect` | Unavailable in the tested build; corresponding fuse disabled |
| ASAR source modification | Guarded offline patch/repack passed; patched application execution not attempted |
| Original application signature | Deep/strict verification passed after experiments |

## Reproduce

Needs the tested macOS Slack installation, Python 3, and Node 22+ with built-in `fetch` and `WebSocket`. No npm packages are required. Run from this directory.

```sh
python3 scripts/inspect_slack.py --output evidence/installed-slack.json
npm test

# Quit Slack normally first. The launcher refuses to quit an existing process.
python3 scripts/lab.py start
npm run experiment
node scripts/native-window-experiment.mjs
npm run demo -- --capture
python3 scripts/lab.py stop

# Pipe experiment launches and terminates its own signed-out test instance.
node scripts/pipe-experiment.mjs
python3 scripts/lab.py stop

# Only creates a modified archive COPY under .lab/; never installs it.
python3 scripts/asar_patch_experiment.py
```

For hands-on use: start the lab, run `npm run demo`, and use the panel buttons, `⌘⇧Y`, and `Esc`. Ctrl-C restores its original window geometry. Then run `python3 scripts/lab.py stop`. Keyboard handling in this older synthetic demo is local to Slack; the live dev workflow has a native global shortcut.

The lab uses Slack's `--integrationTestMode` profile. **Do not replace that with `--user-data-dir`: our initial probe restored an existing workspace despite that flag.** The launcher refuses to overwrite a preexisting integration-test profile. Stop preserves lab profiles under ignored `.lab/` rather than deleting them. No normal Slack profile is moved or deleted by these scripts.

The socket-based experiments use a temporary loopback debugging port and verify the signed-out URL before injecting anything. The preferred production transport is the separately verified private pipe. The demo and test code are deliberately not installed into the user's daily Slack session. No LaunchAgent, login item, or recurring automation was installed.

## Repository contents

The [portability assessment](research/framework-portability.md) reviews which parts
can form a general Electron modification framework and which remain Slack-specific.
It records research and deferred architectural options; no broader application
support is currently claimed.

`scripts/inspect_slack.py` reads the application bundle, fuses, archive metadata, and signature. `scripts/cdp.mjs` supplies a small bounded CDP client. `scripts/experiment.mjs` tests mod behavior. `scripts/native-window-experiment.mjs` tests reversible window changes. `scripts/pipe-experiment.mjs` verifies the preferred transport. `mods/runtime.json` is the live versioned manifest; `src/mod-loader.mjs` implements capability checks, independent installation/removal and a compatibility ledger. Other files in `mods/` support the older synthetic experiments. The loader is not a sandbox for untrusted code or a guarantee of future Slack compatibility.

`.lab/` contains disposable profiles, logs, temporary extracted application code, and the patched archive copy. It is ignored and should not be committed or shared. `evidence/` contains local experiment results and screenshots; these artifacts are also ignored. Only its explanatory README is tracked.
