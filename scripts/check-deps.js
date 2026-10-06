// Wheelman has no dependencies, on purpose. This fails when package.json gains any, or when a
// source file imports something that is neither a Node built-in nor one of its own files.
//
//   node scripts/check-deps.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  const names = Object.keys(pkg[field] || {});
  if (names.length) problems.push(`package.json has ${field}: ${names.join(', ')}`);
}

const FOLDERS = ['src', 'scripts', 'extension', 'web', 'test'];
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(m?js)$/.test(e.name)) files.push(p); } };
for (const f of FOLDERS) if (fs.existsSync(path.join(root, f))) walk(path.join(root, f));

const IMPORT = /(?:^|\n)\s*(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] || m[2] || m[3];
    if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/')) continue;
    problems.push(`${path.relative(root, file)} imports "${spec}", which is not a Node built-in or a file of this project`);
  }
}

if (problems.length) {
  console.log(`Wheelman must have no dependencies. ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`No dependencies: package.json is clean and ${files.length} files import only Node built-ins and project files.`);
