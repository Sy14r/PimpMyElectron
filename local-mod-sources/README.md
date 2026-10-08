# Private local mod workspace

Everything in this directory except this README is ignored by Git. It is the
recommended place to develop company-, account-, or environment-specific PME
mod collections that must not be committed to the public repository.

Create a source and its first inert Slack renderer package with:

```sh
npm run mod:create-local -- my-company my-first-mod "My first mod"
```

This creates `local-mod-sources/my-company/catalog.json` and a package under its
`mods/` directory. Edit the generated script and metadata, then refresh its file
inventory whenever packaged files change:

```sh
node scripts/pack-mod.mjs local-mod-sources/my-company/mods/my-first-mod
```

In PME, open **Mod sources → Add folder**, choose the collection directory,
review it, and install it. See [Local mod sources](../docs/MOD-SOURCES.md) for the
package API, helper signing, lifecycle, access disclosure, and security model.

Ignored files are still trusted executable code and are not automatically
encrypted or access-controlled. Never put credentials in a renderer package or
`mod.json`; use an appropriately designed authentication flow and private
storage when a native helper genuinely needs authenticated service access.
