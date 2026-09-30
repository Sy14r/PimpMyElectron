# Passive client-state observer — 0.13.0

> Historical research: findings and status below describe the recorded prototype,
> not the current release. See the [research index](README.md),
> [current setup](../SETUP.md), and [Slack guide](../docs/SLACK-TRIAGE.md).
> Old test permissions and experiment commands are not authorization for new runs.

September 18, 2026, official direct-download Slack 4.52.155 / Electron 44,
Apple Silicon. Work performed with history-reader and mark-read disabled.

## Finding

Slack already retains a separate workspace Redux state for each of the two
signed-in development workspaces, even while only one workspace is visible.
React provider fibers expose existing store references. Their synchronous
`getState` and `subscribe` functions allow passive reading and local notification
without dispatching actions or using network-facing selectors/helpers.

The cached channels, members, messages and thread subscriptions use inherited
immutable dictionary entries. `Object.keys` can report zero entries even though
the data is present. The observer enumerates inherited keys with bounds, respects
own-property tombstones, and reads dictionary data properties without executing
getters. It only exports an explicit allowlist of fields.

## Behavior

- Discover compatible React providers on installation and every ten seconds.
  The scan is local and bounded to 3,000 fibers / 30 body children. No module
  bundles are fetched, injected into webpack or executed to acquire a store.
- Deduplicate stores by their subscription function, then by workspace. Require
  the state's workspace ID to match a locally signed-in account. Reject a known
  mismatch between the cached state's user and the locally signed-in user.
- Subscribe to state changes and coalesce publication over 500 ms. Skip copying
  when relevant immutable state references have not changed. Send an unchanged
  heartbeat at most every 30 seconds. No network request is involved.
- Hydrate cached conversation names, DM peers, author names, message previews,
  thread roots/replies, latest activity and subscribed-thread read cursors.
- Use Slack's live per-channel counts first, then initial-unread and unread-array signals for boolean unread/mention
  state. Missing evidence remains unknown; positive unread does not invent an
  exact count. Cached thread cursors classify cached latest replies, not a
  guaranteed full server history.
- Keep fresh cache unread evidence from being overwritten by stale sidebar DOM
  flags. After cache observation stops, DOM fallback resumes after 45 seconds.
- Keep independent budgets for conversations (600), users (1,200), message
  channels (100), candidate timestamps per channel (2,001), exported messages
  (200), and thread subscriptions (200), per workspace. Trim the serialized
  allowlisted binding payload to 300,000 characters. Surface limited coverage.
- Unsubscribe and cancel timers when a provider/account disappears or the module
  is removed. Private state is held in memory only. No raw Redux state, credentials,
  emails, drafts, attachment URLs or profile metadata is exported or logged.

Native-only UI: Refresh activity and custom history controls are disabled when
the history adapter is disabled. The read-only view displays captured messages
and explains the limitation instead of attempting an unavailable history read.
Opening native chat remains a normal Slack operation and may load data/mark read.

## Validation so far

- In the live client, reloading the mod recovered **15 conversation/thread entries
  and 33 messages across both workspaces**, versus six entries from the visible
  DOM alone. The initial hydration required no navigation and the runtime observed
  **zero HTTP API requests**, including native ones, during that initial check.
- The native-only read-only view rendered seven cached DM messages with Refresh
  disabled and zero custom requests. Native navigation remains independently
  responsible for its normal Slack requests; it is not counted as a passive read.
- All **71 automated tests** pass. Live geometry/Spaces-flag restoration,
  docking and the cached reader also passed. Removing/reinstalling the observer
  recovered both stores with zero custom API requests and zero observer errors.
- Automated tests cover inherited entries, tombstones/getters, background
  workspace attribution, account mismatch, credential exclusion, coalescing,
  positive unread evidence without a startup count, subscription cleanup,
  payload/memory bounds, read-cursor updates and stale DOM precedence.
- Fresh incoming DM/thread and read-on-another-device acceptance is pending the
  requested messages from the user's other test account. Those results must not
  be inferred from cached-data recovery or mocked state changes.

## Limits and next proof

This is a private React/Redux adapter, not an official Slack extension API. It
falls back to existing passive DOM/network observation if compatible state is
unavailable; it does not fetch missing data. The observer cannot provide messages
or thread data Slack has never loaded. Large workspaces may exceed the explicit
bounds. Muted-channel/notification-policy parity and every variety of thread or
mention are not yet qualified. A complete replacement for Slack Activity is not
claimed.

Next live checks: new background DMs and subscribed-thread replies in both
workspaces, reading them in another client, edits/deletes, account/provider
replacement, real sleep/wake, and comparing a busy inbox against Slack Activity.

## Live unread regression — 0.14.2

The user sent new DMs that ordinary Slack marked unread, but the custom pill
remained empty. Message ingestion worked: both new messages were already cached.
The observer read `unreadCounts.initialUnreads` and each channel's `unreads`
array, which remained zero/empty. Slack's current
`unreadCounts.countsPerChannel[channelId]` independently reported
`unreadCnt: 1` and `unreadHighlightCnt: 1` in both workspaces.

The observer now gives valid live per-channel counts precedence, including zero,
for boolean unread and mention state. Startup counts and arrays remain fallbacks
when a live field is unavailable. Dictionary access still respects inheritance
and tombstones. Exact message totals remain unexposed; the pill counts destinations.

After reloading this fix, both real unread DMs immediately produced two dots and
two pill items, with **zero custom API requests**. Regression tests reproduce
updates to only the counts map in two workspace stores, clearing with live zero
despite stale positive fallback data, and independently missing count fields.
All **75 tests** pass, including removal of a live count entry after reading.
The Personal Test DM cleared when Slack's live count entry disappeared. The haxx
DM subsequently cleared as well, and the user confirmed native opening worked.
Both pill items disappeared, with no change to the local-only Done action and
zero custom API requests. Finally, with both dots cleared and triage collapsed,
the user sent another Personal Test DM: it appeared as one dot and one item
without opening Slack or reloading the mod. The custom API counter remained
zero throughout the live read/new-message round trip.
