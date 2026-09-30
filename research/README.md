# Research archive

These documents record experiments and design decisions as the prototype evolved.
Version numbers, test counts, commands, screenshots, limitations, and “next steps”
refer to their recorded stage. A later implementation may have replaced them.
They are evidence and context, not contributor task instructions or current
acceptance criteria. Old permissions to send test messages do not carry forward.

Use [SETUP.md](../SETUP.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) for development,
[Slack Triage](../docs/SLACK-TRIAGE.md) for current controls, and
[client releases](../docs/CLIENT-RELEASES.md) for distribution. Generated evidence
is [local-only](../evidence/README.md).

## Foundations and adapters

- [Slack extensibility](slack-extensibility.md) — initial injection and pipe probes.
- [Triage architecture](triage-architecture.md) — original design proposal.
- [Implementation phases](implementation-plan.md), [live prototype](live-prototype.md),
  and [pilot proof points](pilot-next.md) — historical delivery/acceptance records.
- [Direct-download validation](direct-download.md) — distribution-specific checks.
- [API traffic audit](api-traffic.md) and [passive state](passive-state.md) — why
  background polling was removed and cached observation developed.
- [Framework portability](framework-portability.md) — Slack-only assessment before
  the manager and Spotify adapter were implemented.

## UI experiments

- [Native conversation/thread navigation](native-navigation.md)
- [Native compose](native-compose.md)
- [Activity parking](activity-parking.md)
- [Pill design](pill-polish.md) and [quick triage](quick-triage.md)
- [Detail motion](detail-motion.md) and [inbox translucency](inbox-translucency.md)

Spotify's [widget exploration](../docs/SPOTIFY-WIDGET-EXPLORATION.md) and
[motion investigation](../docs/SPOTIFY-PLAYER-MOTION.md) likewise document design
iterations; the [Menu Player guide](../docs/SPOTIFY-MENU.md) describes the feature.
