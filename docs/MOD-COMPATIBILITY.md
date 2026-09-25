# Mod platform compatibility

Every mod in `client/catalog.json` declares a nonempty `platforms` array:

```json
{"id":"spotify-camera-pause","platforms":["mac"],"requires":[],"modules":[]}
```

Accepted values are `mac`, `windows`, `linux`, and `global`. Use multiple OS values
for a subset, such as `["mac", "windows"]`. Use `["global"]` alone for code that
supports every host OS. Missing, unknown, duplicate, or mixed global/OS declarations
are rejected. Node's `darwin` and `win32` map to `mac` and `windows` respectively.

The manager defaults to showing compatible mods. **Show incompatible** exposes
other mods with their platform labels and an explanation; their enable switches
are disabled. Compatibility includes the complete dependency chain: a global mod
with a mac-only dependency is not usable on Windows or Linux.

The backend independently validates selections when enabling mods, launching,
creating/updating shortcuts, and launching saved shortcuts. Catalog validation
still accepts mods for other platforms. On initialization, saved selections are
validated for known IDs/dependencies and filtered for host compatibility, so a
configuration brought from another OS does not prevent the manager from opening.

`global` is an author's compatibility claim, not a sandbox or portability layer.
This metadata does not port the native PME client, app adapters, or helpers.
Today's distributed client, Slack Triage, Spotify Menu Player, and Camera Pause
are macOS-only. Future Windows/Linux clients can use the same catalog contract.
