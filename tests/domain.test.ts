import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDate, validDate, toGrams, history, required } from '../src/domain.ts';
test('calendar dates reject rollover and invalid formatting', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const d of ['2025-02-29','2026-04-31','2026-2-01','invalid']) assert.equal(validDate(d), false);
});
test('weigh-ins cannot predate birth or be future dated', () => {
  assert.throws(() => checkDate('2020-01-01','2020-01-02'));
  assert.throws(() => checkDate('2999-01-01'));
  assert.doesNotThrow(() => checkDate('2020-01-02','2020-01-02'));
});
test('weights normalize ounces and reject invalid numbers', () => {
  assert.equal(toGrams('1','oz'),28.35);
  assert.equal(toGrams('325.5','g'),325.5);
  for (const n of ['0','-2','NaN','Infinity','','2grams','100001']) assert.throws(() => toGrams(n,'g'));
});
test('history filters puppies and sorts newest first without mutating source', () => {
  const data = {litters:[],puppies:[],weights:[{id:'1',puppyId:'a',date:'2020-01-01',grams:200},{id:'2',puppyId:'b',date:'2020-01-03',grams:210},{id:'3',puppyId:'a',date:'2020-01-02',grams:220}]};
  assert.deepEqual(history(data,'a').map(w=>w.id),['3','1']);
  assert.equal(data.weights[0].id,'1');
});
test('identifiers require meaningful bounded text', () => {
  assert.equal(required(' Blue collar ','Identifier'),'Blue collar');
  assert.throws(() => required('  ','Identifier'));
  assert.throws(() => required('x'.repeat(101),'Identifier'));
});
