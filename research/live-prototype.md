# Official Slack triage: development workflow

Built and tested September 18, 2026 against the signed Mac App Store Slack **4.52.155**, Electron 44, macOS arm64. The messages and reader live inside official Slack. A small native menu controller provides the global shortcut and focus return. SlackAssist/Ledge was a read-only design reference.

## Start and use

Quit Slack normally, then run `npm run dev`. The launcher refuses to stop an existing Slack process. It launches official Slack with a private debugging pipe and the owned `SlackIntegrationTest` profile. Existing development sign-ins persist. The native controller builds automatically when needed (requires Apple's Command Line Tools) and starts alongside Slack.

- **⌘⇧Y** opens triage from another application. **Esc** goes reader → queue → resting view and returns focus to your previous application.
- The resting view is a **12-pixel edge strip**. Hover reveals a small rail; click or use the shortcut to open the queue. The queue is 420 pixels wide; the reader expands to 820 pixels, constrained by the display's work area.
- The menu-bar tray controls the edge, preferred display, resting view, idle collapse, global shortcut, workspace, hide, minimize, and Normal Slack. The current user preferences are left edge, strip, and 15 seconds. Reading and replying are excluded from idle collapse.
- **Attention** separates things you still need to handle from Slack's own unread state. **Done**, **Later**, **Pin**, **Bring back**, and **Undo** change only local records. Newer observed activity brings Done items back. Later offers 15 minutes, 1 hour, 4 hours or 24 hours. Done/Later advance to the next visible item after the local save is acknowledged. Undo lasts 30 seconds and returns the reader to the restored item. In the reader, **E** = Done, **L** = Later, **P** = Pin and **R** = Reply. These keys do not intercept text fields, the duration selector, or the native Slack composer.
- Choose one workspace or **All workspaces**. A workspace switch in triage does not navigate the underlying Slack conversation. Search filters conversation names; arrows and Enter select/open; Tab stays in triage controls.
- Choose **Read-only view**, or Option-click a queue item, to load custom history. **Refresh**, **Load older**, and **View thread** fetch additional context. Formatting includes safe text, common emphasis/code, mentions and HTTP(S) links. Attachments remain indicators with a Slack handoff.
- **Selecting a queue item** keeps the queue on the left and immediately reframes Slack’s actual conversation/thread pane on the right. Compose and send with Slack’s controls; the mod does not move editor nodes, copy drafts, or call a send API. The destination names the workspace, conversation and thread. **⌘⇧Y** collapses/reopens it and preserves the draft. **Read-only view** explicitly loads the lightweight reader; the default native path never requests custom history first. Done/Later/Pin/Undo remain above the native pane and advance/restore native destinations. In the native editor, Escape and composition shortcuts belong to Slack; use the global shortcut or Collapse button to return to work. Opening this native view can mark it read.
- **Open in Slack** restores ordinary Slack and opens the selected conversation. For a thread, the handoff currently opens its **parent conversation**, not the exact thread. Reply using Slack's own interface. Slack may mark that conversation read during the handoff.
- **Mark read** in a conversation reader updates Slack through the latest loaded message at click time. It is independent of Done and never runs just because the reader opens. A fresh account check and current read-cursor check precede the single write; an already-newer cursor is left alone. Thread Mark read remains disabled. Success, pending, rejected and uncertain results are shown separately.
- **Normal Slack** restores the saved bounds, minimum size, always-on-top and all-Spaces flag. Triage mode requests visibility across desktop Spaces and over full-screen windows; see acceptance status below.

The mods implement no custom send, reaction or presence API. The separately removable **mark-read** module calls only `auth.test`, `client.counts` and `conversations.mark` for an explicit user action; the history adapter remains read-only. Reply mode exposes Slack’s own sending controls after checking the active workspace, channel and exact thread root. Slack itself continues running normally behind the panel, including its usual read behavior for its currently open conversation. This is not read-receipt suppression.

## Maintenance and recovery

```sh
npm run dev:status             # Aggregate health, module status, helper status
npm run dev:reload             # Reapply edited source; preserve sign-ins/local state
npm run shell:build            # Compile native controller edits
npm run shell:restart          # Restart just the owned menu controller
npm run shell -- stock        # Restore ordinary Slack
npm run shell -- rest         # Collapse to configured resting view
npm run mods -- list
npm run mods -- disable history-reader
npm run mods -- enable history-reader
npm run mods -- disable mark-read
npm run mods -- disable native-reply
npm run mods -- disable triage-surface
npm run dev:stop               # Stop owned helper and dev Slack; keep sign-ins
```

If a module fails, disable it independently. Disabling triage restores the window. A missing host update produces a disconnected notice and disables host-dependent controls; Normal Slack still works locally. Restart with `npm run dev` after stopping or normally quitting the owned development instance. A helper build failure leaves the in-Slack controls available. No login item, LaunchAgent, or recurring job is installed.

The launcher serializes reload/discovery, retries attachment, handles detached targets, and owns helper cleanup. Page reloads reinstall enabled modules. A host reload/restart clears message memory and repopulates observations; persistent local decisions and preferences remain. The trusted developer-only `devctl inspect` socket can evaluate JavaScript. It is powerful local tooling, not a third-party mod sandbox.

## Where the activity comes from

DOM observations are skipped while Slack’s active workspace differs from its URL, preventing the previous sidebar from being attributed to a newly selected workspace. Visible Slack DOM observations, incoming message events, and explicitly scoped passive read responses feed a bounded host model. Ambiguous passive requests with no workspace ID are **not attributed to the currently visible workspace**: Slack can make background-team requests from that same page. Verified reads fill this gap.

Each signed-in workspace can be read through the existing official renderer. Before reading, the adapter checks `auth.test` against the requested workspace and configured user. A token change triggers revalidation; cached identity checks expire after five minutes. Credentials remain inside Slack's renderer and are never returned to the host or helper.

The active adapter has exactly seven fixed read endpoints:

| Read | Purpose |
|---|---|
| `auth.test` | Verify workspace/user identity |
| `users.conversations` | Discover joined channels and DMs, 100 per page |
| `client.counts` | Refresh unread/mention observations |
| `subscriptions.thread.getView` | Discover a bounded page of thread activity |
| `conversations.history` | Read 40 conversation messages per page |
| `conversations.replies` | Read 40 thread messages per page |
| `users.info` | Resolve bounded batches of names |

Healthy activity refreshes approximately every two minutes. Observed message events schedule a refresh, coalesced with a ten-second minimum interval. A bounded queue admits up to twelve workspace identities and runs at most two refreshes concurrently; work waiting for a slot is retained. Failed reads keep the last successful data and timestamp, retry with increasing delay up to two minutes, and honor server retry deadlines. Partial unread/thread responses remain visibly partial and retry separately from successful listing. Online signals, Slack socket reconnects and timer gaps over fifteen seconds request a fresh read. An online hint is not treated as proof that Slack is reachable. Individual workspace views offer further conversation discovery pages. Periodic head-page refreshes preserve progress through More conversations; an explicit Refresh activity starts a new discovery pass. Thread discovery is bounded to 20 entries per refresh; more thread activity may exist. History is loaded on selection, not scanned across the whole account. Message events without an unambiguous workspace can be missed until a scoped refresh.

The renderer checks official origin, signed-in page context, workspace identity, identifiers and navigation races. Requests use same-origin credentials, reject redirects, have an eight-second shared deadline, and honor rate-limit cooldowns. Returned data is sanitized and bounded. The host accepts history/local-action requests only for known items within the user's selected workspace scope. Cross-workspace aggregation is explicit and labels rows by workspace.

Unknown unread state stays unknown. An event doesn't invent an unread count; a subsequent count response resolves it. Failed or partial refreshes retain previous observations and show uncertainty. Old discovery cannot roll a newer message timestamp backward. This is a partial attention view, not a complete synchronized inbox: deletion reconciliation, unread/mention coverage, full rich blocks, attachment rendering, and unlimited thread discovery are not claimed.

Read API references: [history](https://docs.slack.dev/reference/methods/conversations.history/), [replies](https://docs.slack.dev/reference/methods/conversations.replies/), and the separate [mark-read mutation](https://docs.slack.dev/reference/methods/conversations.mark/), which the read-only adapter never calls. The separate Mark read module uses that mutation only after an explicit action. Several other endpoints/configuration details are private Slack interfaces.

## Storage and module design

`mods/runtime.json` lists independently versioned **history-reader**, **mark-read**, **native-reply** and **triage-surface** modules. `src/mod-loader.mjs` validates the manifest, probes required capabilities, registers new-document scripts, disposes modules, isolates installation failures, and writes a compatibility ledger containing the Slack version, web asset fingerprint and module health. Disabled selections live outside Slack in `.lab/dev/mods.json`.

Runtime patches do not modify, re-sign, or repack the installed Slack bundle. They can be reapplied after an update without a binary merge. Capability probes are not behavioral certification: unknown builds are labeled untested, and Slack can change its DOM, session configuration, APIs, window bridge or debugging support. No future update compatibility is guaranteed.

Normalized message copies remain in bounded memory: eight workspaces, up to 600 items per workspace, 1,000 message copies globally and 200 per item. Persistent `.lab/dev/triage-state.json` contains identifiers, timestamps, local decisions and preferences, **not message bodies**. It uses atomic writes and mode 0600. Corrupt state is preserved and further state writes fail visibly. The private control sockets are mode 0600 inside a mode-0700 directory.

Slack maintains its own normal cache in the development profile. `.lab/` also contains stock Slack logs and explicit developer screenshots/probes; keep it private and ignored. No normal Slack profile is moved or deleted. `--user-data-dir` is deliberately avoided because it failed isolation in the original research. Do not run the disposable `lab.py`, synthetic demo or older experiments concurrently with the persistent dev session.

## Verified and remaining acceptance

Content-free reports are under `evidence/`:

- `multi-workspace-checks.json`: four unread conversations and two populated threads across two workspaces loaded without navigating Slack; the types include a channel thread and a DM thread.
- `local-state-checks.json`: Later/Pin/Undo, Done survives mod reload while retaining unread, and a user-sent background-workspace DM reopens Done.
- `restart-checks.json`: two sign-ins, local state and preferences survive a full client restart; the menu helper starts automatically and registers the shortcut.
- `lifecycle-checks.json`: independent module disable/re-enable, window restoration, simulated missing-update notice, stock escape and page reload recovery.
- `native-shell-checks.json`: hide/show and minimize/restore, allowing native animations to finish.
- `handoff-checks.json`: ordinary-Slack handoff for the already-open read conversation; zero send/mark calls. Navigation to other destinations is not covered by that check.
- `live-prototype-checks.json`: both docking edges, native queue/rail/reader widths and restoration of native settings. The all-Spaces flag is checked separately from user-observed Spaces behavior.

- `native-reply-lifecycle.json`: removing/re-enabling Reply preserves the native editor and its draft; collapse/reopen and a workspace round trip restore the intended destination, with zero sends.
- `native-reply-checks.json`: four labeled native sends delivered once: DM and DM-thread in Personal Test, DM and channel-thread in haxx. A native draft survived collapse and a workspace round trip. These are authorized test-workspace sends, separate from the earlier read-only acceptance reports.

- `mark-read-checks.json`: fresh DMs in both test workspaces stayed unread while read in triage, then changed to read after one explicit request each. Native route and local decisions were unchanged.
- `native-default-checks.json`: one-click native opening in four DM/thread destinations, zero custom-history requests before explicit fallback, rapid selection, collapse, visible local controls, Done/Later advancement and Undo restoration. A simulated unread refresh confirms the selected row remains visible. No sends occurred.
- `batch-triage-checks.json`: keyboard Done/Later advance, 15-minute snooze, Undo restores the decision and reader, inputs retain their keys, and rejected decisions do not advance. Local records are restored after the test; no Slack writes occur.

- `recovery-checks.json`: a 20-second CDP offline interval caused a real read failure; cached reader content and local Pin/Undo worked, the timed restore succeeded, and both workspaces refreshed automatically without restarting Slack. Zero sends or Mark read requests occurred. Actual Mac sleep was not tested.

**51 automated tests passed.** Automated tests cover transport framing/timeouts, model reconciliation and limits, thread timestamps, local persistence, workspace scoping (including ambiguous background responses), identity mismatch/token rotation, read restrictions, pagination, cooldowns, failure retention, module isolation, native draft/layout preservation, native workspace navigation, and rejecting a send after workspace/thread destination changes.

The user confirmed global open/collapse, thin-strip resting and focus return. The initial Spaces attempt stayed on the original Space; the implementation now applies Electron's [all-workspaces/full-screen visibility options](https://www.electronjs.org/docs/latest/api/browser-window#winsetvisibleonallworkspacesvisible-options) during triage and restores stock behavior afterward. The user subsequently confirmed cross-Space opening, collapse and focus return after the native focus-target correction. Details are recorded in the implementation plan. Multiple monitors, full-screen combinations, popout windows, a real Slack upgrade and multi-page live histories still require dedicated acceptance. Unit tests and capability flags do not substitute for those checks.

True nonactivating text entry like Ledge's NSPanel remains unproven in Slack's ordinary BrowserWindow. The implemented workflow deliberately uses activation followed by verified focus return. A clean source transfer zip with preflight and Start/Stop launchers is available through `npm run package:pilot`; a notarized installer and production-profile migration remain separate work; this development build remains on the authorized test profile.

## Native Reply boundaries

Native Reply is experimental on Slack 4.52.155. It routes through Slack’s workspace switcher and conversation sidebar, then opens a loaded thread root through Slack’s reply control. A conversation missing from the sidebar or a thread root absent from the native message view may require opening it in Normal Slack first and retrying. The read-only history view can load messages that Slack’s native pane has not loaded; those are different views. A failure masks the reply pane and offers Retry, Read-only view and Normal Slack instead of exposing an unverified destination.

The module checks the active workspace independently from the URL, matches the editor’s conversation and exact thread timestamp, and checks again before native Send/Enter. A destination change disables the reply layout. It never retries a send. Drafts and delivery feedback remain Slack’s responsibility. Open known thread items from the queue: arbitrary navigation into secondary native panes is not yet integrated. Standard text sending is proven; attachments, autocomplete, rich formatting, scheduled messages, and all native popovers still need hands-on acceptance at the compact width.

Automated sends are restricted by the integration experiment to **haxx** and **Personal Test**. The production reply feature remains user-operated and is not a background sender. Run `node scripts/native-reply-smoke.mjs --send-test-messages` only when intentionally repeating the authorized four-message experiment; `--resume-run` continues recorded unfinished cases without resending completed ones. Keep private send-attempt records under `.lab/`.

Mark read freezes the loaded timestamp and never substitutes newly arriving activity. An uncertain network result is not automatically retried; refresh activity before another explicit attempt. Conversation read state does not establish thread read semantics. Live acceptance currently covers DMs in both workspaces; channel cursor behavior, a real concurrent inbound message during the write, and thread marking need separate live checks. Unit coverage exercises the frozen-timestamp race and newer remaining unread activity.

## Recovery behavior and limits

The UI distinguishes the local triage connection from Slack's reported network status. While Slack reports offline, cached messages and local decisions remain available. It shows the age of the last successful unread refresh and retry progress, rather than labeling stale observations current. A manual refresh remains available because browser online/offline signals can be imperfect. No send or Mark read action is replayed by the recovery scheduler.

The network experiment is opt-in developer tooling: start with `PME_NETWORK_TESTS=1 npm run dev`, then run `node scripts/recovery-smoke.mjs`. The launcher refuses the experiment unless only the two authorized test workspaces are signed in, limits the outage to 45 seconds, schedules restoration, and provides explicit cleanup. Normal launches leave the experiment disabled. This is a renderer network test, not a physical Wi-Fi or OS sleep test. Real Mac sleep/wake, busy production workspace coverage, and larger live discovery/history datasets still require acceptance.

References: [Chromium network emulation](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions), [browser online-state limitations](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
