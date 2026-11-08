import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factKeys, factOrder } from '../lib/facts';

test('card details start with group, theme, lesson and test style', () => {
  assert.deepEqual(factOrder().slice(0, 5), [
    'group',
    'theme',
    'lesson',
    'testStyle',
    'questions',
  ]);
});

test('a saved order comes first; missing and unknown details are handled', () => {
  const order = factOrder(['questions', 'nope', 'lesson', 'questions']);
  assert.deepEqual(order.slice(0, 3), ['questions', 'lesson', 'group']);
  assert.equal(order.length, factKeys.length);
  assert.equal(new Set(order).size, factKeys.length);
});
