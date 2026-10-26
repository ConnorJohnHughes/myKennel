import test from 'node:test';
import assert from 'node:assert/strict';
import {reminderDates,addMonths,addDays,heatHistory,validateHeatName,validateHeatDate} from '../src/heatDomain.ts';
import {dueStages,localClock} from '../supabase/functions/_shared/heatSchedule.ts';
import {dispatchHeatReminders,type Device} from '../supabase/functions/_shared/dispatchHeatReminders.ts';
test('six calendar months clamp month ends and leap years',()=>{
  assert.equal(addMonths('2026-08-31',6),'2027-02-28');
  assert.equal(addMonths('2023-08-31',6),'2024-02-29');
  assert.equal(addMonths('2024-02-29',6),'2024-08-29');
  assert.equal(addMonths('2026-10-26',6),'2027-04-26');
});
test('reminders use first of expected month, seven days before, and estimated day',()=>{
  assert.deepEqual(reminderDates('2026-10-26'),{expected:'2027-04-26',month:'2027-04-01',week:'2027-04-19',day:'2027-04-26'});
  assert.deepEqual(dueStages('2026-10-01','2027-04-01'),['month','day']);
  assert.deepEqual(dueStages('2026-10-08','2027-04-01'),['month','week']);
  assert.equal(addDays('2027-03-01',-7),'2027-02-22');
});
test('newest detected date drives the forecast, regardless of insertion order',()=>{
  const data={dogs:[{id:'dog',name:'Willow'}],cycles:[{id:'new',dogId:'dog',detected:'2026-10-20'},{id:'old',dogId:'dog',detected:'2026-04-20'},{id:'other',dogId:'x',detected:'2026-10-21'}]};
  assert.deepEqual(heatHistory(data,'dog').map(c=>c.id),['new','old']);
  assert.equal(reminderDates(heatHistory(data,'dog')[0].detected).expected,'2027-04-20');
  assert.throws(()=>validateHeatName(data,' willow '),/already/);assert.equal(validateHeatName(data,' Willow ','dog'),'Willow');
  assert.throws(()=>validateHeatDate(data,'dog','2026-04-20'),/already/);
  assert.equal(validateHeatDate(data,'dog','2026-04-20','old'),'2026-04-20');
  assert.throws(()=>validateHeatDate(data,'dog','2999-01-01'),/future/);
});
test('timezone clocks honor local dates and daylight savings',()=>{
  assert.deepEqual(localClock(new Date('2027-01-01T03:00:00Z'),'America/Los_Angeles'),{date:'2026-12-31',hour:19});
  assert.equal(localClock(new Date('2027-04-01T16:00:00Z'),'America/Los_Angeles').hour,9);
  assert.equal(localClock(new Date('2027-01-01T17:00:00Z'),'America/Los_Angeles').hour,9);
});
const device:Device={id:'phone',user_id:'member',endpoint:'https://fcm.googleapis.com/test',p256dh:'test',auth:'test',timezone:'America/Los_Angeles'};
function setup(detected='2026-10-08'){
  const calls:{body:string;tag:string}[]=[];const deliveries=new Set<string>();const finishes:unknown[]=[];
  const snapshot={ready:true,dogs:[{id:'dog',name:'Willow'}],cycles:[{id:'heat',dog_id:'dog',detected,version:1}],subscriptions:[device]};
  const gateway={claim:async(_d:string,_c:string,_v:number,date:string)=>{if(deliveries.has(date))return null;deliveries.add(date);return date;},finish:async(...values:[string,boolean,boolean])=>{finishes.push(values);}};
  return {snapshot,gateway,calls,finishes,send:async(_d:Device,payload:{body:string;tag:string})=>{calls.push(payload);}};
}
test('coincident month/week reminders combine and repeat jobs do not resend',async()=>{
  const x=setup();const now=new Date('2027-04-01T16:00:00Z');
  assert.equal((await dispatchHeatReminders(x.snapshot,x.gateway,x.send,now)).sent,1);
  assert.equal((await dispatchHeatReminders(x.snapshot,x.gateway,x.send,now)).sent,0);
  assert.equal(x.calls.length,1);assert.match(x.calls[0].body,/in one week/);assert.match(x.calls[0].body,/08APR27/);
});
test('no reminders before local 9am, on non-reminder days, or when server is disabled',async()=>{
  const x=setup();await dispatchHeatReminders(x.snapshot,x.gateway,x.send,new Date('2027-04-01T15:59:00Z'));
  await dispatchHeatReminders(x.snapshot,x.gateway,x.send,new Date('2027-04-02T18:00:00Z'));
  await dispatchHeatReminders({...x.snapshot,ready:false},x.gateway,x.send,new Date('2027-04-01T16:00:00Z'));
  assert.equal(x.calls.length,0);
});
test('new detected date cancels old forecast and 410 disables only the expired phone',async()=>{
  const x=setup('2026-10-26');await dispatchHeatReminders(x.snapshot,x.gateway,x.send,new Date('2027-04-08T16:00:00Z'));assert.equal(x.calls.length,0);
  const y=setup();await dispatchHeatReminders(y.snapshot,y.gateway,async()=>{throw {statusCode:410};},new Date('2027-04-01T16:00:00Z'));
  assert.deepEqual(y.finishes,[['2027-04-01',false,true]]);
});
test('transient push errors release the lease for retry; claim rejection sends nothing',async()=>{
  const x=setup();await dispatchHeatReminders(x.snapshot,x.gateway,async()=>{throw new Error('network');},new Date('2027-04-01T16:00:00Z'));assert.deepEqual(x.finishes,[['2027-04-01',false,false]]);
  const y=setup();await dispatchHeatReminders(y.snapshot,{...y.gateway,claim:async()=>null},y.send,new Date('2027-04-01T16:00:00Z'));assert.equal(y.calls.length,0);
});
