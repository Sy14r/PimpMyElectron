# Slack triage pilot for Apple Silicon Mac

This is a development pilot inside the official Slack app. Signed-in live acceptance covers Mac App Store and official direct-download Slack 4.52.155, Electron 44, macOS arm64. Direct-download tests include both test workspaces, native DM/thread delivery, drafts, local triage actions and restart persistence. Other builds require qualification. It uses a separate development sign-in and does not modify the Slack application bundle.

## Setup

1. Unzip into a short local path such as `~/Projects/PimpMyElectron`. Keep the extracted folder together. Do not copy `.lab/` or any Slack profile from another machine.
2. Have Node.js 22+ and Apple Command Line Tools installed. No `npm install` is needed. The native menu controller builds locally on first launch.
3. Quit Slack normally, then open **Start Triage.command**. Its preflight checks the app, distribution, signature, toolchain and profile ownership before launch. It detects the App Store or official direct-download profile layout. An unrecognized or re-signed distribution blocks setup; device management restrictions still require checking on that Mac.
4. Sign in to the workspace you want to test. Start with the test workspaces to verify the local environment, then explicitly sign in to your work workspace when ready. This bundle contains no accounts or sign-ins.
5. Leave the launcher Terminal open while using triage. **Stop Triage.command** stops only the owned development instance and retains its sign-ins and local decisions. Quit/relaunch through this folder to keep that state.

If macOS prevents opening the command file, open Terminal in this folder and run `node scripts/doctor.mjs`, followed by `node scripts/dev.mjs` after preflight passes. There is no notarized installer or login item.

## Workflow

- **Compose**, at the top right of the inbox, opens Slack’s native New Message
  view beside the list. Choose recipients and write in Slack’s editor. The selected
  workspace is used; All workspaces uses the active Slack workspace (shown in the
  Compose tooltip). Collapse/reopen keeps the native draft. When Slack leaves the
  New Message page, triage returns to the queue.

- **⌘⇧Y** opens from your current desktop Space and collapses back to work. Configure edge, display, idle timeout and resting strip through the menu-bar T icon.
- **Select an item once to open its native Slack conversation or thread beside the queue.** There is no separate Reply click or custom-history load first. Slack owns the messages, composer, drafts and Send control. Opening the native pane can mark the conversation read through Slack's normal behavior.
- **Done**, **Later**, **Pin** and **Undo** in the cached reader change local records only. Done/Later save, then open the next native item; Undo restores the decision and destination. Later offers 15 minutes, 1 hour, 4 hours or 24 hours. New activity brings Done items back. A selected Attention/Unread item stays visible while open if Slack marks it read, so you can finish deciding what to do with it; this temporary hold does not persist after returning to the queue.
- **⌘⇧Y** keeps the native draft while collapsing/reopening. The first **Escape** in the native composer releases typing focus; the next closes the native pane and returns to the queue, then another collapses to the resting strip. **E** Done, **L** Later and **P** Pin work in triage controls, never in the native composer or text inputs.
- Native conversations and threads open at the latest messages. Click **↓** in the inbox rail to jump to the latest again after scrolling upward. Native thread navigation can open roots that are absent from the rendered message list; it still requires a compatible mounted Slack conversation view.
- **Read-only view**, or **Option-click** on a queue item, opens the lightweight reader explicitly. It does not navigate native Slack or make a mark-read request. Its **Native chat** button returns to the native conversation. **R** does the same when focused on reader controls.
- The reader's explicit **Mark read** button advances the conversation cursor only through the latest loaded message at click time, after checking account identity and the existing cursor. Local Done remains independent. Thread marking is disabled until separately verified. An uncertain result is not retried automatically; refresh activity before another attempt.
- **Normal Slack** restores the usual client window. Use it if a conversation is missing from Slack's sidebar or native chat cannot verify the editor. Open the intended conversation/thread there and retry.

The queue is a partial view, with bounded discovery and on-demand history. Check Slack Activity/Threads during the pilot to assess coverage. Cached messages and local decisions remain available during a connection loss. Version 0.12.0 observes Slack’s existing activity without automatic API polling, including after reconnect or workspace selection. Background unread/thread coverage can be incomplete until Slack loads it. For optional extra reads, select one workspace and click **Refresh activity** (at most once per minute); All workspaces cannot bulk refresh. Conversation discovery is cached for 15 minutes. Network recovery does not replay sends or Mark read. Real Mac sleep/wake remains unverified. Open known threads from the triage queue; arbitrary navigation into other native panes is not yet integrated. Rich native composer controls, full-screen combinations and multiple monitors need further acceptance.

## Recovery and updates

From this folder:

```sh
node scripts/devctl.mjs status
node scripts/shellctl.mjs stock
node scripts/mods.mjs disable mark-read
node scripts/mods.mjs disable native-reply
node scripts/mods.mjs disable triage-surface
node scripts/devctl.mjs stop
```

Disabling triage restores ordinary Slack; disabling native reply removes its layout without deleting drafts. Run `enable` in place of `disable` to restore a module. Source updates can be applied with `node scripts/devctl.mjs reload`. Quit before replacing the whole folder's source, preserve your local `.lab/`, and rerun preflight after a Slack update. Do not overwrite the Mac's local `.lab/` with another machine's data.

The runtime uses private Slack interfaces. A new Slack version may require adapter updates; the installed app stays untouched. `.lab/` contains private logs, state, developer control sockets and potentially screenshots if you take them. Keep it local. Production diagnostics should report module health and counts, not message content.

The bundle contains no automated send or mark-read experiments. All sending in the pilot is user-operated through Slack's native editor.

## API traffic diagnostics

`npm run dev:status` reports `feature.apiPolicy: "manual-only"` and
`feature.customApi`: counts of requests, rate-limit responses, authentication
failures and request methods since this runtime started/reloaded. These contain
no tokens, names or message content. `feature.methods` is the older combined
observation counter and includes Slack's own requests; it is not our API overhead.
Native navigation/sending still causes ordinary Slack traffic. Optional manual
refresh, read-only history and explicit Mark read cause custom calls. No custom API
requests are caused by local Done/Later/Pin or queue scope changes. Advancing to
the next native conversation can still cause Slack’s normal loading requests.

To test native-only with even optional custom API actions disabled:

```sh
npm run mods -- disable history-reader
npm run mods -- disable mark-read
npm run dev:reload
```

Native conversations/composers and passive observation still work. Use `enable`
in place of `disable` to restore the optional adapters. These switches persist
on this machine. To update an old polling build, stop it before pulling; changing
files alone does not stop its running code.

## Passive cache observation (0.13.0)

The independently removable `state-observer` hydrates conversations, names,
messages and thread read cursors that Slack already has in memory, including
background workspaces. It listens to local store updates; it never dispatches
Slack actions, opens sockets, fetches history or navigates to collect data.
`feature.clientStateSnapshots` counts accepted observations. Cached read-only
previews continue working when the history adapter is disabled.

This is a private, version-sensitive integration tested against Slack 4.52.155.
It exports a bounded set of relevant fields, not Slack's entire state. Coverage
remains partial, and exact unread counts are intentionally omitted where only
boolean evidence is established. If it cannot locate a compatible store, ordinary
DOM/network observation remains available, with no automatic API fallback.
