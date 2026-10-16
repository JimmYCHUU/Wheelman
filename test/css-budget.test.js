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

test('the top bar sits on the page\'s own columns, and the panel\'s styles never reach a tag', () => {
  const views = fs.readFileSync(path.join(root, 'web', 'css', 'views.css'), 'utf8');
  // Each way the page sets its columns, the top bar sets the same ones (plus its tools at the right).
  const flat = views.replace(/\s+/g, ' ');
  const has = (rule) => assert.ok(flat.includes(rule), rule);
  const WIDE = 'minmax(var(--col-list-min), var(--col-list-max)) minmax(0, 1fr)';
  const NARROWER = 'minmax(var(--col-list-min), var(--col-list-narrow)) minmax(0, 1fr)';
  has(`grid-template-columns: ${WIDE};`);
  has(`grid-template-columns: ${WIDE} auto;`);
  has(`.app, .app.has-info { grid-template-columns: ${NARROWER}; }`);
  has(`.topbar { grid-template-columns: ${NARROWER} auto; }`);
  has(`.app.has-info { grid-template-columns: ${NARROWER} var(--col-panel); }`);
  has(`.shell:has(.app.has-info) .topbar { grid-template-columns: ${NARROWER} var(--col-panel); }`);
  // A tag in the "info" tone shares that class name with nothing: the panel is styled by its id.
  const bare = views.split('\n').filter((l) => /(^|[\s,{(])\.info(?=[\s{:,.])/.test(l.replace(/\/\*.*?\*\//g, '')));
  assert.deepEqual(bare, [], 'no style is written for the bare .info class');
});
