// The new page stays in small files, and the store's split keeps every action. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup } from './support/newpage-fakes.js';

const root = path.join(import.meta.dirname, '..', 'web', 'new');
const filesUnder = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('no new page file is over 400 lines', () => {
  const files = [...filesUnder(path.join(root, 'js')), ...filesUnder(path.join(root, 'css'))].filter((f) => /\.(js|css)$/.test(f));
  assert.ok(files.length > 10);
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n').length;
    assert.ok(lines <= 400, path.relative(root, f) + ' has ' + lines + ' lines');
  }
});

test("the new page's modules import one another without a cycle", () => {
  const files = filesUnder(path.join(root, 'js')).filter((f) => f.endsWith('.js'));
  const edges = new Map(files.map((f) => {
    const text = fs.readFileSync(f, 'utf8');
    const to = [...text.matchAll(/^(?:import|export)\s[^;]*?\sfrom\s+'(\.[^']+)'/gms)].map((m) => path.resolve(path.dirname(f), m[1])).filter((p) => files.includes(p));
    return [f, to];
  }));
  const rel = (f) => path.relative(root, f);
  const seen = new Set();
  const walk = (f, trail) => {
    if (trail.includes(f)) assert.fail('import cycle: ' + [...trail.slice(trail.indexOf(f)), f].map(rel).join(' -> '));
    if (seen.has(f)) return;
    for (const g of edges.get(f)) walk(g, [...trail, f]);
    seen.add(f);
  };
  for (const f of files) walk(f, []);
  for (const n of ['boxsections.js', 'channel.js']) {
    assert.ok(!edges.get(path.join(root, 'js', n)).includes(path.join(root, 'js', 'model.js')), n + ' imports nothing from model.js');
  }
});

test("the store's actions are the same after the split", () => {
  const { store } = setup();
  assert.deepEqual(Object.keys(store.actions).sort(), [
    'boot', 'refresh', 'setChip', 'more', 'open', 'type', 'flush', 'write', 'tell', 'holdTell', 'instead', 'copy', 'copyNumber',
    'copyEmail', 'older', 'dismiss', 'dismissFollowUp', 'putBack', 'restore', 'restoreFollowUp', 'copyLink', 'toast', 'remember',
    'justOnce', 'switchLesson', 'startRun', 'skipRun', 'endRun', 'clear', 'bringBack', 'override',
    // Added since the split: another section (PR 5, Task 2), and Send on Facebook (PR 5, Task 4).
    'setSection', 'send',
  ].sort());
});
