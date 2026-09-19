#!/usr/bin/env node
/**
 * Keeps the Obsidian plugin's manifest in step with the Changesets release.
 *
 * Obsidian requires the release tag to equal `manifest.json`'s version exactly,
 * and the community-plugin submission reads `manifest.json` / `versions.json`
 * from the repository root, so both locations are written here.
 *
 * Run by `pnpm version-packages`, i.e. inside the "Version Packages" PR.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = join(repoRoot, 'apps', 'plugin');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const version = readJson(join(pluginDir, 'package.json')).version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Refusing to sync: "${version}" is not a semantic version.`);
  process.exit(1);
}

const manifestPath = join(pluginDir, 'manifest.json');
const manifest = readJson(manifestPath);
manifest.version = version;

const versionsPath = join(pluginDir, 'versions.json');
const versions = readJson(versionsPath);
versions[version] = manifest.minAppVersion;

for (const [path, value] of [
  [manifestPath, manifest],
  [versionsPath, versions],
  [join(repoRoot, 'manifest.json'), manifest],
  [join(repoRoot, 'versions.json'), versions],
]) {
  writeJson(path, value);
}

console.log(`Synced plugin manifest to ${version} (minAppVersion ${manifest.minAppVersion}).`);
