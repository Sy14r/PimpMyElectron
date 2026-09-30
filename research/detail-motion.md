# Side-pane motion and pill-only idle collapse — 0.18.0

> Historical research: findings and status below describe the recorded prototype,
> not the current release. See the [research index](README.md),
> [current setup](../SETUP.md), and [Slack guide](../docs/SLACK-TRIAGE.md).
> Old test permissions and experiment commands are not authorization for new runs.

Slack's exposed desktop window bridge accepts `setBounds(bounds, true)` on this
Mac. The native resize produces intermediate renderer viewport widths over roughly
350–400ms. That gives us a usable animation path without patching the app bundle
or sending a stream of per-frame window-control calls.

The native window controls its resize curve and duration. Our renderer controls
pane translation, clipping/layering, preparation, focus timing and cleanup. We tie
translation to the actual viewport width so the pane and window stay synchronized.
A custom duration or spring curve for the window itself would require a different
resize driver; it is not exposed as a parameter on this bridge method.

## Behavior

- Queue → native conversation/thread/Compose: stage the loading pane at full
  detail width behind the opaque inbox, then immediately animate the reveal while
  Slack prepares its real pane. The inbox's stacking context stays above the
  loading header and placeholder throughout the slide. Focus enters the verified
  native editor/recipient picker only after both loading and reveal complete.
- Queue → cached reader: reveal its existing content with the same geometry.
- Detail → queue: keep the detail mounted, slide it beneath the queue while the
  window shrinks, then suspend the native framing and restore queue focus.
- Detail → detail: replace content immediately without animating the window.
- Both docking sides retain their existing screen-edge anchoring. Right docking
  therefore moves the inbox left while opening and right while closing, keeping
  the expanded window on screen; the side pane remains to the inbox's right.
- macOS Reduce Motion disables animated resizing. Narrow layouts that cannot
  accommodate the inbox and detail side by side also resize immediately. If the
  animated bridge call fails, the resize falls back to an immediate bounds update.

Temporary CSS overrides prevent Slack's small-window breakpoints from hiding the
queue mid-resize. They are removed after the renderer receives the final native
resize frame, on cancellation, and on module disposal. Opening requests wait for
an in-flight layout transition, and obsolete requests are canceled rather than
revealing a previous selection. No screenshots or copied message DOM are used.

The idle timer now only acts in `cluster` (expanded pill) mode. Queue, native detail,
cached reader, standard Slack and the resting strip do not auto-collapse due to
that timer. Explicit Escape/shortcut/collapse controls and pill hover behavior
remain available. The native menu says “Collapse pill when idle.”

## Validation

- 103 unit tests passed, including pill-only idle behavior, staging without early
  resize, preserving the mounted pane during close, Reduce Motion, direct detail
  switches, and deferring native editor focus until reveal.
- Live tests on Slack 4.52.155 / macOS arm64 recorded intermediate widths and pane
  translations during opening/closing on both left and right docking. Native
  content was ready before reveal; cached-reader expansion also animated.
- Direct native content switches retained an 820px window throughout.
- Canceling during preparation and during reveal returned cleanly to the 420px
  queue. Selecting a new conversation during close opened the final selection.
- Reload cleaned up temporary motion attributes. The native helper rebuilt and
  restarted with the updated menu label.
- No messages sent and no additional custom API requests during the live motion
  checks. Animations use only local window geometry and renderer layout.
