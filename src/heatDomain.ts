import {checkDate,required,validDate} from './domain.ts';
export {reminderDates,addMonths,addDays} from '../supabase/functions/_shared/heatSchedule.ts';
export type HeatDog={id:string;name:string;version?:number};
export type HeatCycle={id:string;dogId:string;detected:string;version?:number};
export type HeatRecords={dogs:HeatDog[];cycles:HeatCycle[]};
export const emptyHeatRecords:HeatRecords={dogs:[],cycles:[]};
export function heatHistory(records:HeatRecords,dogId:string) {
  return records.cycles.filter(c=>c.dogId===dogId).sort((a,b)=>b.detected.localeCompare(a.detected));
}
export function validateHeatName(records:HeatRecords,name:string,id?:string) {
  const clean=required(name,'Dog name');
  if(records.dogs.some(d=>d.id!==id&&d.name.toLowerCase()===clean.toLowerCase()))throw new Error('That dog is already being tracked. Add a new heat date to her existing record.');
  return clean;
}
export function validateHeatDate(records:HeatRecords,dogId:string,date:string,id?:string) {
  if(!records.dogs.some(d=>d.id===dogId))throw new Error('Dog no longer exists. Refresh and try again.');
  checkDate(date);
  if(records.cycles.some(c=>c.id!==id&&c.dogId===dogId&&c.detected===date))throw new Error('That heat date is already recorded for this dog.');
  return date;
}
export function validHeatDate(date:string){if(!validDate(date))throw new Error('Choose a valid detected heat date.');checkDate(date);return date;}
