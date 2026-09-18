# A triage layer for the official Slack client

**Original design/research proposal.** The implementation has since advanced through the six phases below. For current behavior and acceptance limits, use [the live workflow guide](live-prototype.md) and [delivery status](implementation-plan.md). Tables below preserve confidence levels at the time of the original proposal.

This recommendation incorporates `/Users/geoffp/Projects/SlackAssist` (Ledge), especially `README.md`, `Ledge/App/ShadeWindowController.swift`, `Ledge/App/KeyboardShortcuts.swift`, `Ledge/UI/ShadeView.swift`, `Ledge/Model/Models.swift`, and `Ledge/Model/ThreadInbox.swift`. The repository was read as a reference implementation; it was not modified, built, or launched.

## Preserve the interaction model

Ledge already provides a thoughtful progression: 12pt peek, 44pt cluster, 68pt rail, 388pt list, 772pt reading view, plus an auto-hidden strip. It anchors panes to the selected screen edge, restores a preferred monitor, supports a configurable global toggle, steps backward with Escape, and keeps drafts through some transitions. Its SwiftUI views and AppKit window controller are separable from its Slack transport.

The important product goal is not matching every pixel. It is making attention proportional to the work needed: glance, decide whether to engage, resolve a small item, and return to the previous task without browsing the rest of Slack.

| Ledge behavior | Official-client route | Current confidence |
|---|---|---|
| Tiny cluster / rail | Custom renderer UI + existing window bridge | Native 12/44/68px widths verified; 44px synthetic cluster rendered |
| Queue → reading disclosure | UI state machine controlling renderer layout and outer bounds | 388px and 772px synthetic demo passed |
| Left/right docking | Bridge `setBounds`; Slack screen API for work-area geometry | Both edges verified on the built-in display |
| Always-on-top | Existing bridge `setAlwaysOnTop` | Verified |
| Minimize / restore | Existing bridge methods | Verified |
| Auto-hide and idle decay | Timers, state machine, and bridge geometry | Technically plausible; not implemented in current demo |
| Preferred monitor / fallback | Screen selection plus display-change handling | Existing Ledge logic is a useful reference; not tested here |
| Menu-bar icon | Small native helper with `NSStatusItem` | Already implemented in Ledge source; integration with Slack mod not built |
| Global hotkey | Native helper using Ledge's hotkey registration approach | Reusable concept; prototype shortcut is only in-window |
| Non-activating typing | Ledge's native `NSPanel` behavior | Not demonstrated in official Slack; likely requires a native panel path or changed interaction |
| Unified DM/channel/thread attention | Adapter inside Slack's authenticated renderer | Main unproven data-model task |
| Reply and mark-read | Keep Slack's own view/composer initially | Live action correctness not tested |

Ledge creates a borderless `.nonactivatingPanel`, sets a floating window level, and opts into multiple Spaces. This is meaningfully different from shrinking a normal Slack window. Apple's [NSPanel documentation](https://developer.apple.com/documentation/appkit/nspanel) and [nonactivating style](https://developer.apple.com/documentation/appkit/nswindow/stylemask-swift.struct/nonactivatingpanel) describe the native distinction. Electron has [creation-time window options](https://www.electronjs.org/docs/latest/api/structures/base-window-options), but our runtime bridge tests did not create a new panel-type window.

## Recommended first architecture

```text
Small native controller
  menu-bar icon, global toggle, launch/restart ownership
  owns the private CDP pipe and a narrow set of host operations
                    │
                    ▼
Official, signed Slack application
  existing authentication / network / conversation rendering
  runtime loader → individually enabled mods
                    ├─ triage surface and keyboard state machine
                    ├─ window adapter using the existing desktop bridge
                    ├─ read-only activity adapter
                    └─ handoff to Slack's own conversation / reply UI
```

Keep message content and the reader inside Slack for the first implementation. A native menu/shortcut controller is not a second messaging client. Reusing all of Ledge's external message-rendering and credential-extraction backend would be a materially different architecture, even if Slack remains installed. It should not quietly replace the user's official-client requirement.

The controller can reuse ideas or selected code from Ledge's `HotKey`, `KeyboardShortcuts`, `MenuBarIcon`, and display-selection components. The existing independent `SlackClient`/`InternalAPISlackClient` transport should not be the default for this direction. Avoid copying Slack session credentials into a second application merely to reproduce state that Slack already owns.

A helper introduces its own trust boundary: renderer requests should be named, validated operations, not arbitrary shell strings. The tested read-only `describe` bridge is a minimal example. A production helper may be native rather than Node; Node is just the current experiment harness.

## Interaction proposal

1. **Rest:** a quiet menu-bar indicator or small edge cluster. Do not open or mark conversations read just to determine whether they need attention. Offer full hide during focused work.
2. **Glance:** global shortcut reveals a compact queue of DMs, mentions, and followed-thread activity. Show “count unknown” or a dot where exact counts are unavailable.
3. **Choose:** keyboard selection expands context. Keep “unread in Slack” separate from “still needs my action”; those are different states.
4. **Act:** use the official Slack conversation/thread view and composer for the first version. Add local triage actions such as “later” or “done for now” separately from Slack read status. Avoid cloning rich-text, attachments, reactions, retry behavior, and thread semantics until needed.
5. **Return:** Escape moves reading → queue → rest. Preserve the current draft and selection. Track the previously focused application/window and explicitly test return behavior.

Slack already supports [separate conversation/thread windows](https://slack.com/help/articles/4403608802963-Open-separate-windows-in-Slack), making a dedicated official Slack triage window worth investigating. Whether the desired main/child-window bridge and routing behavior match is a test gate, not yet an established implementation. A fallback is a temporary “triage mode” on the main Slack window with a reliable restore action.

The synthetic demo demonstrates disclosure and geometry; its fake message list and draft box are not the proposed production backend. In particular, no real send button has been implemented.

## The difficult part: a dependable attention queue

The next research slice should identify a read-only adapter for Slack's loaded webapp. Do not couple every mod to private store names or bundled module IDs. Expose a small application-owned model:

```ts
type AttentionItem = {
  workspaceId: string;
  conversationId: string;
  threadTs?: string;       // Keep Slack timestamps as strings.
  kind: 'dm' | 'mention' | 'thread' | 'channel';
  unread: boolean | 'unknown';
  unreadCount: number | null;
  needsAction: boolean;    // Our local triage state, not Slack read state.
  observedAt: number;
  source: 'slack-state' | 'visible-dom' | 'supported-api';
};
```

A row disappearing from a virtualized DOM is not evidence it was read. A workspace with no loaded renderer is not necessarily up to date. An error is not an empty queue. Key local triage records by workspace + conversation + thread, and retain last-good state with an explicit stale marker rather than silently dropping it.

Prefer the following sources in order of actual suitability, not assumed availability:

- Stable supported API/event surfaces, if they expose the exact needed state and workspace installation is available.
- A narrowly isolated adapter to the official webapp's in-memory state or event stream, after read-only verification.
- Visible DOM only for narrowly scoped navigation or presentation, with explicit limitations on completeness.

A public Slack app is not automatically a complete mirror of the signed-in person's client. Available scopes, subscription events, unread semantics, and thread read state all need method-level verification. Conversely, access to private webapp internals is not a stability promise. Ledge's existing count-exactness and thread-inbox models are useful design references, not proof the new adapter already exists.

## A patch system that fits this goal

Use runtime modules with explicit lifecycle and compatibility checks, not a collection of untracked console snippets. Separate generic transport/lifecycle logic from Slack version adapters and actual UX features.

Each mod should provide:

```ts
interface Mod {
  id: string;
  version: string;
  probe(context: Context): Promise<SupportResult>;
  install(context: Context): Promise<{ dispose(): Promise<void> }>;
}
```

The loader owns target discovery, document lifecycle, initial injection, teardown, per-mod error reporting, and reconnection. Each mod owns its observers, styles, event handlers, timers and narrowly scoped state. A failed activity adapter must not disable the ordinary Slack client or silently mark everything complete.

Concrete update policy:

1. Leave Slack's original bundle and updater untouched.
2. Detect a new desktop version or webapp capability fingerprint; preserve mod settings separately.
3. Re-run read-only probes and UI smoke checks. Independent UI mods can pass even if a data adapter fails.
4. Enable only compatible modules; disable action modules on ambiguous selectors or changed schema.
5. Restore known window bounds and provide a stock-client launch when the controller cannot attach.
6. Register new-document scripts for reloads and discover new targets for popouts; avoid duplicate handlers after reconnection.
7. Keep a small compatibility ledger with the tested app/webapp environment and behavioral results.

Runtime patches are naturally re-applied after updates because their source files live outside Slack. This eliminates many binary-merge problems, not semantic breakage. A future release can remove debugging support or the internal bridge entirely. Do not freeze Slack updates indefinitely to keep a mod working.

The repo currently proves selected lifecycle behaviors and a source-patch guard. It does not yet implement this full loader, multi-target reconnection, update detection, settings UI, or launch-at-login service.

## Implementation gates, in order

| Gate | Deliverable | Pass condition |
|---|---|---|
| 1. Runtime and geometry | Current lab | Passed: UI, bridge, pipe, disclosure widths, rollback |
| 2. Read-only live attention | One-workspace DM/mention/thread adapter | Counts, stale state and workspace identities agree with Slack; no mutations |
| 3. Low-disruption shell | Native menu/global hotkey; dedicated official Slack view | Reliable show/collapse/focus return on target displays and Spaces |
| 4. Real triage actions | Handoff to Slack composer; local later/done state | No accidental read changes on glance; drafts survive collapse; confirmed destination |
| 5. Multi-workspace behavior | Aggregation, identity scoping and lazy workspace handling | No cross-workspace actions; unloaded/failed workspaces visibly stale |
| 6. Recovery and updates | Reconnect, per-mod failure isolation, compatibility ledger | Reload/popout/restart/crash/shell update/webapp change leave stock Slack usable |

The decision after Gate 3 is whether focus return is sufficient or true non-activating text entry is essential. If the latter cannot be achieved using the official window, explicitly choose between a deeper native/main-process patch and an external reader. Do not treat CSS, `showInactive`, or always-on-top as an already-proven equivalent to Ledge's `NSPanel`.

The strongest starting point is therefore **Ledge's interaction model, implemented as a modded official Slack surface, with a minimal native launcher/controller**. The experiments justify building that next slice; they do not yet justify promising a production-ready, update-proof inbox.
