# API traffic audit and mitigation — 0.12.0

> Historical research: findings and status below describe the recorded prototype,
> not the current release. See the [research index](README.md),
> [current setup](../SETUP.md), and [Slack guide](../docs/SLACK-TRIAGE.md).
> Old test permissions and experiment commands are not authorization for new runs.

Audited September 18, 2026 following reported automatic sign-outs on another
Mac. The audit machine had only two development workspaces. No logs from the
affected installation,
429 responses or session-revocation reasons were available for this audit.

## Findings in 0.11.1

The background enrichment path was unnecessarily chatty:

- Every known workspace refreshed every two minutes, even with triage collapsed.
- A message, edit or delete event also scheduled enrichment, normally throttled
  to one batch per ten seconds per workspace. Reconnect/resume and queue scope
  changes could initiate additional batches.
- Each head refresh fetched `users.conversations`, `client.counts` and
  `subscriptions.thread.getView`. It also verified identity with `auth.test`
  when the five-minute identity cache expired.
- Discovery could issue up to ten `users.info` calls for uncached DM peers.
  Failed lookups were not cached. Conversation discovery was not cached either.
- Optional endpoint failures retried the whole batch after 15–120 seconds;
  other failures backed off only to two minutes. Authentication errors were
  flattened into generic failures, so a revoked credential could keep getting
  probed. Concurrent explicit reads could duplicate `auth.test`.

The base three-request batch means roughly **90 added requests/hour/workspace
while idle**, or **1,080/hour/workspace with sustained triggering activity** at
one batch per ten seconds. These are source-derived estimates, not measurements
of the affected installation, and exclude identity, names, explicit reads and native
Slack traffic. They are not claims about a documented per-method limit.

The 1.5-second host tick, two-second shell heartbeat, DOM observers and socket
frame observation are local work, not Slack API polling. Reading an already
received response over CDP does not fetch that response from Slack again.

## Changes

1. Background enrichment is removed. The scheduler accepts only explicit manual
   requests. Timer ticks, message events, workspace selection, reconnect/resume
   and Mark read completion cannot trigger automatic activity reads. There are
   no automatic retries after any enrichment result, including partial failures.
2. Manual refresh requires one selected workspace; All workspaces cannot fan out
   requests. Batches serialize, duplicate clicks are dropped, and refresh and
   discovery pagination share a minimum one-minute interval per workspace.
   Cooldown does not schedule a deferred retry. Offline cancels queued work.
3. The first conversation-directory page is cached for 15 minutes per credential
   and renderer. Cached entries contain directory fields only; they do not
   reassert old unread counts. Manual pagination remains available.
4. Activity refresh no longer performs DM-name lookups. Names come from passive
   observations. Explicit read-only history still looks up at most five authors,
   two concurrently; failed author lookups are remembered for the adapter lifetime
   (bounded at 1,200 entries).
5. Identity verification is shared by concurrent reads. Authentication rejection
   blocks further read-adapter requests with that credential until it changes or
   the adapter restarts. Permission-denied methods are similarly suppressed.
   Identity errors are no longer relabeled as generic refresh failures.
6. Optional count/thread reads run sequentially, so rate/auth failure stops
   subsequent network requests in the batch. Full `Retry-After` delays are
   honored, including delays exceeding one hour. The read-adapter cooldown
   survives adapter reload through a sessionStorage deadline; it contains no
   credential or content. This is not a cross-process/global Slack limiter.
7. `dev:status` reports `feature.customApi` counters for our read and Mark read
   adapters, separately from observed native traffic. Counters contain only a
   start time, aggregate counts and allowlisted method names. They reset when
   the host runtime reloads. The old `feature.methods` includes both native and
   custom requests, and must not be interpreted as added traffic.

This deliberately favors less traffic over complete discovery. Slack may not
publish all background unread counts, DM names or thread subscriptions to the
current page. Unknown unread status stays unknown; messages can appear in All
before Attention has enough evidence. Check ordinary Slack Activity/Threads for
coverage. Native opening still has Slack's normal read-state effects and network
traffic. Optional manual history, activity refresh and Mark read still use private
client credentials/interfaces. Disabling history-reader and mark-read removes
these optional custom paths while keeping native chat and passive observations.

## Validation

- All **60 automated tests** pass. The pilot archive was rebuilt from its explicit
  source allowlist; no profiles, private state or send experiments are included.
- A deterministic one-hour simulation with twelve workspaces, message refresh
  signals, timer ticks and reconnect signals produces **zero enrichment calls**.
- Tests cover sequential manual batches, duplicate-click suppression, no retries
  after errors/partial results, shared pagination cooldown, 7,200-second server
  cooldowns, offline cancellation and disposal.
- Adapter tests cover directory caching without stale unread fields or name
  fan-out, identity single-flight, revoked credentials, permission negative
  caching, failed author lookup suppression and cooldown across reload.
- Runtime integration tests exercise message events, scope switches, reconnect,
  explicit manual refresh, All-scope refusal and sanitized request counters.
- On the signed-in official direct-download Slack 4.52.155 build, the first
  **65 seconds** after reload produced **zero custom requests**. Switching queue
  scopes between both development workspaces and All, then opening a native DM
  successfully, still produced **zero custom requests**.
- One explicit workspace refresh (double-clicked) made exactly four calls:
  auth.test, users.conversations, client.counts, subscriptions.thread.getView.
  Counts/threads succeeded, no users.info calls occurred, and the queue drained.
  At 218 seconds after runtime reload the counter was still four: there were no
  automatic follow-up calls. No automated messages were sent in this audit.

## What remains unconfirmed

Excess traffic is a demonstrated implementation problem. It is not yet a proven
explanation for the reported sign-out. Slack documents HTTP 429 plus Retry-After
as its Web API rate-limit response:
https://docs.slack.dev/apis/web-api/rate-limits/

Those public tiers do not establish limits for the desktop client's private
interfaces or the affected workspace's session/security policies. A clean
native-only comparison and the actual sanitized error or session-policy explanation are needed
to distinguish throttling, credential revocation, session policy and other causes.
Do not stress-test an affected workspace to find a threshold. No claim is made
that this release has resolved the reported sign-outs.

## Passive-only feature envelope

The interaction shell does not need Slack API access: menu bar, docking, Spaces,
focus return, keyboard control, local Done/Later/Pin/Undo, snooze expiry, local
filtering and ranking can all operate on observed state. New observed activity
can reopen locally Done items. Native conversations/composers already work without
custom API reads; loading and sending remain ordinary user-initiated Slack actions.

Passive sources are existing HTTP response bodies, incoming socket frames and
visible DOM. Reading these through local CDP/DOM access adds no Slack requests.
The current parser handles message socket events, not the full set of Slack's
read-state, thread, subscription and workspace events. Thus current passive gaps
are partly adapter gaps, not proof the data is unavailable.

The next useful investigation is to capture Slack's normal startup data before
it is missed, test access to already populated client memory/cache without
calling fetch-capable helpers, and interpret additional read/thread events.
Compare cold launch, background DMs/threads, read-on-another-device and reconnect
against Slack's own Activity view. No internal-store integration or complete
cross-workspace inbox is yet proven. Unknown data must remain explicitly unknown.

An independent read-only preview of already captured messages is possible without
calls. Fetching unseen older history or guaranteeing exhaustive thread discovery
is not possible solely from data the client has never received. Explicit mark-read,
reply and other server mutations cannot themselves be passive; invoking native
Slack controls delegates their normal requests to Slack. Avoid auto-navigation,
prefetch or simulated scrolling as a supposed zero-call solution: those would
still indirectly create additional traffic.
