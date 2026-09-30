# How far can the official Slack client be extended?

> Historical research: findings and status below describe the recorded prototype,
> not the current release. See the [research index](README.md),
> [current setup](../SETUP.md), and [Slack guide](../docs/SLACK-TRIAGE.md).
> Old test permissions and experiment commands are not authorization for new runs.

Research date: September 17–18, 2026. Local source and runtime inspection are the primary evidence for claims about this particular build. Links to general platform documentation are provided where relevant.

## Finding

**Substantial modification is possible without changing the signed Slack application on disk.** We executed our own JavaScript and CSS in its renderer, added a removable UI, connected it to a local process, and controlled native window geometry through Slack's existing internal bridge. We also verified CDP over inherited pipes, avoiding a listening debugger port.

For the requested messaging workflow, a promising implementation is **the official Slack client plus runtime mods and a small native controller**. The controller can own the menu-bar item and global hotkey, while the triage experience runs inside Slack. This keeps Slack's own authentication, transport, and full conversation UI available. It does not make the extensions officially supported by Slack.

The practical limit is different for each layer. Arbitrary browser JavaScript is demonstrated. Selected native Electron operations are demonstrated through an existing bridge. Arbitrary main-process code is a separate, more invasive path that was not executed in this research. Exact non-activating AppKit panel behavior and a reliable live unread/mention/thread adapter remain open.

## What is installed on this Mac

| Item | Observed value |
|---|---|
| Slack | 4.52.155, build 452000155 |
| Electron | 44.0.0 |
| Chromium | 152.0.7977.54 |
| Distribution | Mac App Store; Apple Mac OS Application Signing authority |
| Architecture | Universal bundle; runtime arm64 |
| Identifier | `com.tinyspeck.slackmacgap` |
| Native protections | App Sandbox and hardened runtime |
| Packaging | Tiny `app.asar` architecture dispatcher plus `app-arm64.asar` and `app-x64.asar` |
| Main entry | Architecture archive → `dist/boot.bundle.cjs` → `dist/main.bundle.cjs` |
| Renderer preload | `dist/preload.bundle.js` |

Both Mach-O slices have the same fuse configuration. `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments` are disabled. Cookie encryption, embedded ASAR integrity validation, and `OnlyLoadAppFromAsar` are enabled. Per-archive header hashes in both the application and framework plists matched the installed archives. These are observations from [installed-slack.json](../evidence/installed-slack.json), not assumptions about all Electron apps.

The fuse meanings are defined in [Electron's fuse documentation](https://www.electronjs.org/docs/latest/tutorial/fuses). In this build, ordinary `NODE_OPTIONS` injection, `ELECTRON_RUN_AS_NODE`, and Node inspector attachment are therefore poor starting points. Importantly, the disabled **Node inspector** fuse did not disable **Chromium renderer debugging** in our experiments.

## Capability and approach matrix

| Approach | What it enables | Keeps signed Slack bundle intact? | Evidence and expected maintenance |
|---|---|---|---|
| Supported Slack app/API | App Home, shortcuts, messages, modals, workflows and other supported surfaces | Yes | Documented; strongest API stability, but does not replace arbitrary desktop UI or window behavior |
| Deep links plus OS window management | Open the relevant Slack view, position/show/hide windows, trigger via global shortcut | Yes | Useful low-coupling layer; exact focus behavior still depends on Slack/macOS |
| Manual DevTools JavaScript | Quick UI changes and experiments | Yes | Possible when available; developer-menu visibility and actual permission to open DevTools are distinct in local code |
| CDP runtime mod over TCP | Arbitrary page JS/CSS, DOM interaction, reload scripts, local host bindings | Yes | Demonstrated; localhost debugger endpoint grants broad session control to processes that can connect |
| **CDP runtime mod over inherited pipe** | Same renderer extension route, controlled by the process that launches Slack | **Yes** | **Demonstrated and preferred**; launcher ownership and restart handling must be engineered |
| Existing `window.desktop` bridge | Selected native window operations and desktop functions | Yes | Window methods demonstrated; private Slack interface needs capability checks and adapters |
| Preload source patch | Early JS, custom IPC bridge, changes in exposed renderer capabilities | No | Archive is inspectable and patchable; signing/integrity and preload sandbox must be respected |
| Main-process/bootstrap source patch | Electron menus, global shortcuts, trays, new windows, filesystem/network work within app permissions | No | Offline guarded patch/repack demonstrated; runtime installation/re-signing not attempted |
| Native modules/binary modification | Deeper OS/window behavior beyond existing APIs | No, generally | High complexity; architecture, Electron ABI, signatures and OS protections matter; not experimented with |
| Chrome extension / Tampermonkey | Content scripts if the host loads an appropriate extension | Depends | Electron supports a subset of extension APIs; Slack is not a general Chrome extension host |
| Web Slack with browser extension | Broad browser UI customization | Uses the web client | A possible alternative technically, but does not meet a strict official desktop-client requirement |
| Repackage Slack's JS under another Electron runtime | Broad main-process ownership | No | Becomes a replacement distribution/runtime, outside the preferred requirement |

Supported app surfaces are described in [Slack's surface overview](https://docs.slack.dev/surfaces/) and [shortcut documentation](https://docs.slack.dev/interactivity/implementing-shortcuts/). Electron's [extension documentation](https://www.electronjs.org/docs/latest/api/extensions) explicitly describes partial extension support requiring host integration; simply being Electron does not imply Chrome Web Store installation works. Slack contains some extension-loading code, but we did not establish a general third-party extension installation path.

## Runtime experiments and their limits

### 1. Renderer code, lifecycle, and local companion

In a signed-out Slack integration profile, a Node script connected to CDP and installed `mods/workflow-panel.js`. Eight checks passed:

1. JavaScript execution, while ordinary Node module access was absent.
2. A new Shadow DOM panel and its CSS rendered; computed background color matched the mod.
3. Applying the same mod twice produced one panel.
4. Synthetic DOM key events toggled the custom panel exactly once.
5. A button called a fixed `describe` operation in a local Node companion through `Runtime.addBinding`; the result returned to the panel.
6. Removing the panel's DOM root caused its observer to remount it.
7. A real `Page.reload` created a fresh document in which the registered script reinstalled the mod.
8. Disposal plus removal of the new-document registration kept the mod absent after another reload.

Evidence: [runtime-experiment.json](../evidence/runtime-experiment.json) and [screenshot](../evidence/slack-injected-panel.png). The keyboard check establishes event-handler behavior; it is not a global hotkey test. The companion only returned platform/architecture/runtime version, demonstrating a bridge without creating an unrestricted shell endpoint.

`require` was undefined. `window.process` existed but was a limited exposed object with `versions`, `mas`, and `sandboxed`; neither `getBuiltinModule` nor `binding` was present. A variable named `process` is therefore not evidence of arbitrary Node access. The packaged code sets `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox) explain why renderer, preload, and main-process capabilities differ.

### 2. Native window control without a bundle patch

The decisive local discovery was:

```js
const windowId = await window.desktop.window.getWindowId();
await window.desktop.window.callBrowserWindowMethod(windowId, "getBounds");
```

The preload exposes this bridge, and Slack's main process maintains an allowed list of BrowserWindow methods. Tests in the disposable profile demonstrated:

- Moving the actual Slack window to the left and right edges at width 388.
- Changing its minimum size and requesting widths 68, 44, and 12; each was returned as the actual native width.
- Setting and querying always-on-top.
- Setting and querying visibility on all workspaces.
- Minimizing and restoring the native window.
- Restoring the original size constraints, geometry, and tested flags.

Evidence: [native-window-experiment.json](../evidence/native-window-experiment.json). This is stronger than a CSS-only sidebar: the outer application window changed. It does not prove full-screen Spaces behavior, multi-monitor restoration, or that the normal Slack interface remains usable at 12px. Those widths need a purpose-built compact UI.

`Browser.getWindowForTarget` was not available in either our page session or the pipe's browser connection. Native control succeeded through **Slack's bridge**, not a portable assumption about every CDP Browser domain command. That bridge is version-dependent and is not a public Slack SDK. Do not expose its entire method list to arbitrary third-party mods.

### 3. No-port transport

Launching Slack with `--remote-debugging-pipe` and inherited file descriptors 3/4 supported browser discovery, attaching to a renderer, evaluating JavaScript, mounting the custom UI, and reading window properties through Slack's bridge. `lsof` reported no listening TCP sockets for the Slack parent process. Evidence: [pipe-experiment.json](../evidence/pipe-experiment.json).

The fallback socket experiment listened on `127.0.0.1` only. Electron documents the [remote-debugging-port switch](https://www.electronjs.org/docs/latest/api/command-line-switches). The pipe result is independently established by our local test. A pipe removes the broadly reachable local debugging endpoint; it does **not** make injected code untrusted or recreate stock Slack's exact security posture. The launcher and enabled mods still acquire substantial control over the session.

The launcher must start Slack itself with the pipe handles, and handle updates, crashes, restarts, and normal Dock launches. The pipe is not a way to attach retroactively to an arbitrary already-running Slack process. A normal launch remains a useful stock-client fallback.

### 4. SlackAssist-style synthetic UI inside Slack

`mods/triage-lab.js` adds a synthetic triage surface and couples its display state to actual native window sizing. The demo passed at 44px cluster, 388px queue, and 772px reading widths. It supports left/right docking, collapse, a local keyboard toggle, and stepping back with Escape. Geometry and always-on-top are restored on disposal.

Evidence: [triage-demo.json](../evidence/triage-demo.json), [cluster](../evidence/triage-cluster.png), [queue](../evidence/triage-expanded.png), [reading](../evidence/triage-reading.png).

**This is synthetic content, not a working live triage client.** No real messages were sent by any test. We did not test live replies, mark-read, unread aggregation, attachments, huddles, enterprise policies, or cross-workspace correctness. The screenshots capture renderer content, not the macOS titlebar or desktop.

### 5. Actual source patching, offline

The application's JavaScript is readable, despite minification. `scripts/asar_patch_experiment.py` copied the tiny architecture-dispatcher archive, required a unique bootstrap anchor, inserted a harmless JavaScript marker, rebuilt offsets and per-file integrity data, and read the new archive back successfully. The installed source archive's hash remained unchanged.

The modified header hash differs from the hash in Slack's signed metadata. Evidence: [asar-patch-experiment.json](../evidence/asar-patch-experiment.json). We did **not** launch a modified bundle or claim to have demonstrated working ad-hoc re-signing of this Mac App Store app.

Electron's [ASAR integrity documentation](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) describes runtime verification against packaged metadata and termination on mismatches. A deployable source patch would need correct integrity metadata and a valid local signing arrangement for the modified bundle. Changing signed metadata or sealed resources invalidates the original signature. Re-signing cannot preserve Slack/Apple's publisher identity. Keychain access, sandbox/application-group entitlements, updater behavior and notarization become separate engineering concerns; outcomes depend on distribution and identity.

The attraction of a main bootstrap patch is broad native access and a small hook. The cost is that it changes the delivered app. For the user's requirement, the demonstrated runtime path should be exhausted first.

## How much arbitrary functionality is practical?

**Strong candidates:** custom keyboard navigation, compact activity surfaces, layout and typography changes, independent panels/overlays, local queue metadata such as snooze or priority, a command palette, context-aware navigation, and integration with a local companion. The host can run normal Node or native code; the renderer need not be granted Node access. The companion's OS permissions remain its own.

**Plausible but adapter-heavy:** live unread/mention/thread aggregation, merging workspaces, extra contextual message actions, custom reply flows, watching client events, and integration with the web application's state. These require a separate investigation of the loaded webapp's stable-enough interfaces. DOM virtualization means offscreen messages may not exist. Background workspaces may not have a live renderer. The exposed desktop Redux subset is not proof that the entire message store is accessible through a stable API.

**Requires native help or deeper patching:** a menu-bar icon, a shortcut that works while another app is active, a true non-activating floating reader, and new native windows with different creation-time properties. [Electron global shortcuts](https://www.electronjs.org/docs/latest/api/global-shortcut) and [Tray](https://www.electronjs.org/docs/latest/api/tray) are main-process APIs. A separate AppKit helper can supply a menu and hotkey while continuing to control the official Slack window. Exact Ledge-like typing focus is not established by `alwaysOnTop` or `showInactive`.

**Not unlocked by client modification:** server-side permission changes, content the account cannot access, bypassing retention, enabling paid server features, or removing service rate limits. Local code can change presentation and orchestrate available actions; Slack's backend remains authoritative. If supported APIs are used, scopes, app installation, and method-specific limits still apply. [Slack's rate-limit documentation](https://docs.slack.dev/apis/web-api/rate-limits/) distinguishes internal customer-built apps from some commercially distributed non-Marketplace apps; do not assume a blanket one-request-per-minute rule for this personal/internal project.

## Update resilience: two independent moving targets

Slack has a packaged desktop shell **and** a remotely delivered web application. UI and data interfaces can change without the desktop version changing. A successful patch application is not evidence that the mod still means the same thing.

The strongest design is to keep mods outside `Slack.app` and reinject them at launch or navigation. Prefer independent UI roots and semantic adapters to editing Slack's minified bundles. Track desktop version, bridge capabilities, and a non-sensitive webapp/build or capability fingerprint. Fail a particular mod closed when its assumptions fail; preserve a way to open stock Slack.

Suggested independently enabled mods:

```text
window.docking       geometry / per-display placement
ui.triage            cluster → queue → reading state machine
keys.navigation      local shortcuts / focus return
data.activity        unread, mentions, threads / workspace scopes
actions.handoff      navigation to native Slack conversation views
host.controller      menu-bar entry / global shortcut / launcher
```

Each needs an ID/version, dependency/capability declarations, enable/disable state, install/probe/dispose lifecycle, bounded retries, and specific postconditions. Tests should check behavior: one click causes one action; unknown counts remain unknown; a reload doesn't duplicate handlers; failed sends preserve drafts; incompatible selectors disable an action. The current sample manifest only illustrates metadata and is **not** an implemented permission sandbox or update manager.

If source patching eventually becomes necessary, patch a minimal loader entry on a pristine copy of each new release. Use an exact known hash or a uniquely recognized AST/semantic anchor, assert the expected match count, generate the patched output in staging, rebuild integrity metadata, then verify signatures and behavior before installation. Record the source version and output hashes. Refuse ambiguous edits. Never recursively patch already-patched output or silently substitute a fuzzy text match. A rollback should restore the pristine release, not attempt to reverse unknown application changes.

An actual old-version → new-version Slack migration was **not** tested here. Reload persistence and idempotence passed on one version. Future-build resilience is a design proposal with measurable gates, not a guarantee.

## Comparison with existing work

[slack-debloat](https://github.com/benri-ai/slack-debloat) is a contemporary, small implementation of the external CDP/CSS/JS approach. Its README describes a loopback-port injector, reload behavior, and selector maintenance. We inspected it as prior art; we did not execute its installer. Our independent tests add evidence for this installed Slack version, a private-pipe route, and the native window bridge. It is useful reference code, not evidence of a mature general-purpose Slack plugin ecosystem.

Older [custom-slack-css](https://github.com/openark/custom-slack-css/blob/master/README.md) instructions target Slack 2.8.2-era files. This installation has different archives, integrity metadata, and sandbox configuration. Old `ssb-interop.js` edits and claims that `SLACK_DEVELOPER_MENU` always opens useful DevTools should not be treated as current universal instructions.

## Experimental boundaries and cleanup

The first `--user-data-dir` probe opened a previously signed-in workspace. Only target metadata was queried before terminating that process; no custom code was injected into that workspace. We then verified the separate `--integrationTestMode` route and restricted all feature experiments to `/ssb/first`, the signed-out welcome page. Launching Slack can perform its normal background work; the initial run should not be described as proof of a completely untouched account state.

All experiment-launched Slack processes were terminated, debugger listeners closed, and disposable profiles preserved under ignored `.lab/`. `/Applications/Slack.app` was not patched or re-signed. Its strict/deep code-signature check passed after the experiments. No SlackAssist source files were changed. No message sends, reactions, status changes, or explicit mark-read actions were performed by the experiments.

The remaining high-value research is a read-only live message-state adapter, then tightly controlled reply/read-state tests, exact focus behavior, and restart/update recovery. Those are the gates between demonstrated extensibility and a dependable everyday triage workflow.
