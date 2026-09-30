# Native Activity and neutral background parking

> Historical research: findings and status below describe the recorded prototype,
> not the current release. See the [research index](README.md),
> [current setup](../SETUP.md), and [Slack guide](../docs/SLACK-TRIAGE.md).
> Old test permissions and experiment commands are not authorization for new runs.

Validated locally on Slack direct-download 4.52.155, macOS, September 22, 2026.

## Problem and implementation

Removing the native pane’s CSS framing does not remove Slack’s selected
conversation. It remains mounted and can mark incoming messages read while our
queue, pill, or edge strip covers it. Selecting Activity is insufficient too:
Slack remembers an Activity detail pane containing a conversation or thread.

`native-reply.park()` selects the native Activity tab (or its entry in More at
compact sizes), closes the remembered native detail, and verifies that Activity
is mounted without message panes, conversation composers, thread panes, or the
new-message composer. It waits for a short stable state and has a bounded timeout.
A failed park is reported rather than declared successful. New navigation cancels
obsolete parking. It uses Slack’s existing controls, without custom API calls.

Triage parks after closing its detail pane, when entering queue/cached-reader/
pill/strip/hidden modes, and after hidden read-state operations. Normal Slack
handoffs and direct switches between visible chats preserve their native flow.
Drafts stay with Slack; reopening triage starts at the queue. Escape keeps its
existing progression: release composer focus, close details, collapse inbox.

The inbox Activity bell intentionally opens a separate, themed native Activity
pane; All workspaces asks for an explicit workspace. The native list, filters,
scrolling and actions are retained. Themes are scoped to the embedded pane and
removed in standard Slack. Supported message cards route through the existing
verified conversation/thread adapter. Unsupported native detail navigation falls
back to normal Slack rather than hiding a live conversation behind the feed.
Activity itself never satisfies the native send or conversation read-action guard.

## Validation

- 274 automated tests passed, including remembered Activity detail closure,
  missing controls, cancellation, compact navigation, background-read guard
  lifetime, workspace selection, draft preservation and Activity read-only guards.
- User sent a test DM while triage was collapsed. Slack’s cached unread state
  remained true over several minutes, with zero mounted conversation composers.
- Clicking that Activity DM opened the expected native DM in triage.
- Escape from DM and thread message views returned to the 420px queue, with
  Activity parked and zero message inputs, message panes or thread panes.
- Compact native conversation opening and subsequent parking both succeeded.
- Inspected the themed feed and inbox Activity button in the running app.

## Limits

This adapter depends on private Slack DOM and mounted React metadata. A future
Slack layout change can break navigation or the neutrality check; parking failure
must remain visible to the user. This verifies the mounted active workspace, not
any separate Slack windows outside the managed triage window. Slack may perform
its own network reads when navigating Activity; there is no custom API polling.
