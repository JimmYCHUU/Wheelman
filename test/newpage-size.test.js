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

test("the store's actions are the same after the split", () => {
  const { store } = setup();
  assert.deepEqual(Object.keys(store.actions).sort(), [
    'boot', 'refresh', 'setChip', 'more', 'open', 'type', 'flush', 'write', 'tell', 'holdTell', 'instead', 'copy', 'copyNumber',
    'copyEmail', 'older', 'dismiss', 'dismissFollowUp', 'putBack', 'restore', 'restoreFollowUp', 'copyLink', 'toast', 'remember',
    'justOnce', 'switchLesson', 'startRun', 'skipRun', 'endRun', 'clear', 'bringBack', 'override',
  ].sort());
});
