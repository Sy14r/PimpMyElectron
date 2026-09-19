# Native new-message composer — 0.17.0

The inbox header's Compose button requests a workspace-scoped compose target in
native-reply. A specific inbox workspace takes precedence; All workspaces uses
Slack's active renderer workspace. The tooltip identifies that workspace before
opening. The adapter selects Slack's workspace button, then its native New Message
button, with the same bounded opening deadline and recovery controls as replies.

The mounted `composer_page` and its editor are framed beside the 420px queue at
full work-area height. Recipient selection, validation, suggestions, attachments,
formatting, drafts and sending belong to Slack. No recipient IDs, draft text or
credentials are copied into triage state. A ready compose page must remain in the
requested workspace and the verified native pane; switching workspaces blocks
sending until reopened. Jump-to-latest and conversation-only controls are hidden.

Collapse/reopen reuses the mounted compose page. Escape in the body editor releases
focus, then a second Escape returns to the queue. Slack owns keys in the recipient
picker. If native routing leaves New Message (for example after sending or closing
it), the adapter suspends and returns to the queue instead of adopting an unknown
conversation. This route-exit behavior has unit coverage; an actual send was not
performed in this round.

The observed-count/partial-coverage row and cached-state explanation were removed
from the inbox. Optional manual API refresh controls are hidden when that module
is disabled; transient refresh errors and offline status can still be displayed.

Validation on Slack 4.52.155 / macOS arm64:

- All 98 unit tests passed, including compose workspace selection, draft reuse,
  stale-workspace send blocking, invalid-target rejection and native route exit.
- Compose opened in both dev workspaces. Selecting the second workspace in the
  inbox switched Slack and opened its recipient picker with the queue visible.
- Native recipient search results rendered and selection worked. An unsent test
  draft survived collapse/reopen and queue/reopen; first and second Escape behaved
  as expected. Only the inserted test text was cleared afterward.
- Live geometry confirmed a native pane at x=420, y=0, filling the 1130px viewport,
  with no custom top bar and neither removed diagnostic block present.
- No messages sent. Custom API request delta was zero; recipient suggestions and
  draft handling can cause Slack's ordinary native traffic.
