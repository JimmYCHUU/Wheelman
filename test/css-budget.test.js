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
