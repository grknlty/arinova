import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSchema } from '../lib/model';
import { exampleSet, setJsonSchema } from '../lib/format';
test('the format example imports as it is', () => {
  const set = setSchema.parse(exampleSet);
  assert.equal(set.questions.length, exampleSet.questionCount);
});
test('the JSON Schema points questions to the given Question schema', () => {
  const { StudySet, Question } = setJsonSchema('#/$defs/Question');
  assert.deepEqual(StudySet.properties.questions.items, {
    $ref: '#/$defs/Question',
  });
  assert.deepEqual(Question.required, ['prompt', 'options', 'correctIndex']);
});
