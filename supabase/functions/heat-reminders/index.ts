import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import {dispatchHeatReminders,type Device,type NotificationPayload} from '../_shared/dispatchHeatReminders.ts';

const origin='https://mykennel.pages.dev';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});}
async function sameSecret(provided:string,expected:string){
  const encode=new TextEncoder();const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(provided)));const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(expected)));
  return a.reduce((result,value,i)=>result|(value^b[i]),0)===0;
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return json({error:'POST required'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return json({error:'Origin not allowed'},403);
  const url=Deno.env.get('SUPABASE_URL');const roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');const publicKey=Deno.env.get('VAPID_PUBLIC_KEY');const privateKey=Deno.env.get('VAPID_PRIVATE_KEY');const secret=Deno.env.get('HEAT_REMINDER_SECRET');
  if(!url||!roleKey||!publicKey||!privateKey||!secret)return json({error:'Reminder server configuration is incomplete'},503);
  const db=createClient(url,roleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  webpush.setVapidDetails(origin,publicKey,privateKey);
  const send=(device:Device,payload:NotificationPayload)=>webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify(payload),{TTL:43200,timeout:15000}).then(()=>{});
  let body:Record<string,unknown>;try{body=await request.json();}catch{return json({error:'Invalid JSON'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request'},400);
  if(body.mode==='test'){
    const authorization=request.headers.get('Authorization')||'';const token=authorization.replace(/^Bearer /,'');
    const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return json({error:'Device connection required'},401);
    const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const membership=await client.from('staff').select('user_id').limit(1);if(membership.error||!membership.data?.length)return json({error:'Kennel access required'},403);
    const device=await client.from('heat_push_subscriptions').select('*').eq('endpoint',body.endpoint).eq('enabled',true).maybeSingle();
    if(device.error||!device.data)return json({error:'Enable reminders on this device first'},400);
    try{await send(device.data,{body:'R2GD heat reminders are connected on this device. Your estimated heat reminders will arrive here.',tag:'r2gd-heat-test'});return json({sent:true});}
    catch(e){const status=(e as {statusCode?:number}).statusCode;if(status===404||status===410)await client.rpc('disable_heat_push',{push_endpoint:device.data.endpoint});return json({error:'The test could not be delivered. Turn reminders off and enable them again.'},502);}
  }
  const supplied=request.headers.get('x-heat-reminder-secret')||'';
  if(!supplied||!await sameSecret(supplied,secret))return json({error:'Unauthorized'},401);
  try{
    const {data,error}=await db.rpc('heat_push_dispatch_data');if(error)throw error;
    const result=await dispatchHeatReminders(data,{
      claim:async(device,cycle,version,date)=>{const {data,error}=await db.rpc('claim_heat_push',{device_id:device,heat_id:cycle,heat_version:version,reminder_date:date});if(error)throw error;return data;},
      finish:async(lease,delivered,expired)=>{const {error}=await db.rpc('finish_heat_push',{delivery_lease:lease,delivered,expired});if(error)throw error;},
    },send,new Date());
    return json(result);
  }catch{return json({error:'Reminder dispatch failed; check database setup'},500);}
});
