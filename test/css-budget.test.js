// The page's stylesheets stay on the design tokens: no font size, corner, colour or space typed
// on the spot outside web/css/tokens.css. The same check runs from scripts/check-css-budget.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCssBudget, LIMITS } from '../scripts/check-css-budget.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('every stylesheet value outside tokens.css is a token', () => {
  const { files, offenders, over } = checkCssBudget();
  assert.deepEqual(files.sort(), ['base.css', 'components.css', 'utilities.css', 'views.css']);
  assert.deepEqual(over, [], offenders.map((o) => `${o.where}: ${o.kind}: ${o.text}`).join('\n'));
  assert.deepEqual(LIMITS, { 'font-size': 0, space: 0, radius: 0, colour: 0 }, 'the limits stay at zero');
});

test('the page loads the five stylesheets in layer order, and the tokens declare the layers', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="stylesheet" href="css\/([a-z]+)\.css">/g)].map((m) => m[1]);
  assert.deepEqual(links, ['tokens', 'base', 'components', 'views', 'utilities']);
  const tokens = fs.readFileSync(path.join(root, 'web', 'css', 'tokens.css'), 'utf8');
  assert.match(tokens, /@layer tokens, base, components, views, utilities;/);
  for (const name of ['--fs-body', '--sp-2', '--r-pill', '--ctl-md', '--row-h', '--shadow-1', '--dur-fast', '--z-toast']) assert.ok(tokens.includes(`${name}:`), `${name} is defined`);
  assert.ok(!fs.existsSync(path.join(root, 'web', 'styles.css')), 'the old single stylesheet is gone');
});

test('the top bar is one bar with the sections in its middle, and the panel\'s styles never reach a tag', () => {
  const views = fs.readFileSync(path.join(root, 'web', 'css', 'views.css'), 'utf8');
  const flat = views.replace(/\s+/g, ' ');
  // Two equal sides with the sections between them, and a gap that keeps the sections clear of both.
  assert.ok(flat.includes('grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr); align-items: stretch; column-gap: var(--sp-4);'));
  assert.match(flat, /\.topbar-nav \{[^}]*justify-self: center;/);
  // No dividing line inside the bar (the owner's correction, 16 Oct 2026).
  for (const part of ['.topbar-brand', '.topbar-tools']) {
    const rules = [...flat.matchAll(new RegExp(`${part.replace('.', '\\.')} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
    assert.ok(rules.length && rules.every((r) => !/border-(left|right)/.test(r)), `${part} draws no dividing line`);
  }
  // A tag in the "info" tone shares that class name with nothing: the panel is styled by its id.
  const bare = views.split('\n').filter((l) => /(^|[\s,{(])\.info(?=[\s{:,.])/.test(l.replace(/\/\*.*?\*\//g, '')));
  assert.deepEqual(bare, [], 'no style is written for the bare .info class');
});
