// Shared, timezone-independent calendar arithmetic for the UI and scheduled reminders.
export type ReminderStage = 'month'|'week'|'day';
export function addMonths(date:string,months:number) {
  const [year,month,day]=date.split('-').map(Number);
  const target=new Date(Date.UTC(year,month-1+months,1,12));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0,12)).getUTCDate();
  target.setUTCDate(Math.min(day,last));return target.toISOString().slice(0,10);
}
export function addDays(date:string,days:number) {
  const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export function reminderDates(detected:string) {
  const expected=addMonths(detected,6);
  return {expected,month:expected.slice(0,8)+'01',week:addDays(expected,-7),day:expected};
}
export function localClock(now:Date,timeZone:string) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;
  return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};
}
export function dueStages(detected:string,date:string):ReminderStage[] {
  const dates=reminderDates(detected);
  return (['month','week','day'] as const).filter(stage=>dates[stage]===date);
}
export function reminderBody(name:string,expected:string,stages:ReminderStage[]) {
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const formatted=expected.slice(8,10)+months[Number(expected.slice(5,7))-1]+expected.slice(2,4);
  const when=stages.includes('day')?'today':stages.includes('week')?'in one week':'this month';
  return `${name}’s next heat is estimated ${when} (${formatted}). Record the actual date when detected.`;
}
