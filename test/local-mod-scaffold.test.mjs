import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalMod} from '../scripts/create-local-mod.mjs';
import {readSource, verifyFiles} from '../src/mod-packages.mjs';

test('private local mod scaffolder creates a valid checksummed source without overwriting packages', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pme-local-mods-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const created = await createLocalMod({root, sourceID: 'private-company', modID: 'internal-links', name: 'Internal links'});
  const source = await readSource(created.source);
  assert.equal(source.catalog.id, 'private-company');
  assert.equal(source.mods[0].manifest.name, 'Internal links');
  assert.equal(source.mods[0].manifest.files['main.js'].executable, false);
  await verifyFiles(created.folder, source.mods[0].manifest);
  await assert.rejects(createLocalMod({root, sourceID: 'private-company', modID: 'internal-links'}), /already exists/);
});

test('private local mod workspace is ignored and excluded from the client build allowlist', async () => {
  const ignore = await fs.readFile('.gitignore', 'utf8');
  const builder = await fs.readFile('scripts/build-client.mjs', 'utf8');
  assert.match(ignore, /^local-mod-sources\/\*$/m);
  assert.doesNotMatch(builder, /['"]local-mod-sources\//);
});
