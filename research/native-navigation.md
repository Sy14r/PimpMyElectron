# Native thread navigation and scroll positioning — 0.16.0

The previous thread opener searched rendered message rows for a root timestamp,
then clicked its reply bar. Slack virtualizes those rows, so an observed thread
could be in our queue while its parent was absent from the DOM. The old opener
could not navigate that case. An unexpected native DOM/navigation exception could
also escape the opening loop and leave its status at loading.

The native-reply adapter now walks a bounded set of React ancestors from the
mounted conversation's virtual list. It requires matching workspace and channel
props before invoking `dispatchNavigateToThread({channelId, ts})`, the same
callback used by Slack's message-list keyboard navigation. This is invoked once
per user-requested open. If unavailable, the visible reply-bar path remains a
fallback. The resulting workspace, channel and exact thread editor must still
match before it is exposed; the existing send guards remain in place. Navigation
exceptions become a recoverable error, and the opening loop has a ten-second
wall-clock deadline (subject to the renderer being scheduled).

After framing and measuring a verified native pane, the adapter jumps once to
latest. Conversations use the mounted message list's `scrollToMostRecentMessage`;
threads use `jumpToReply` with that exact thread's native latest timestamp. The
rendered list's scrollbar is also moved to its bottom, because Slack may skip a
repeat jump to an unchanged timestamp after manual scrolling. No periodic scroll
or automatic follow mode is added. The inbox rail's accessible “Jump to latest
messages” arrow repeats the action without restoring the custom header.

These are private, version-sensitive native UI capabilities, tested on Slack
4.52.155. If they disappear, scrolling falls back to the bottom of the rendered
list, which may not contain the newest history. Missing-sidebar conversations,
unsupported views and unavailable editors still need Normal Slack. The passive
observer remains read-only. Opening and jumping can cause Slack's own normal
loading/read activity; no custom API calls or background polling are introduced.

Validation:

- 94 unit tests passed, including missing-root native navigation, workspace
  mismatch rejection, visible-row fallback, stale destination scroll rejection,
  repeated scroll, native callback exceptions and draft preservation.
- Native DM and channel threads opened in both development workspaces with their
  parent row lookup attributes temporarily absent. Both reported native callback
  navigation and exact verified editors; the attributes were restored afterward.
- Conversation and thread scroll buttons reached the bottom after scrolling to
  the top. Test-only reduced viewport heights made the existing histories
  scrollable without sending messages; their original styles were restored.
- Automatic scroll and reopen-to-bottom passed in a scrollable native thread.
- Native draft contents remained unchanged. Custom API request delta was zero.
