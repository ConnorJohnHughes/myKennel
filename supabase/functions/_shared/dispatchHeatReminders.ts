import {dueStages,localClock,reminderDates,reminderBody} from './heatSchedule.ts';
export type Device={id:string;user_id:string;endpoint:string;p256dh:string;auth:string;timezone:string};
type Snapshot={ready:boolean;dogs:{id:string;name:string}[];cycles:{id:string;dog_id:string;detected:string;version:number}[];subscriptions:Device[]};
export type NotificationPayload={body:string;tag:string};
export async function dispatchHeatReminders(snapshot:Snapshot,gateway:{claim:(device:string,cycle:string,version:number,date:string)=>Promise<string|null>;finish:(lease:string,delivered:boolean,expired:boolean)=>Promise<void>},send:(device:Device,payload:NotificationPayload)=>Promise<void>,now:Date) {
  const result={sent:0,failed:0,skipped:0};if(!snapshot.ready)return result;
  for(const device of snapshot.subscriptions){
    let clock;try{clock=localClock(now,device.timezone);}catch{result.failed++;continue;}
    if(clock.hour<9)continue;
    for(const cycle of snapshot.cycles){
      const stages=dueStages(cycle.detected,clock.date);if(!stages.length)continue;
      const dog=snapshot.dogs.find(d=>d.id===cycle.dog_id);if(!dog)continue;
      let lease:string|null=null;
      try{
        lease=await gateway.claim(device.id,cycle.id,cycle.version,clock.date);
        if(!lease){result.skipped++;continue;}
        await send(device,{body:reminderBody(dog.name,reminderDates(cycle.detected).expected,stages),tag:`heat-${cycle.id}-${cycle.version}-${clock.date}`});
        await gateway.finish(lease,true,false);result.sent++;
      }catch(error){
        const status=(error as {statusCode?:number}).statusCode;
        if(lease)try{await gateway.finish(lease,false,status===404||status===410);}catch{}
        result.failed++;
      }
    }
  }
  return result;
}
