#!/usr/bin/env node
/**
 * Prints the release notes for one version: the section Changesets wrote into
 * CHANGELOG.md, plus the lines an Obsidian user needs.
 *
 * Usage: node scripts/release-notes.mjs 1.2.3
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Usage: release-notes.mjs <version>');
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function sectionFor(changelogPath) {
  let changelog;
  try {
    changelog = readFileSync(changelogPath, 'utf8');
  } catch {
    return null;
  }

  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body.length > 0 ? body : null;
}

const notes = [
  sectionFor(join(repoRoot, 'apps', 'api', 'CHANGELOG.md')) ?? '',
  '',
  '### Installing the plugin',
  '',
  'In Obsidian, put `main.js`, `manifest.json` and `styles.css` in',
  '`<vault>/.obsidian/plugins/share-note-web/`, then enable it in',
  'Settings → Community plugins.',
  '',
  '### Server images',
  '',
  '```',
  `ghcr.io/share-note-web/share-note-api:${version}`,
  `ghcr.io/share-note-web/share-note-api-migrate:${version}`,
  `ghcr.io/share-note-web/share-note-web:${version}`,
  '```',
  '',
  'Apply migrations with the `migrate` image before starting the API.',
].join('\n');

process.stdout.write(`${notes}\n`);
