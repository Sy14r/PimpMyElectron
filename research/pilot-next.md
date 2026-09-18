# Next proof points for the work-laptop pilot

Target: Apple Silicon Mac, later September 18, 2026. The development prototype is working on the current laptop; productive use on a busy work account still needs the following proofs.

## Recommended order

1. **Queue trust and recovery.** Exercise mentions, followed thread replies, muted channels, messages arriving during Done/Later, more than one discovery page, sleep/wake and temporary loss of connectivity. Compare against Slack Activity/Threads. Preserve unknown/partial state and avoid silently omitting important activity. Add local inclusion/priority controls if the queue is noisy. Pass: relevant work appears, handled work stays handled until appropriate new activity, and reconnect does not require restarting.
2. **Reply and return.** First make handoff land on the exact thread with reliable return to the prior triage item. Prove Slack's native composer keeps a draft across collapse, workspace switches and return to work. Then experiment with a compact official Slack conversation/thread window as the reply surface. Pass: the user can read, reply once in the intended workspace/thread, and return to work without losing a draft or their place.
3. **Explicit Mark read.** Keep the local Done state independent, with a separate user action to advance the Slack read cursor through the last reviewed message. Freeze the intended timestamp at invocation so a concurrent message is not silently acknowledged. Confirm server success and refreshed unread state. Thread unread semantics need a separate probe; channel read-cursor support does not prove thread marking works.
4. **Fast local decisions.** Keyboard actions, next-item advancement, stable selection and scroll position, more snooze choices, clear pending/error state, and priority/mute controls. Pass: a short batch can be processed without repeated mouse travel or losing context.
5. **Portable pilot.** Read-only installation preflight, correct profile ownership for the installed Slack distribution, clean transfer excluding `.lab/`, simple launcher/stock escape, and content-free diagnostics. Recheck on the actual work laptop before treating it as compatible.

## Accepted sprint stretch: reply from the triage view

The user explicitly added this stretch goal: **reply from triage using official Slack client capabilities**. It belongs in this sprint alongside the core pilot work; exact-thread handoff alone does not satisfy it.

Target interaction: select an item → native conversation and composer using Slack's native editor in the compact edge-docked flow → send using Slack's own control → return to the same triage position. The user should not have to expand into the full Slack workspace to answer a short message.

Implementation experiments, in order:

1. Find a reliable native conversation/thread route and verify the intended workspace, conversation and root message before presenting the editor.
2. Try presenting Slack's existing composer within the triage layout while preserving Slack's ownership of the editor and its draft/send behavior. Prefer reversible layout changes over moving React-managed editor nodes or invoking undocumented send functions.
3. If the in-place editor cannot be isolated reliably, try an official Slack conversation/thread popout positioned as the compact reply pane, with triage selection and return behavior retained. This is a fallback implementation of the same compact workflow, not a generic full-window handoff.

Acceptance criteria:

- Works for a DM and a channel-thread reply in each test workspace; the destination is visible before composing.
- The native editor receives typing, selection, multiline input and its own keyboard commands; triage shortcuts do not intercept composition keys.
- Drafts survive collapse/reopen and switching away and back without appearing in another conversation or thread.
- Global collapse and focus return work across Spaces; Escape remains Slack-owned while composing; returning to triage preserves the selected item and list position.
- Slack owns send feedback and delivery semantics. The mod never auto-sends, auto-retries a send, or silently changes a thread reply into a channel message.
- If native routing/editor verification fails, offer the existing ordinary-Slack handoff and report the limitation. Do not present an editor whose destination is uncertain.

The user has now explicitly authorized automated experimental sends in **haxx** and **Personal Test**. Use clearly labeled test messages, verify the workspace and destination before sending, and keep automated sends limited to those two workspaces. This supersedes the earlier no-send constraint for those test workspaces. Opening the native conversation may invoke Slack's ordinary read behavior; this reply mode must be clearly separate from the read-only triage reader.

Status: native-editor integration now delivers text replies inside triage. Four authorized sends passed: Personal Test DM and DM-thread, haxx DM and channel-thread; the Personal Test draft survived collapse and a workspace round trip. See `evidence/native-reply-checks.json`. Active workspace and editor destination are checked before exposing the composer and before native Send/Enter. Remaining: channel-thread in Personal Test and DM-thread in haxx for the full type/workspace matrix, older unloaded roots, missing-sidebar conversations, richer native controls, and hands-on composer focus across Spaces. Flag feasibility problems as soon as a probe establishes them. Do not replace this goal with a new custom API sender without discussing the tradeoff.

## Reply alternatives

- **Existing composer, exact handoff:** lowest implementation uncertainty; improves the current parent-conversation-only handoff.
- **Official composer in a compact Slack window:** the in-place native pane is demonstrated; a separate popout remains a fallback. Slack supports conversation/thread popout windows; controlling them without losing draft state remains an experiment.
- **Custom inline composer:** plausible, but requires verified user identity/destination, per-conversation/thread drafts, explicit send, pending/success/failure feedback and reconciliation after uncertain responses. Never blindly retry a timed-out send. Thread replies must use the root timestamp and should not broadcast to the channel by default. This is a larger reliability commitment than adding a textbox.

Automated experimental sends are authorized only in haxx and Personal Test. The production read adapter remains restricted to reads; native-composer experiments use Slack’s own editor/send controls. A custom automatic sender and automated work-workspace sends are outside the current test scope. Explicit mark-read implementation remains separate.

## Portability finding

The launcher defaults to `/Applications/Slack.app` and now detects both official Mac distributions; see [direct-download validation](direct-download.md). An Apple Silicon work laptop can still have a different Slack distribution. `npm run doctor` checks the current installation, signature, toolchain, profile ownership and socket path without launching Slack or reading account data. Unrecognized distributions remain blocked, and the actual laptop needs its own runtime check. Static checks do not establish live compatibility. `npm run package:pilot` now produces a 28-file clean source zip with Start/Stop launchers, preflight, setup notes and checksums. Its contents exclude profiles, `.lab/`, evidence and automated send experiments. Node.js 22+ and Command Line Tools are still required on the target Mac.

## Sources

- [Slack conversation read cursor](https://docs.slack.dev/reference/methods/conversations.mark/): takes a conversation and last-seen message timestamp, and synchronizes the result to the user's connections.
- [Slack message posting and thread replies](https://docs.slack.dev/reference/methods/chat.postMessage/): thread replies use the parent message's timestamp; broadcast behavior is separate.
- [Slack separate conversation and thread windows](https://slack.com/help/articles/4403608802963-Open-separate-windows-in-Slack): the native popout behavior exists; its integration with this mod is unproven.

## 0.8.0 progress

Conversation **Mark read** is implemented as a separate module; two fresh DM tests passed without changing local Done or navigating native Slack. It freezes the latest loaded timestamp, verifies identity and current cursor, and never retries uncertain writes. Thread marking remains unavailable; channels and live concurrent arrival still need explicit checks.

Keyboard E/L/P/R, save-confirmed Done/Later advancement, Undo returning to the original reader, and 15m/1h/4h/24h snoozes are implemented. Batch acceptance passed, including a rejected-save path. Busy-workspace coverage/reconnect and work-laptop distribution qualification remain the next larger proof points.

## 0.9.0 recovery progress

Connection-loss acceptance passed in the owned dev client using a 20-second CDP offline interval. Cached messages/local decisions remain usable and both workspaces refresh automatically afterward. The new two-slot queue retains waiting workspace requests, backs off failed/partial reads, respects server cooldowns and preserves discovery paging. Forty-nine automated tests pass, including four-workspace scheduling and partial-count recovery.

Still needed: actual Mac sleep/wake, larger live workspace coverage and the remaining reply/read-state cases. The work laptop's Slack distribution remains unqualified. The clean pilot zip is rebuilt with the new scheduler; no account state or experiment runner is included.

## 0.10.0 native conversation by default

Selecting a queue item now opens Slack's native conversation/thread pane immediately, including its composer, without the intermediate reader or Reply click. Local triage controls move above that pane. Done/Later advance to the next native destination only after saving; Undo restores the previous destination and decision. The selected Attention/Unread row is temporarily retained while open when Slack marks it read. Explicit Read-only view and Option-click retain the no-navigation history workflow.

Live acceptance passed for four destinations across both test workspaces, zero custom-history requests before fallback, rapid selection, collapse/reopen, native local controls and decision restoration. The unread-row hold was checked with a renderer-only simulated count refresh. The navigation probe exposed a workspace/thread restore race; bounded native sidebar retries now recover the missing composer. Destination masking and send guards remain in place. Fifty-one automated tests pass. No automated sends were needed for this change.

Remaining native limitations: unloaded thread roots, conversations absent from Slack's sidebar, arbitrary navigation into secondary native panes, and richer composer controls. Use known thread entries in the triage queue or Normal Slack. Work-laptop distribution qualification and actual sleep/wake remain open.
