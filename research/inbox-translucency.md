# Inbox translucency prototype

> Historical research: findings and status below describe the recorded prototype,
> not the current release. See the [research index](README.md),
> [current setup](../SETUP.md), and [Slack guide](../docs/SLACK-TRIAGE.md).
> Old test permissions and experiment commands are not authorization for new runs.

September 23, 2026. Default off; local testing only, not a broad performance qualification.

## Implementation

Settings → Appearance & behavior → **Translucent inbox (experimental)** enables
one helper-owned macOS HUD material behind the inbox and revealed detail pane. Its visual effect state
is `.active`, so it remains blurred when Slack loses focus. A lightly tinted,
accent-aware background covers it in the custom inbox. Text keeps its full opacity. Background tint is configurable from 0–100% (default 28%). The detail tint adds
35 percentage points by default, independently adjustable as an offset and capped
at 100%. Native structural backgrounds are cleared only inside the glass-enabled
embedded pane; a single tint at its boundary avoids compounded opacity. Text,
composer controls, menus, pill and strip remain opaque. The sliding
reader and loading covers are clipped at the inbox boundary, so the inbox keeps
the same tint throughout the animation. The parked Slack page is hidden and
clipped out of the inbox region, including its native detail descendants.

No CSS blur/backdrop-filter, whole-window opacity, screenshot loop, new debugging
transport, or Slack API requests are involved. State changes are serialized and
deduplicated rather than reapplied on each activity snapshot. Returning to ordinary
Slack restores the original native material and shadow. The system Reduce Transparency
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

The original Electron material spanned the whole BrowserWindow. The helper's
click-through, nonactivating panel confines it to the inbox plus the actually revealed detail region instead. The existing
private Unix socket streams only validated geometry and the owned Slack PID;
no messages, credentials, screenshots or executable commands are sent. The helper
independently verifies the visible Slack window and hides if the window disappears,
the stream disconnects, geometry is invalid, or its heartbeat expires. This
three-second disconnect watchdog is not an expiration of the feature.

The renderer removes its native full-window material only after the helper reports
that the inbox backdrop is visible. If the helper is unavailable, the older
focus-dependent Electron material remains as a fallback. Stable geometry does not
reposition or repaint the helper. Updates during the 180 ms content animation use
the same progress as the content; idle stream heartbeats are once per second.

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
content, external displays, and battery/thermal checks on additional Macs. Conversation
background blur remains deferred until this smaller trial is satisfactory.

## Inactive windows and opening animation

The user subsequently confirmed that HUD becomes largely solid when Slack loses
focus. A live popover-material probe behaved the same way. Electron creates its
`NSVisualEffectView` with `followsWindowActiveState` unless the BrowserWindow was
constructed with `visualEffectState: 'active'`. Slack does not expose that
constructor option or a runtime setter through its renderer bridge. Reapplying
the material is not a reliable way to force the active state. A temporary helper
backdrop proved that AppKit's `.active` state works without that bridge; its
five-minute experiment timeout caused one later apparent regression. The saved
helper implementation has no such timeout. No Slack bundle patch or focus-stealing
workaround was introduced.

A slide-out trace showed Chromium width updates jumping from 420 through 434,
447, 496, 548, 591, 684, 745, 801 to 820 over roughly 376 ms. The native resize
animation advances independently, exposing background before Chromium catches
up. A stepped-resize experiment reduced the band but did not eliminate it, and
the user found it substantially slower (about 622 ms in the local trace). That
experiment was removed.

The replacement expands the native window once, waits for a renderer paint
opportunity at the target width, then animates a shared CSS progress value over
180 ms. The native detail pane and custom loading cover read the same progress,
including a pane that mounts partway through the reveal. No native bounds change
during the content animation. On the right dock, the inbox slides left while
uncovering the detail; on the left dock, the detail slides out behind the inbox.
Clipping keeps both surfaces outside the translucent inbox at every point.

The full-width glass initially appeared immediately, which the user found
distracting. Confining the backdrop to a helper panel removed that pop, but a
native window shadow still outlined the expanded area early. The user confirmed
that disabling this shadow eliminated the remaining outline. The renderer now
captures/restores the native shadow around translucent triage.

Opening and closing both animate content inside an already allocated surface
while the helper supplies only the inbox backdrop. Closing shrinks the native
window after the content recedes. Opaque mode, reduced motion, helper fallback,
and hidden/minimized windows skip this content-only animation. Frame and animation
waits are bounded; cleanup removes overrides even if resizing fails. The earlier
content-only Activity trace reached full width at 16 ms and finished around 241 ms.
Live lifecycle checks passed for both docks, hide/reopen, normal Slack, disabling
and reenabling translucency, and helper restart recovery. Long work sessions and
Spaces/fullscreen/external-display visual checks remain outstanding.

The helper-backed implementation repeated the short scroll benchmark at p95
9.1 ms in both inbox and expanded layouts, with no frames above 33.4 ms. Disabled
samples were 8.4/8.5 ms. The native helper used about 1.5–1.7% idle CPU with blur
enabled versus 0.8% disabled, and 1.3% while scrolling versus 0.3% disabled.
WindowServer remained around 46–48%; background desktop activity still prevents
isolating its cost. These are short local samples, not a battery-life guarantee.

## References

- [Electron native macOS material implementation](https://github.com/electron/electron/blob/v44.0.0/shell/browser/native_window_mac.mm#L1299)
- [Electron custom window styles and transparency limitations](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)
- [Slack theme and window transparency preferences](https://slack.com/help/articles/205166337-Change-your-Slack-theme)

## Stock-window restoration and startup

Slack skips its ordinary `#1A1D21` / `#FFFFFF` backing-color initialization when
`windowVibrancy` is enabled. Turning off vibrancy alone therefore leaves clear
pixels ahead of Chromium during ordinary window resizing. We now set the backing
to the current Slack theme before stock geometry is restored, and explicitly
clear it on entry to translucent triage. An originally enabled native vibrancy
preference still restores its transparent titlebar material. No compositor or
whole-window opacity override is used. Electron documents this backing-color API
in [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window#winsetbackgroundcolorbackgroundcolor).

A fresh launch selects Home through Slack's own tab control, waits for its selected
state, and opens the inbox. It then parks Activity as before to avoid hidden
conversation auto-reads. A per-launch marker prevents mod reloads from repeating
Home navigation; newer user navigation cancels the pending startup. Missing native
Home controls time out without stranding the inbox.

The helper validates the visible backdrop union separately from the 420 px inbox.
During expansion and collapse it follows the same content progress; it never fills
the entire newly allocated window before the detail begins to appear. The width
remains bounded to 820 px. No extra Slack API calls or per-pixel capture are used.

With both inbox and detail translucency enabled, the follow-up six-second expanded
Activity sample recorded p95 frame intervals of 9.8 ms (8.4 ms opaque), with zero
frames above 33.4 ms. Helper idle CPU was approximately 1.7%; WindowServer reached
49% during scrolling versus 45% opaque, with other desktop activity present.
This remains a short local sample, not a battery or multi-display qualification.
Cold-launch inspection confirmed Home selection completed before inbox entry,
with Activity parked afterward. DM, channel, and thread styling keep text opacity
at 1 while applying the derived background tint at the pane boundary.
