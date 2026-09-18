# Delivery status: official Slack triage

The target is a usable development workflow inside signed, unmodified Slack: quiet resting presence, global keyboard access, progressive disclosure, local attention management, and return to the previous task. SlackAssist/Ledge is a read-only reference. Slack owns sending, reactions, presence and its native read behavior. The read adapter remains read-only; the native-reply module now exposes Slack’s own verified editor inside triage.

Updated September 18, 2026. The six phases are implemented; acceptance boundaries below remain explicit.

| Phase | Implementation and acceptance |
|---|---|
| 1. Local attention | Persistent Done/Later/Pin, 30-second Undo, Attention/Later/Done views, new-activity reopening. Live Later/Pin/Undo and Done reload persistence passed. A user-sent DM in the background workspace reopened Done; Slack unread remained independent. No message bodies persisted. |
| 2. Native shell | Menu icon/count, global shortcuts, strip/rail/queue/reader, idle collapse, hide/minimize, preferred display/edge and focus return. User confirmed the initial shortcut, thin strip and focus return. The user also confirmed cross-Space opening, collapse and focus return after the correction below. |
| 3. Reader and handoff | Safe text/mentions/emphasis/code/links, names, attachment indicators, discoverable threads, paging, retained selection, keyboard controls and ordinary-Slack handoff. Populated DM and channel threads read live. Handoff currently targets the parent conversation, not the exact thread. Native Reply now reframes the official editor inside triage; see the sprint result below. |
| 4. Workspace/activity coverage | Explicit workspace/All switcher, lazy history, bounded signed-in workspace discovery/count/thread reads, identity verification and partial/error labels. Four unread conversations plus two threads across two workspaces loaded without navigating Slack. Ambiguous passive background requests are ignored; authenticated scoped reads supply their data. |
| 5. Lifecycle/recovery | Versioned manifests, capability probes/fingerprint ledger, independent module disable/enable and cleanup, serialized reload/discovery, detach recovery, automatic helper startup/cleanup, disconnected notice and stock escape. Live module removal/reinstall, page reload, and full client restart passed. |
| 6. Acceptance | Automated and live content-free evidence recorded under `evidence/`. Two sign-ins and all local state survive client restart. Native geometry/docking/restoration passed. Remaining environment-specific cases are listed below. |

## Spaces acceptance

The first implementation did not request all-Spaces visibility. The user reported the strip stayed on its original Space and opening triage switched back there. Applying all-Spaces/full-screen visibility fixed the strip and opening; the user confirmed both follow the current Space.

The user then reported collapse jumped back to the original Space. The native controller now clears stale focus targets when the active Space changes and only activates a return target with a normal window currently on screen. It can choose the visible app underneath Slack when the previous target is stale. This uses window metadata, not screen pixels or window titles, and adds no Accessibility permission requirement. The user retested on another desktop Space and reported “working!”: opening, collapsing and focus return now stay on the current Space.

Normal Slack restores the original all-Spaces flag. True nonactivating NSPanel-style typing is still unproven; activation plus focus return is the chosen initial workflow.

## Limits and future qualification

This is a usable development build with bounded coverage, not a certified replacement for Slack's inbox. Thread discovery is bounded, histories are lazy and memory-bounded, unread state may be unknown/stale, and Slack's own selected conversation behaves normally. Cross-workspace passive data without reliable provenance is discarded instead of guessed.

Multiple monitors/hot-unplug, full-screen combinations, popout windows, real Slack application/webapp upgrades, and multi-page live history need dedicated acceptance. These are not blockers to using the tested laptop workflow, and they are not claimed as passed. Unknown Slack builds are labeled untested in the compatibility ledger. Capability probes do not guarantee that private APIs preserve their semantics.

A clean source transfer bundle with preflight and Start/Stop command files is now built by `npm run package:pilot`. No notarized installer, login item or production-profile migration was installed. Start with `npm run dev`, recover with `npm run shell -- stock`, and stop with `npm run dev:stop`. The isolated development sign-in is preserved.

## Next: work-laptop productivity pilot

The user is preparing an Apple Silicon work-Mac test later today. Follow [the next proof points](pilot-next.md): busy-workspace coverage, exact-thread/native-composer reply flow, explicit Mark read, faster local decisions, and portable setup. `npm run doctor` is implemented and passed on the development machine; the target laptop is not yet qualified. A separately removable, user-invoked conversation read-cursor action is now enabled; there is no custom send API. User-operated native composition and authorized experimental native sends are now proven in the test workspaces.

**Accepted stretch goal:** reply directly from the compact triage flow using official Slack client capabilities. Explore the native composer in place, then an integrated compact native reply window if needed. Exact-thread routing, draft preservation, composition keyboard behavior and return-to-triage are required; a full Slack handoff alone does not fulfill the stretch. See the [stretch acceptance criteria](pilot-next.md#accepted-sprint-stretch-reply-from-the-triage-view). The user subsequently authorized automated experimental sends in haxx and Personal Test only; verify destination and use clearly labeled test messages.

## Native reply sprint result

`native-reply` 0.7.0 presents Slack’s existing conversation/thread pane beside the queue at 820 pixels. It does not move React-managed nodes or copy drafts. Slack’s native workspace switcher and conversation sidebar handle navigation; direct URL assignment was rejected after Slack restored its previous workspace during a probe. Active workspace, channel and exact thread timestamp must match before exposing the editor, and Send/Enter are checked again. DOM observations also wait for Slack’s active workspace to agree with its URL.

Four authorized labeled sends passed (DM and DM-thread in Personal Test, DM and channel-thread in haxx), each verified once in the intended destination. A Personal Test DM draft survived collapse/reopen and a workspace round trip. Thirty-four automated tests pass. Hands-on composer focus across Spaces has been requested and is pending; earlier queue/reader Spaces acceptance does not establish composer acceptance.

Known limits: missing-sidebar conversations and unloaded thread roots may need manual opening in Normal Slack before retrying; richer native controls and the remaining workspace/type combinations are unproven. Escape stays with Slack while composing, and ⌘⇧Y/Collapse returns to work. Explicit Mark read remains separate.

Native Reply lifecycle acceptance also passed: module removal/re-enable preserves the same native editor and draft, and collapse/reopen plus workspace round trip recover the intended target without a send. `evidence/native-reply-lifecycle.json` records the result. The 28-file pilot zip was checked for checksums, executable launchers, syntax and module manifest; it contains no `.lab/`, profiles, evidence or automated send experiments. This source-bundle check does not qualify the target laptop.

## Conversation Mark read and faster local decisions

The 0.8.0 build adds a separate `mark-read` module. The host admits only known non-thread destinations with a loaded timestamp, and freezes that timestamp before any async work. The renderer freshly verifies the account, checks the current cursor, writes once, then reads counts for confirmation. Unknown outcomes never trigger an automatic retry. Two user-supplied unread DMs passed: triage reading retained unread; explicit marking cleared it, with one request per workspace and no change to local records or native navigation. Threads remain disabled; channel and true concurrent-inbound live acceptance are pending.

Done and Later now wait for successful local persistence before advancing to the next visible item. Undo restores the original reader and record. Reader shortcuts E/L/P/R and 15-minute/1-hour/4-hour/24-hour snoozes are implemented. Live batch checks restore all records and make no Slack writes. Search/native-composer inputs retain their keys; the duration selector retains arrows; rejected decisions keep the user's place. See `evidence/mark-read-checks.json` and `evidence/batch-triage-checks.json`.

## 0.9.0 recovery and refresh queue

A bounded scheduler replaces refresh attempts that could be dropped while both concurrency slots were busy. It runs two reads at a time, retains pending work across workspace bursts, coalesces requests and observes retry deadlines. Last-success timestamps survive failure; partial counts stay visibly partial; periodic refresh does not reset the discovery cursor. Renderer online/offline signals, socket reconnects and long timer gaps request fresh reads without replaying mutations.

Forty-nine tests pass. Live acceptance used a 20-second renderer-only CDP offline interval: an actual read failed, cached content stayed visible, local Pin/Undo worked, and both workspace refreshes recovered in the same Slack process. No sends/Mark read requests occurred. See `evidence/recovery-checks.json`. Actual OS sleep/wake and busy work-account coverage remain unproven. The normal launcher leaves developer network experiments disabled.

## 0.10.0 native conversation by default

Selecting a queue item now opens Slack's native conversation/thread pane immediately, including its composer, without the intermediate reader or Reply click. Local triage controls move above that pane. Done/Later advance to the next native destination only after saving; Undo restores the previous destination and decision. The selected Attention/Unread row is temporarily retained while open when Slack marks it read. Explicit Read-only view and Option-click retain the no-navigation history workflow.

Live acceptance passed for four destinations across both test workspaces, zero custom-history requests before fallback, rapid selection, collapse/reopen, native local controls and decision restoration. The unread-row hold was checked with a renderer-only simulated count refresh. The navigation probe exposed a workspace/thread restore race; bounded native sidebar retries now recover the missing composer. Destination masking and send guards remain in place. Fifty-one automated tests pass. No automated sends were needed for this change.

Remaining native limitations: unloaded thread roots, conversations absent from Slack's sidebar, arbitrary navigation into secondary native panes, and richer composer controls. Use known thread entries in the triage queue or Normal Slack. Work-laptop distribution qualification and actual sleep/wake remain open.

## 0.11.0 portability and source repository

Shared signed-bundle detection selects App Store or direct-download integration profiles. Ownership records preserve both layouts and migrate the original marker. The selected app version reaches the mod loader. Direct-download 4.52.155 startup, profile isolation, private pipe, renderer injection and native-window checks pass; signed-in acceptance is pending. See [the qualification record](direct-download.md). Fifty-five unit tests also pass from a clean source checkout. Clone/setup instructions live in [SETUP.md](../SETUP.md); local evidence, profiles, downloads and generated bundles are excluded from Git.
