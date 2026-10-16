import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDate, validDate, toGrams, history, required, validateLitter, validatePuppy, validateWeight, replaceRecord } from '../src/domain.ts';
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

test('litter corrections reject birth dates after any puppy weigh-in', () => {
  const records = editingRecords();
  assert.throws(()=>validateLitter(records,{...records.litters[0],born:'2020-01-03'},'litter'),/existing weigh-in/);
  assert.equal(validateLitter(records,{...records.litters[0],name:'Renamed',born:'2019-12-31'},'litter').name,'Renamed');
});
test('renaming a puppy permits its own identifier but rejects another puppy’s', () => {
  const records=editingRecords();
  assert.equal(validatePuppy(records,{litterId:'litter',name:' blue '},'a').name,'blue');
  assert.throws(()=>validatePuppy(records,{litterId:'litter',name:' RED '},'a'),/already used/);
});
test('weight corrections allow same day for self and reject other daily entries', () => {
  const records=editingRecords();
  assert.equal(validateWeight(records,{puppyId:'a',date:'2020-01-02',grams:321.123},'w2').grams,321.123);
  assert.throws(()=>validateWeight(records,{puppyId:'a',date:'2020-01-01',grams:321},'w2'),/already has/);
  assert.throws(()=>validateWeight(records,{puppyId:'a',date:'2019-12-31',grams:321},'w2'),/before/);
  assert.throws(()=>validateWeight(records,{puppyId:'missing',date:'2020-01-02',grams:321},'w2'),/no longer exists/);
});
test('replacement preserves IDs, other entries and source data; missing IDs fail', () => {
  const records=editingRecords();
  const renamed={...records.puppies[0],name:'Daisy'};
  const puppies=replaceRecord(records.puppies,renamed);
  assert.equal(puppies[0].id,'a');assert.equal(puppies[0].name,'Daisy');
  assert.equal(records.puppies[0].name,'Blue');assert.equal(puppies[1],records.puppies[1]);
  assert.equal(history({...records,puppies},'a').length,2);
  assert.throws(()=>replaceRecord(records.puppies,{...renamed,id:'missing'}),/no longer exists/);
});
test('subprecision weights are rejected rather than stored as zero', () => {
  assert.throws(()=>toGrams('0.00001','g'));
});
function editingRecords() {
  return {
    litters:[{id:'litter',name:'Spring',mother:'Willow',father:'Oak',born:'2020-01-01'}],
    puppies:[{id:'a',litterId:'litter',name:'Blue'},{id:'b',litterId:'litter',name:'Red'}],
    weights:[{id:'w1',puppyId:'a',date:'2020-01-01',grams:300},{id:'w2',puppyId:'a',date:'2020-01-02',grams:320}],
  };
}
