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


## Conversation header controls (September 20, 2026)

In triage, DM and channel headers retain Slack's star/classification and name/details controls. A compact hamburger delegates Huddle, conversation search, and notifications to the existing native buttons. For DMs, the mute label follows `aria-pressed` (Slack keeps the same accessible label even when muted); channels expose their native notification menu. The Huddle dropdown must target the actual button because its wrapper shares the same `data-qa` identifier.

Native details dialogs now sit above the inbox, fit within the window, and use the triage colors. Profile and compact conversation-search views can replace the composer without becoming a destination error. Back/Escape returns to the original conversation; Escape first belongs to any open native modal or menu. These auxiliary views never qualify as a verified message editor for sending.

Slack's full search application is a separate layout. When a native search routes there (including “View full search”), triage hands off to full Slack at that exact search. Reopening a conversation from triage first returns through Slack's native Home control so its conversation navigation is available again.

All actions reuse mounted Slack controls; this adds no direct Slack API calls or polling. Full Slack restores the original controls and styling. Live checks covered DM and channel menus, native Huddle options (no call initiated), mute/unmute with original state restored, profile navigation, compact search results, full-search handoff, and reopening a DM from full search.

The thread header’s back chevron opens its parent DM or channel inside triage, selecting the parent inbox item when present. Escape still closes the detail pane to the queue (or first blurs the composer). Parent navigation uses the same verified native-open path and also works when the parent is absent from the observed inbox snapshot.

Native message reply bars and “Reply in thread” buttons now explicitly request a triage thread destination before Slack replaces the parent composer. The request must come from the verified pane, with a message channel matching that pane and a valid root timestamp; stale requests and unrelated controls are ignored. The normal thread-opening path handles the new selection even if no inbox thread row has been observed yet. Full Slack keeps its original behavior. The native Back control is invoked on the next task so Chromium's protection against reentrant clicks does not swallow it. Live checks covered opening an existing DM thread, returning to the DM, and opening the thread composer for a message without replies; nothing was sent.


## Switching latency (September 20, 2026)

Three local rounds through the already loaded Personal Test DM, social channel, DM thread and parent DM measured time from triage's open request to verified editor readiness. These are warm-client measurements, not network-independent guarantees or compositor paint timings. The repeated same-DM samples were excluded because that destination was already ready.

| Route | Before (median) | After (median) |
| --- | ---: | ---: |
| DM → channel | 211 ms | 80 ms |
| Channel → DM thread | 349 ms | 168 ms |
| Thread → parent DM | 967 ms | 99 ms |

Changes:

- Close an existing thread before selecting its parent. The old order could restore the thread and wait for the 750 ms sidebar retry.
- Skip redundant native window geometry calls when switching destinations within an already expanded view. Changes between compact/full reply sizes and settings-driven layout updates still apply geometry normally.
- Observe native DOM mounting only while navigation is waiting, coalescing changes for 16 ms and retaining a 150 ms fallback for route-only changes. Each temporary observer disconnects on wake; the 10-second navigation deadline and destination/send validation remain intact.
- Wait for two animation frames before final scroll/focus instead of always delaying 80 ms; retain the bounded timer fallback for background windows.

No prefetching, extra Slack API calls, cached editor clones or hidden duplicate conversations were introduced. Cold destinations still depend on Slack's normal fetch/render latency.

Fast conversation switches now use a solid cover matching the native pane's themed background, instead of briefly showing the loading card and its controls. Once the requested destination is verified, the cover fades away over 120 ms. A small loading label appears only after 300 ms; errors immediately retain Retry and full Slack recovery actions. Reduce Motion disables the fade. The previous editor is still suspended immediately, and the inbox-to-detail slide remains unchanged. Live frame sampling across a DM, channel and thread observed no loading-card flashes and confirmed the cover faded to zero opacity.


## Notifications-only app conversations

The built-in Slack app is a native DM with a message list and a `message-input-system-notification-roadblock` footer, but no editable composer. Previously, triage waited for a message input until navigation timed out. It now frames this native view as read-only after checking the current workspace/channel route and the mounted list's matching workspace/channel identity.

Display readiness is separate from editor/send verification: notification content can scroll, open native header menus and hand off to full Slack, while it cannot authorize sending or take composer focus. Regular app/bot conversations that have a standard composer continue through the existing editor path. Custom App Home pages and arbitrary agent layouts are not covered by this detection.

Live validation opened the Personal Test Slack app notification card, switched to a normal DM with its composer, and returned to the read-only app view. No app actions or invitations were submitted, and no additional Slack API calls were introduced.

## Cached DMs missing from the sidebar (Slackbot)

The legacy Slackbot conversation can exist in Slack's cache without a mounted sidebar entry. It has a normal message view and composer; triage's failure was the sidebar-only navigation path, not an unsupported renderer. This is distinct from the newer Slackbot AI entry point.

If a cached DM is absent from the sidebar, triage can now use Slack's native search once. It waits for the native query editor to become editable, searches the cached display name, and selects only a navigational member result matching the cached peer ID in the requested workspace. It does not select a result by display name or open Slackbot AI. The existing workspace/channel/composer verification still gates rendering and sending. Thread snapshots inherit the parent DM's peer identity.

The lookup is bounded to three seconds, skips an already open native overlay, cancels when superseded, and yields if the user edits its query. No direct API calls or background polling were added; this on-demand native search can generate Slack's own normal search requests.

Live validation opened Slackbot from triage with Agents & apps collapsed and confirmed the native greeting, themed conversation header, and editable composer. No messages were sent.

## Linked destinations and keyboard triage

Known signed-in Slack workspace URLs are parsed into explicit workspace/channel/thread destinations. Links with external or unknown hosts, credentials, malformed IDs or unrelated routes remain with Slack. Native thread timestamps keep their “Open in channel” meaning; search-result timestamps retain their thread root. Clicking the body of a scoped-search result also selects its message. User/profile controls and external links remain native.

For cached destinations, the existing verified navigation path opens the conversation and uses the mounted message list's `jumpToMessageInChannel({messageTs})` or thread `jumpToReply(ts)` callback. It does not jump to latest afterward. For a conversation absent from the inbox cache, a bounded navigation attempt replays the original native link once and verifies the resulting destination; cancellation prevents replay. No private store dispatch or custom API request is added.

Native menu actions get a brief mounting grace period. An unsupported view opened through an explicit native control hands off to full Slack, rather than exposing an incorrectly framed composer. Visible native dialogs keep priority; Slack's empty 2×2 popup remnants no longer block triage shortcuts after closing search. Destination and send verification still apply throughout.

The next/previous unread chords are Option-Shift-Down/Up. Traversal follows the filtered inbox order, wraps once, excludes the current item, unknown/read state, pending reads, locally Done/Later items and optimistic quick-reply dismissals. It focuses messages and leaves drafts owned by Slack. F6/Shift-F6 cycles inbox/messages/composer, omitting the composer for notifications-only panes. Quick reply and full Slack are unchanged. Repeated keydown and IME composition do not advance the queue.

Live checks covered scoped search mounting, a result-body click opening the matching thread/reply, a thread-root link returning to its parent at the linked message, native user-mention profile rendering, F6 focus cycling, and the empty unread shortcut preserving composer focus. Automated checks cover URL/workspace validation, target cancellation, exact message jumps, filtered unread ordering and focus cleanup. Channel-mention and attachment samples are still requested for live acceptance; arbitrary file, Canvas and agent layouts are not claimed as embedded renderers.


## Native quick switcher in triage

The inbox search icon and Command-K open Slack's existing floating omniswitcher through its native top-search control. The query, suggestions and ranking remain Slack-owned. The popup is layered above the queue and constrained to the window; full Slack's styling and shortcut handling are unchanged. Invoking it from the pill first opens the inbox. In a native conversation or composer it stays in the current workspace; in queue/reader mode it uses the selected workspace (or the active native workspace for All workspaces).

A selection is captured before Slack navigates, using the actual highlighted result for Enter or the clicked result for mouse input. Channel IDs come from the native result. Member results require an exact member ID, cached native DM ID and matching workspace from that suggestion's React props. Display names are labels only. The original result is replayed once after the triage pane is prepared, with connectivity and identity checks; normal destination and send verification still gate the embedded editor. No private store dispatch, credential access, custom endpoint or background search polling is introduced.

Workflows and suggestions without a verified conversation identity (including a DM without native cached mapping) hand off to full Slack and perform the original selection there. Full-search queries are now an independent embedded pane, described below. This is intentionally a compatibility fallback, not a claim of supporting every native result type in the pane. Slack's native search can generate its ordinary requests while a user searches.

Escape closes only the popup, then restores the original element and selection after native layout/focus restoration. Message drafts are never copied or rewritten. The session is cleaned up when leaving triage, reloading or disabling the module. Repeated keys and IME confirmation do not trigger duplicate selections.

Live validation on Slack 4.52.155 covered Command-K from the inbox and conversation composer; the search icon; Enter and mouse selection; channel and DM opening in the right pane; switching from Personal Test to haxx before native search; draft retention when navigating away and back; and Escape restoring the exact composer cursor offset. The temporary unsent test draft was removed, and no messages were sent. Automated coverage exercises identity checks, wrong-workspace/peer rejection, native result selection, cancellation, one-time replay, popup dismissal and focus restoration.


## Full search results pane

Search is now a first-class `kind: search` destination, scoped to a workspace and verified against Slack's active workspace, `/client/<team>/search` route, and a single mounted native `search_view`. It uses the normal sliding side-pane lifecycle, supports suspension/resume, and has no message recipient or send capability. It no longer depends on an existing conversation being open. Native full-search navigation from a conversation's search controls is promoted to this destination too.

The switcher recognizes both current queries (`queryUser`) and search history (`queryHistory`). If Slack accepts Enter before mounting a suggestion row, the resulting native search route is adopted after the popup closes. Slack owns query execution, filtering, sorting, pagination, empty/loading states and search requests. The mod does not add endpoints, fetch results itself, or persist search text in its target metadata.

The native results pane is themed for the available width, with a readable sender/context/timestamp layout and an Open in Slack control. Clicking a message body, timestamp or reply count enters the verified conversation/thread navigation path and preserves the matching message position. Native result metadata can supplement a thread root only when workspace, channel and message timestamp all agree. Profile controls and filter dialogs remain native. Escape closes an open popup first; otherwise it returns from results to the inbox.

Live checks on Slack 4.52.155 covered searches from the queue and an open thread, a four-result channel search, the native filter dialog, result-body navigation to an exact thread reply, and a reply-count click opening the thread. No messages were sent. Automated checks cover search identity and recipient rejection, send guarding, promotion from native search, query/history routing, result metadata matching, and body/reply-count navigation.
