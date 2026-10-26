import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, sectionSizes } from '../src/promptsize.js';

test('estimateTokens is characters over four, rounded up', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(''), 0);
});

test('sectionSizes splits a prompt on its headings', () => {
  const system = 'You write replies.';
  const user = 'Head line\n=== VEHICLE FACTS ===\nA car\nmore\n=== BUSINESS FACTS ===\nOpen daily';
  const sizes = sectionSizes({ system, user });
  assert.deepEqual(sizes.map((s) => s.name), ['(system)', '(user head)', 'VEHICLE FACTS', 'BUSINESS FACTS']);
  assert.equal(sizes[0].chars, system.length);
  assert.equal(sizes[1].chars, 'Head line\n'.length);
  assert.equal(sizes[2].chars, '=== VEHICLE FACTS ===\nA car\nmore\n'.length);
  assert.equal(sizes[3].chars, '=== BUSINESS FACTS ===\nOpen daily'.length);
  assert.equal(sizes[3].tokens, Math.ceil(sizes[3].chars / 4));
  assert.equal(sizes.reduce((s, x) => s + x.chars, 0), system.length + user.length);
});
