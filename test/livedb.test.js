import test from 'node:test';
import assert from 'node:assert/strict';
import { isLiveDatabase, requireCopy } from '../src/livedb.js';

const MESSAGE = 'DB_PATH must point at a copy of the database, not the live one';

test('the live layout is a file named app.db in a folder named data', () => {
  assert.equal(isLiveDatabase('D:/x/data/app.db'), true);
  assert.equal(isLiveDatabase('D:/x/eval/copy.db'), false);
});

test('requireCopy refuses an unset or live path and accepts a copy or the in-memory test database', () => {
  assert.throws(() => requireCopy(undefined), { message: MESSAGE });
  assert.throws(() => requireCopy(''), { message: MESSAGE });
  assert.throws(() => requireCopy('C:/a/data/app.db'), { message: MESSAGE });
  assert.doesNotThrow(() => requireCopy('D:/x/eval/copy.db'));
  assert.doesNotThrow(() => requireCopy(':memory:'));
});
