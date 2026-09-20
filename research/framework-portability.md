# Portability beyond Slack

Assessment date: September 19, 2026. Implementation baseline: `9a25785` (`Add native quick triage, global notifications, and edge pill polish`). The latest validation at that baseline passed all 154 tests.

This document records a source review and platform-documentation research. No second application was tested, and no implementation changes were made for this assessment. The proposed architecture and qualification work below are deferred ideas, not an active implementation plan.

## Finding

Pimp My Electron has a useful foundation for a general Electron modification framework, but the current application remains substantially Slack-specific. The transport and module lifecycle are reusable. Application-specific assumptions are distributed through the launcher, compatibility probes, window controls, state model, and UI rather than isolated behind one adapter.

That is a reasonable result of proving a complete Slack workflow. Supporting another application would require more than adding a manifest entry, but would not require discarding the existing foundation.

| Layer | Reuse potential | Current dependency |
| --- | --- | --- |
| CDP connection and request handling | High, if the target permits attachment | Launch and target discovery assume Slack |
| Module installation, reload, disposal, and status | Good foundation | Capability probes, manifest fields, and version reporting assume Slack |
| Menu bar, hotkeys, focus return, native edge strip, and hover panels | Reusable on macOS | Settings, commands, and branding assume Slack triage |
| Pill/inbox presentation and local triage behavior | Reusable as a feature package | Messaging concepts, identifiers, navigation, and window control are mixed into the UI |
| Passive unread and message observation | Mostly application-specific | Slack's React/Redux structures, account configuration, read cursors, and message schemas |
| Native conversation and composer embedding | Highly application-specific | Slack selectors, component layout, navigation callbacks, and send confirmation |

## The most important portability boundaries

### Renderer access does not imply native window control

Docking, resizing, window-button visibility, and Spaces behavior currently call Slack's private `window.desktop.window.callBrowserWindowMethod` bridge from [the triage renderer](../src/renderer/triage.js). Screen selection similarly uses Slack's exposed `desktop.screen` interface.

These interfaces are provided by Slack; they are not universal APIs available to every Electron webpage. Electron separates renderer code from privileged preload and main-process capabilities. Successfully injecting JavaScript into another application would therefore not automatically reproduce our native window behavior. See Electron's [process model](https://www.electronjs.org/docs/latest/tutorial/process-model) and [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) documentation.

A different application might expose a suitable bridge, require another native integration, or support only in-window modifications under the same constraints. The ability to attach through CDP must also be qualified for that application's build and launch behavior.

### Passive observation is a transferable strategy, not a universal adapter

The [state observer](../src/renderer/state-observer.js) discovers React stores and reads Slack-specific state, including `selfTeamIds`, `channels`, `channelCursors`, `channelLatests`, unread counts, and thread subscriptions. It also understands Slack's account configuration and identifier formats.

The reusable strategy is to observe existing state, subscribe to changes, and publish bounded snapshots without additional service requests. The discovery mechanism and interpretation need per-application work. Another React application can use different state management, and Electron applications need not use React at all.

Passive coverage also depends on what the host application has loaded. A general framework cannot promise complete background activity or exact unread counts merely because renderer injection works.

### Reusing native UI requires application-specific integration

[Native reply](../src/renderer/native-reply.js) locates Slack's composer and conversation panes, verifies workspace/channel/thread identity, invokes mounted navigation callbacks, and scrolls native message lists. [Send confirmation](../src/send-confirmation.mjs) understands Slack request and response metadata.

Keeping the vendor's editor, draft handling, authentication, and sending behavior is a reusable design principle. Locating, embedding, theming, navigating, and validating that editor remain adapter responsibilities. A generic interface must allow an application to report that a capability is unavailable.

### Launch, identity, and persistence still assume one application

Concrete assumptions occur outside the feature adapters:

- [The launcher](../scripts/dev.mjs) uses the Slack process name, its `--integrationTestMode` flag, Slack target origins, and one `.lab/dev` runtime directory.
- [Installation verification](../src/slack-installation.mjs) checks Slack's signing identity and distribution-specific profile locations. Profile isolation cannot safely be generalized by substituting a command-line flag without testing it.
- [The context guard](../src/context-guard.mjs) accepts Slack origins and workspace routes.
- [The module loader](../src/mod-loader.mjs) recognizes `slackPage`, `sessionConfig`, and Slack version reporting rather than adapter-defined capabilities.
- [The activity store](../src/activity-store.mjs) and [local triage state](../src/triage-state.mjs) encode Slack identifiers and timestamp semantics.
- [Pilot packaging](../scripts/package-pilot.mjs) explicitly packages the Slack implementation.

Supporting multiple applications simultaneously would require separate state, sockets, profile ownership, settings, and shortcut coordination. Application identity and origin validation should become explicit adapter policies; they should not be removed or widened to accept arbitrary pages.

The [native helper](../native/TriageController.swift) uses AppKit and Carbon. Its interaction machinery is reusable across applications on macOS; Windows and Linux support would require separate platform work.

## What the patch system already provides

Mod source lives outside the vendor bundle. The [manifest](../mods/runtime.json) and loader support independently enabled modules, capability checks, runtime installation, new-document registration, cleanup, status reporting, and a compatibility ledger. These are valuable framework foundations.

The implementation uses CDP mechanisms such as [new-document scripts](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-addScriptToEvaluateOnNewDocument) and [runtime bindings](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-addBinding). Reapplying external source avoids repeatedly merging modifications into the vendor's packaged code.

The current compatibility system is nevertheless preliminary:

- Recording an asset fingerprint does not select a compatible adapter or prove behavior.
- Successful installation and basic capability presence do not validate private selectors, state schemas, or navigation semantics.
- There is no general module dependency graph or transactional rollback for arbitrary mods.
- The loader is not a security sandbox for untrusted third-party extensions.

Runtime reapplication improves update resilience; it does not make private integrations update-proof. Moving to on-disk patches would introduce additional constraints: Electron can validate ASAR integrity, and main-process inspector access can be disabled separately. See [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) and [ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity). Renderer debugging and the Node main-process inspector are distinct capabilities.

## Possible future separation

This is a proposed boundary, not a description of interfaces already implemented.

| Part | Responsibility |
| --- | --- |
| PME core | Connections, target lifecycle, trusted-context validation, module lifecycle, diagnostics |
| Platform integration | macOS panels, hotkeys, focus handling, displays, settings-window infrastructure |
| Application adapters | Installation identity, launch/profile behavior, allowed origins, native capabilities, state interpretation, action integration |
| Feature packages | Slack triage, themes, layout modifications, keyboard enhancements, other application-specific workflows |

The inbox should be one feature package. A simple theme or keyboard modification should not require conversations, unread counts, or a composer. Capabilities such as native window control, passive activity observation, and editor embedding should be optional and independently qualified.

Existing security boundaries should remain explicit during any extraction: validate the target application and execution context, retain narrow host operations, separate everyday from development controls, and isolate each application's local state. Broader application support should not imply broader authority for every mod.

## Deferred qualification proposal

Before a broad refactor, one small second-application experiment would test the proposed boundaries:

1. Establish attachment and a safe profile/launch strategy without modifying the vendor bundle.
2. Install and remove a visible UI modification; verify reload recovery and cleanup.
3. Probe native window control and one useful passive state source independently.
4. Record which capabilities work, which require a dedicated adapter, and which are unavailable under the existing constraints.

That would provide evidence for the shared interfaces while preserving the working Slack experience. No second application has yet been qualified, and this document does not claim a particular application's compatibility.
