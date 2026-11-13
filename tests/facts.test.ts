import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factKeys, factOrder, resultTone, starOf } from '../lib/facts';

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

test('the Results button is green, yellow or red by the latest score', () => {
  assert.equal(resultTone(10, 10), 'good');
  assert.equal(resultTone(8, 10), 'results');
  assert.equal(resultTone(7, 10), 'bad');
  // 6 mistakes is too many, even at 85% correct.
  assert.equal(resultTone(34, 40), 'bad');
  assert.equal(resultTone(35, 40), 'results');
  assert.equal(resultTone(9, 10, { resultMaxMistakes: 0 }), 'bad');
  assert.equal(resultTone(8, 10, { resultMinPercent: 85 }), 'bad');
});

test('a gold star for all correct, silver for one mistake or 98%', () => {
  assert.equal(starOf(10, 10), 'gold');
  assert.equal(starOf(9, 10), 'silver');
  assert.equal(starOf(98, 100), 'silver');
  assert.equal(starOf(97, 100), null);
  assert.equal(starOf(8, 10), null);
  assert.equal(starOf(9, 10, { goldMaxMistakes: 1 }), 'gold');
  assert.equal(starOf(8, 10, { silverMinPercent: 80 }), 'silver');
  assert.equal(
    starOf(9, 10, { silverMaxMistakes: 0, silverMinPercent: 100 }),
    null,
  );
});
