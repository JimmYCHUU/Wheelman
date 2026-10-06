// Prints one version's section of CHANGELOG.md, for a GitHub release.
//
//   node scripts/release-notes.js v1.0.0

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = String(process.argv[2] || '').replace(/^v/, '').trim();
if (!version) { console.error('Which version? For example: node scripts/release-notes.js v1.0.0'); process.exit(2); }

const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r/g, '');
const sections = text.split(/\n(?=## )/);
const section = sections.find((s) => s.startsWith(`## [${version}]`));
if (!section) { console.error(`CHANGELOG.md has no section for ${version}.`); process.exit(1); }

// Everything under the heading, without the heading line itself.
process.stdout.write(section.split('\n').slice(1).join('\n').trim() + '\n');
