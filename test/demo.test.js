// The demo: Wheelman on an invented world against stand-in services. It must start with no .env,
// fill the page with suggestions, pass its own check and leave nothing behind but its own folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the demo starts on invented data, writes suggestions in every section, and its check passes', () => {
  const dir = path.join(os.tmpdir(), `wheelman-demo-test-${process.pid}`);
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'demo/start.js', '--check'], {
    cwd: root, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, WHEELMAN_DEMO_DIR: dir, DASHBOARD_API_URL: 'https://must-be-overridden.example' },
  });
  const wrote = fs.existsSync(path.join(dir, 'app.db'));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(wrote, 'the demo database is in the folder it was given');
  assert.match(r.stdout, /The demo check passed/);
  assert.match(r.stdout, /dashboard waiting: \d+, with a suggestion: (?:[4-9]|\d\d+)/, 'suggestions were written');
  assert.ok(!/must-be-overridden/.test(r.stdout + r.stderr), 'a real address in the environment is never used');
});
