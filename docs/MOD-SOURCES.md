# Local mod sources (package API v1)

PME 0.9.0 introduces local-folder mod sources. The first execution adapter supports
Slack renderer packages and foreground native helpers, independently of or alongside
Slack Triage. External Spotify packages can be cataloged but cannot be enabled yet.
This does not change the bundled Spotify mods. Requires PME 0.9.0 or later.

## For users

Open **Mod sources → Add folder** and choose a folder containing `catalog.json`.
PME reads metadata only. Choose **Review and install**, review the mod access
statements and helper publisher teams, and install the collection. New mods remain
disabled. Enable the desired mods on Slack's app page, then launch normally.
Saved shortcuts use their selected mod IDs and the currently installed source version.

PME does not fetch or upload packages. A company can distribute the folder through
its existing sync tools, a managed filesystem, or any other delivery mechanism.
Choose **Refresh sources** after changes; sources are also checked when the client
or a shortcut initializes. Installation is explicit, never automatic. An installed
source update applies to the next session; running sessions retain their files.
**Use previous version** switches to the previous complete collection for the next
launch. Checksums are validated again before execution.

PME caches full versions outside the signed application, under its Application
Support folder. Source folders may be unavailable without breaking installed mods.
Removing a source disables its mods for future launches; running sessions retain
those mods until stopped. Saved shortcuts referring to removed mods fail clearly
instead of silently substituting code. Removal does not delete the company's folder
or cached copies. No automatic cache garbage collection is implemented yet.
Revoking folder access does not revoke copies already downloaded to the Mac.

Only trust sources whose authors and writers you trust. An injected mod can access
host-app data, and a helper runs as the current user. Access statements and platform
labels describe intent; they are not enforced permission sandboxes. Checksums detect
incomplete or changed files, not publisher authenticity. Metadata is rendered as
text. Private mod names and paths are excluded from automatic feedback version
information; review any description you write before submitting it publicly.

## Try the example

Add `examples/local-mod-source` from this checkout. Install the collection, enable
**Company tools example**, and launch Slack. A small button appears at the bottom
right. It performs no message reads, sends, or network requests. Try it alone and
with Slack Triage. Stop and relaunch after changing the selection.

## Author a collection

For private development inside a PME checkout, use the Git-ignored
`local-mod-sources/` workspace. The generic scaffolder creates a valid inert
renderer package without adding its contents to the application bundle or Git:

```sh
npm run mod:create-local -- your-company internal-links "Internal links"
```

The directory is a source-code exclusion, not a security boundary. Do not put
credentials in renderer scripts or manifests. The client build uses an explicit
public resource allowlist and does not copy `local-mod-sources/`; users still add,
review, and install each collection through **Mod sources**.

```text
Company Mods/
  catalog.json
  mods/
    internal-links/
      mod.json
      main.js
      styles.css
      assets/
```

```json
{
  "schemaVersion": 1,
  "id": "your-company",
  "name": "Company mods",
  "mods": ["mods/internal-links"]
}
```

Source and mod IDs are stable lowercase hyphenated identifiers. PME qualifies mod
identities as `external:your-company/internal-links`; they cannot replace a bundled
mod. Registering two folders with the same source ID is rejected. Keep IDs stable
when moving distribution locations or releasing updates. Remove and re-add a source
to relocate it in this first version; re-enable desired mods afterward.

Copy the example `mod.json`. Required fields include `schemaVersion: 1`,
`apiVersion: 1`, `id`, semantic `version` (`x.y.z`), `app`, `name`, `author`,
`description`, `access`, `platforms`, `requires`, `helpers`, and `files`.
`renderer` is optional if the package has a helper. `features` is optional.

`platforms` uses the existing `mac`, `windows`, `linux`, or `global` contract.
`requires` lists package IDs from the same collection, or bundled mod IDs such as
`slack-triage`. A same-source ID takes precedence. Dependencies must belong to the
same app and resolve without cycles. Cross-source dependencies and version ranges
are not supported in v1. Unsupported package API/schema versions are rejected.

After authoring, run:

```sh
node scripts/pack-mod.mjs /absolute/path/to/Company\ Mods/mods/internal-links
```

This inventories all regular files except the root `mod.json` and `.DS_Store`,
records SHA-256 hashes and executable bits, and validates metadata. Review the
inventory: include only distributable code/resources, never private keys or local
account data. Sync the package and manifest together; PME rejects incomplete copies.
Package paths cannot escape the package. Symlinks are not supported in v1, including
framework bundles that depend on them. Limits: 100 packages per collection, 2,000
files and 256 MB per package, 128 MB per file, 512 MB per installed collection.

## Renderer lifecycle

`renderer.script` names a JavaScript **script body**, not an ES module or CommonJS
module. It runs in Slack's main renderer context after the signed-in page and DOM
exist. Bundle dependencies into this single file. It receives a lexical `api`:

- `api.version`: package API version (1).
- `api.id`, `api.modVersion`: local package ID and declared version.
- `api.onCleanup(fn)`: register disposal of listeners, observers, DOM and timers.
- `api.asset(relativeName)`: image data URL for a listed PNG/JPEG/SVG/WebP up to 2 MB.

`renderer.styles` optionally names a stylesheet; PME inserts and removes it.
Use `api.asset` for packaged images; relative CSS URLs resolve against Slack, not
against the package folder. Package instances have unique lifecycle keys and are
installed once per renderer context. Cleanup runs in reverse order. Register cleanup
as each resource is acquired so partial installation can unwind. Host navigation can
create multiple renderer contexts; never assume there is only one workspace.

The API does not expose arbitrary controller evaluation or credentials. The renderer
is not a sandbox, and Slack private APIs can change. Keep message observation passive
unless the user explicitly invokes an action.

## External native helpers

Helpers are supported by the package contract and the Slack session lifecycle,
including helper-only packages. They are separate child processes, never native
libraries loaded into PME. A declaration looks like:

```json
{
  "id": "company-helper",
  "platform": "mac",
  "arch": "arm64",
  "bundle": "Helpers/CompanyHelper.app",
  "executable": "Helpers/CompanyHelper.app/Contents/MacOS/CompanyHelper",
  "teamId": "ABCDEFGHIJ",
  "args": []
}
```

### Optional renderer-to-helper service

A package with both a renderer and helper can expose a narrow request service by
declaring every allowed operation on that helper:

```json
{
  "id": "company-service",
  "platform": "mac",
  "arch": "arm64",
  "executable": "Helpers/CompanyService",
  "teamId": "ABCDEFGHIJ",
  "args": [],
  "service": {
    "operations": ["themes.list", "theme.get"]
  }
}
```

Service operation names are displayed during source review. They are unique
within a package, limited to 32, and must be declared before installation. PME
binds requests to the enabled source-qualified package and Slack's trusted main
document. Another package cannot route requests to that helper, and undeclared
operations are rejected at the renderer, runtime, supervisor, and helper router.

The renderer receives `api.service` only when a service is declared:

```js
const catalog = await api.service.request('themes.list', {query: 'dark'});
```

`api.service.operations` contains the reviewed operation names. Requests must be
JSON and are limited to 64 KB, eight concurrent calls per helper, and a bounded
timeout. Responses are limited to 4 MB. Disabling or reloading the mod rejects
pending calls and removes its private binding.

The helper receives newline-delimited JSON on stdin and must write protocol
responses—and nothing else—to stdout. Send logs to stderr:

```json
{"id":"r1","operation":"themes.list","payload":{"query":"dark"}}
{"id":"r1","ok":true,"result":{"themes":[]}}
```

For failure, return `{"id":"r1","ok":false,"error":"Short safe message"}`.
PME sets `PME_HELPER_SERVICE=json-lines-v1`. Invalid JSON, malformed frames, or
oversized responses fail and stop that service helper rather than being passed
to Slack. The channel uses inherited process pipes; it does not open a debugger,
TCP listener, Unix socket, or arbitrary evaluation endpoint.

This bridge is transport, not authentication. A private helper remains
responsible for an explicit service login, endpoint allowlists, response-schema
validation, cache bounds, and accurate access disclosure. PME does not forward
Slack profile cookies, tokens, controller pipes, or injection environment.

Replace `teamId` with the publisher's real Apple Developer ID team. `arch` accepts
`arm64`, `x64`, or `universal`. `bundle` is optional for a standalone native executable.
All code/resources, including signatures, must be in the checksummed file list.
Sign and notarize helpers separately **before** packaging them. PME verifies their
Apple Developer ID certificate requirement and declared team, then performs a
Gatekeeper execution assessment. It never re-signs helpers, strips quarantine,
disables Gatekeeper, runs install hooks, invokes a shell, or requests administrator
privileges. Install and launch can fail offline if macOS needs a ticket lookup.
See Apple's [code-signing requirements](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).

Helpers must stay in the foreground. PME starts the declared executable directly;
this is not a Launch Services application launch. AppKit UI can run this way, but
Automation/camera/accessibility consent and attribution need testing for each helper.
A helper requiring Launch Services, a daemon/service installer, or elevated privileges
needs an additional launch contract and is not supported in v1. No automatic helper
restart is provided. Packages that do not declare the bounded service contract keep
the original lifecycle-only helper behavior with no renderer IPC.

Environment supplied to helpers:

- `PME_HELPER_API=1`, `PME_MOD_ID` (source-qualified ID).
- `PME_MOD_DATA_DIR`: persistent writable storage isolated by mod identity.
- `PME_APP_ID=slack`, `PME_APP_PATH`, `PME_APP_PID`.
- Basic user/locale/temp variables and a minimal system `PATH`.

PME does not forward Node/DYLD injection variables or its controller connection.
A supervisor retains ownership through a private IPC connection. Closing the manager
leaves the mod session running. Session disposal or parent-runtime disconnection
terminates helpers (SIGTERM, then SIGKILL after a bounded grace period). Helper failures
are shown in the manager and written to the local runtime's `external-helpers.log`.
PME cannot supervise a helper that deliberately daemonizes or escapes its process group.
Helper privacy statements must cover any independent collection/network behavior.

## Validation status

Automated tests cover source import, offline cached launches, incomplete updates,
review freshness, rollback, dependency isolation, tampering, renderer cleanup,
helper publisher verification, declared service routing, payload bounds, trusted
renderer contexts, helper process shutdown, and parent disconnection.
Real permission prompts remain helper-specific. A real company helper should be
validated on another Mac before distributing it to colleagues.
