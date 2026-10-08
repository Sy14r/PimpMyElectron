// Scaffold an ignored local package without teaching the public runtime about
// any particular company or private service.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packMod} from './pack-mod.mjs';

const validID = /^[a-z][a-z0-9-]{1,63}$/;

function title(value) {
  return value.split('-').filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
}

async function readCatalog(file, sourceID) {
  try {
    const catalog = JSON.parse(await fs.readFile(file, 'utf8'));
    if (catalog?.schemaVersion !== 1 || catalog.id !== sourceID || !Array.isArray(catalog.mods)) {
      throw Error('Existing local source has an incompatible catalog.json');
    }
    return catalog;
  } catch (error) {
    if (error.code === 'ENOENT') return {schemaVersion: 1, id: sourceID, name: title(sourceID), mods: []};
    throw error;
  }
}

export async function createLocalMod({root, sourceID, modID, name}) {
  if (!validID.test(sourceID) || !validID.test(modID)) throw Error('Source and mod IDs must be lowercase hyphenated identifiers');
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw Error('Local mod root must be absolute');
  const source = path.join(root, sourceID), catalogFile = path.join(source, 'catalog.json');
  const packagePath = `mods/${modID}`, folder = path.join(source, packagePath);
  const existing = await fs.lstat(folder).catch(() => null);
  if (existing) throw Error(`Local mod already exists: ${folder}`);
  const catalog = await readCatalog(catalogFile, sourceID);
  if (catalog.mods.includes(packagePath)) throw Error('Local source already lists this mod');

  await fs.mkdir(folder, {recursive: true, mode: 0o700});
  const script = `// Package API v1 script body. Keep every acquired resource reversible.\napi.onCleanup(() => {});\n`;
  const manifest = {
    schemaVersion: 1,
    apiVersion: 1,
    id: modID,
    version: '0.1.0',
    name: name || title(modID),
    author: 'Local author',
    app: 'slack',
    platforms: ['mac'],
    requires: [],
    description: 'Local Slack renderer mod. Replace this description before installation.',
    access: 'The generated starter performs no reads, writes, or network requests. Update this disclosure with the implementation.',
    features: ['Private local package scaffold'],
    renderer: {script: 'main.js'},
    helpers: [],
    files: {}
  };
  await fs.writeFile(path.join(folder, 'main.js'), script, {mode: 0o600});
  await fs.writeFile(path.join(folder, 'mod.json'), JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
  await packMod(folder);
  catalog.mods.push(packagePath);
  await fs.writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n', {mode: 0o600});
  return {source, folder};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceID, modID, name] = process.argv.slice(2);
  if (!sourceID || !modID) throw Error('Usage: npm run mod:create-local -- <source-id> <mod-id> [display name]');
  const root = path.resolve('local-mod-sources');
  const created = await createLocalMod({root, sourceID, modID, name});
  console.log(`Created ${created.folder}\nAdd ${created.source} in PME under Mod sources.`);
}
