# Inbox translucency prototype

September 23, 2026. Default off; local testing only, not a broad performance qualification.

## Implementation

Settings → Appearance & behavior → **Translucent inbox (experimental)** enables
one Electron `setVibrancy('hud')` material. A lightly tinted, accent-aware background
covers it in the custom inbox. Text keeps its full opacity. The native conversation
pane, composer, loading covers, menus, pill and strip remain opaque. The sliding
reader and loading covers are clipped at the inbox boundary, so the inbox keeps
the same tint throughout the animation. The parked Slack page is hidden and
clipped out of the inbox region, including its native detail descendants.

No CSS blur/backdrop-filter, whole-window opacity, screenshot loop, new debugging
transport, or Slack API requests are involved. State changes are serialized and
deduplicated rather than reapplied on each activity snapshot. Returning to ordinary
Slack restores the original native material. The system Reduce Transparency
preference suppresses the custom effect.

## Why the first probe failed

Calling `setVibrancy` on a window constructed without native transparency was not
enough. Clearing Chromium's backing color with a CDP Emulation override exposed
rectangular rendering artifacts; the user also observed these. That override was
removed entirely. Setting Slack's own `windowVibrancy` preference before a fresh
launch produced a clean native material. A mod reload does not recreate the window.

On first enable, the mod saves the original native preference in a small local
`.lab/dev/native-appearance.json` recovery record, then uses Slack's preference
bridge to enable native transparency. Settings reports when a real restart is
needed and the inbox stays opaque until then. Recovery is scoped to the owned
Slack profile; launch identity prevents a mod reload from being mistaken for a
restart. Disabling restores the original preference. If Slack transparency was
already enabled, it is preserved. Failed preparation leaves the inbox opaque.
Only this appearance preference is read/changed; the record contains no messages
or credentials. Keep the record until opting out so the prior value can be restored.

The native material spans the whole BrowserWindow, even though we expose it only
behind the inbox. `hud` names the material, not its extent. The wider layout
therefore also needs performance testing.

## Local checks

The development copy updated itself during the experiment. Final checks used
Slack **4.52.162**, Electron **44.3.0**, macOS **26.6.2**, built-in Retina display
at approximately **120 Hz**, with two test workspaces. No test messages were sent.

Initial six-second samples with the sidebar material, one run per condition:

| Layout | Blur | Scroll p95 frame interval | Frames >33.4 ms | Idle Slack CPU, summed |
|---|---|---:|---:|---:|
| Inbox | Off | 8.8 ms | 0 | 3.00% |
| Inbox | On | 9.1 ms | 0 | 2.50% |
| Inbox + native Activity | Off | 8.8 ms | 0 | 2.66% |
| Inbox + native Activity | On | 9.0 ms | 0 | 2.67% |

WindowServer CPU was roughly 43–47% in both cases, with other desktop activity
running; these samples cannot isolate its cost. Renderer/utility/GPU work shifted
between processes during scrolling. The data supports continuing a local trial,
not claiming blur is free or that it improves performance. The expanded sample
scrolls our inbox alongside native Activity, not a long native message history.

Five hide/reopen cycles per condition completed their internal transitions in
4–30 ms. This excludes OS presentation latency and does not prove time to visible
pixels. The native DM view and return to normal Slack were visually checked.
Unit/integration tests cover default-off behavior, native preference recovery,
restart detection, rapid toggles, cleanup, and Reduce Transparency handling.

To repeat the bounded experiment in the authorized test workspaces, launch with
`npm run dev:debug`, enable the option and restart once if needed, then run:

```sh
node scripts/benchmark-backdrop.mjs
```

The script restores the original toggle and ends in the queue. It writes timing
and process CPU summaries to `.lab/dev/backdrop-benchmark.json` (ignored by Git).
It does not send messages. Slack may perform its ordinary native Activity loads.

Follow-up: the sidebar material and 68% dark tint looked different but did not
visibly respond to a large white window behind the inbox. The initial performance
samples therefore qualify the rendering path, not a verified desktop blur effect.
With the custom tint removed, a renderer screenshot had a fully transparent
background (RGBA alpha 0); macOS Reduce Transparency and Increase Contrast were
both off. A temporary HUD material probe worked briefly, but reopening the inbox
restored the original sidebar material. The old animation also deliberately made
the inbox opaque and slid the loading cover behind it.

The saved implementation now uses HUD with a 28% dark tint and clips the sliding
surfaces instead of making the queue opaque. The user confirmed that the backdrop
stays visible after opening/closing a conversation and reopening the inbox, and
that the solid pane no longer shows through it. A Chromium layout probe using the
actual stylesheet checked widths 420, 450, 520, 620, 750 and 820 pixels: the reader,
header and loading cover all start drawing at x=420, and the queue tint and gradient
remain unchanged. The renderer test also checks restoration of HUD after ordinary
Slack mode.

Repeating the same short benchmark with the saved HUD implementation produced
p95 frame intervals of 8.9/9.0 ms with the effect off (inbox/expanded), and
9.1/9.0 ms with it on. None of the four scroll samples had a frame over 33.4 ms.
Idle Slack CPU summed to 3.33/3.51% off and 5.16/2.50% on; these short samples
remain noisy and do not establish sustained power cost. WindowServer was about
44–48% across the measurements. All 308 automated tests passed after the fix.

Still needed: longer normal work sessions, native-history scrolling and typing, moving background
content, external displays, and work-laptop battery/thermal checks. Conversation
background blur remains deferred until this smaller trial is satisfactory.

## References

- [Electron native macOS material implementation](https://github.com/electron/electron/blob/v44.0.0/shell/browser/native_window_mac.mm#L1299)
- [Electron custom window styles and transparency limitations](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)
- [Slack theme and window transparency preferences](https://slack.com/help/articles/205166337-Change-your-Slack-theme)
