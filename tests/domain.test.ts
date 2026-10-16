import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDate, validDate, formatDate, weightToGrams, displayWeight, weightInput, GRAMS_PER_OUNCE, history, required, validateLitter, validatePuppy, validateWeight, replaceRecord } from '../src/domain.ts';
test('calendar dates reject rollover and invalid formatting', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const d of ['2025-02-29','2026-04-31','2026-2-01','invalid']) assert.equal(validDate(d), false);
});
test('weigh-ins cannot predate birth or be future dated', () => {
  assert.throws(() => checkDate('2020-01-01','2020-01-02'));
  assert.throws(() => checkDate('2999-01-01'));
  assert.doesNotThrow(() => checkDate('2020-01-02','2020-01-02'));
});
test('ounce inputs accept two decimals and reject invalid weights', () => {
  assert.equal(weightToGrams('1'),28.35);
  assert.equal(weightToGrams('18'),510.291);
  for (const n of ['0','-2','NaN','Infinity','','2oz','1.234','4000']) assert.throws(() => weightToGrams(n));
});
test('pounds and ounces convert to the same stored weight as total ounces', () => {
  assert.equal(weightToGrams('14.34','1'),weightToGrams('30.34'));
  assert.equal(weightToGrams('2','1'),weightToGrams('18'));
  assert.equal(weightToGrams('','1'),weightToGrams('16'));
  assert.equal(weightToGrams('14.34',''),weightToGrams('14.34'));
  for (const [oz,lb] of [['16','1'],['-1','1'],['2','1.5'],['2','-1'],['0','0'],['','']]) assert.throws(()=>weightToGrams(oz,lb));
});
test('recorded weights automatically use ounces below a pound and pounds plus ounces above', () => {
  assert.equal(displayWeight(weightToGrams('14.34')),'14.34 oz');
  assert.equal(displayWeight(weightToGrams('16')),'1 lb 0 oz');
  assert.equal(displayWeight(weightToGrams('18')),'1 lb 2 oz');
  assert.equal(displayWeight(weightToGrams('14.34','1')),'1 lb 14.34 oz');
  assert.equal(displayWeight(weightToGrams('32')),'2 lb 0 oz');
});
test('rounding carries into pounds and handles weight losses without negative zero', () => {
  assert.equal(displayWeight(15.999*GRAMS_PER_OUNCE),'1 lb 0 oz');
  assert.equal(displayWeight(31.999*GRAMS_PER_OUNCE),'2 lb 0 oz');
  assert.equal(displayWeight(-2*GRAMS_PER_OUNCE),'-2 oz');
  assert.equal(displayWeight(-18*GRAMS_PER_OUNCE),'-1 lb 2 oz');
  assert.equal(displayWeight(-0.0001),'0 oz');
});
test('edit fields convert between total ounces and separate pounds / ounces', () => {
  assert.deepEqual(weightInput(weightToGrams('18'),'oz'),{pounds:'',ounces:'18.00'});
  assert.deepEqual(weightInput(weightToGrams('30.34'),'lb'),{pounds:'1',ounces:'14.34'});
  assert.deepEqual(weightInput(weightToGrams('14.34'),'lb'),{pounds:'0',ounces:'14.34'});
  assert.deepEqual(weightInput(335.125,'oz'),{pounds:'',ounces:'11.82'});
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
test('legacy weights keep their original stored precision during a date-only edit', () => {
  const records=editingRecords();
  assert.equal(validateWeight(records,{puppyId:'a',date:'2020-01-03',grams:335.125},'w2').grams,335.125);
});
function editingRecords() {
  return {
    litters:[{id:'litter',name:'Spring',mother:'Willow',father:'Oak',born:'2020-01-01'}],
    puppies:[{id:'a',litterId:'litter',name:'Blue'},{id:'b',litterId:'litter',name:'Red'}],
    weights:[{id:'w1',puppyId:'a',date:'2020-01-01',grams:300},{id:'w2',puppyId:'a',date:'2020-01-02',grams:320}],
  };
}

test('dates display as DDMMMYY independently of timezone and with padded days', () => {
  assert.equal(formatDate('2026-10-15'),'15OCT26');
  assert.equal(formatDate('2020-01-01'),'01JAN20');
  assert.equal(formatDate('2019-12-31'),'31DEC19');
  assert.equal(formatDate('2024-02-29'),'29FEB24');
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let m=1;m<=12;m++) assert.equal(formatDate(`2026-${String(m).padStart(2,'0')}-09`),`09${months[m-1]}26`);
  assert.equal(formatDate('2025-02-29'),'Choose date');
});
