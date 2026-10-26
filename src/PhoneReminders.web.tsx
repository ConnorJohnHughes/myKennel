import React,{useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {supabase} from './storage';
function keyBytes(key:string){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function installedIOS(){const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);return !ios||window.matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;}
export async function disableHeatRemindersOnThisDevice(){
  if(!supabase||!('serviceWorker' in navigator))return;
  const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager?.getSubscription();
  if(subscription){const {error}=await supabase.rpc('disable_heat_push',{push_endpoint:subscription.endpoint});if(error)throw error;await subscription.unsubscribe();}
}
export default function PhoneReminders(){
  const [config,setConfig]=useState<{ready:boolean;publicKey?:string}|null>(null);const [enabled,setEnabled]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const supported=typeof window!=='undefined'&&'Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator&&window.isSecureContext;
  const homeScreen=installedIOS();
  useEffect(()=>{
    if(!supabase)return;let active=true;
    (async()=>{
      const {data,error}=await supabase.rpc('get_heat_push_config');if(error)throw error;if(active)setConfig(data);
      if(supported&&data?.ready){
        const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager.getSubscription();
        if(subscription){const {data,error}=await supabase.from('heat_push_subscriptions').select('enabled').eq('endpoint',subscription.endpoint).maybeSingle();if(error)throw error;if(active)setEnabled(!!data?.enabled);}
      }
    })().catch(()=>{if(active)setConfig({ready:false});});return()=>{active=false;};
  },[]);
  async function toggle(){
    if(!supabase||!config?.ready||!config.publicKey||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      if(!enabled){
        // Keep the permission request in this explicit user gesture (required on iPhone).
        const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Allow notifications in your browser or phone settings to receive heat reminders.');
        const registration=await navigator.serviceWorker.getRegistration();if(!registration?.active)throw new Error('Open the hosted home-screen app before enabling reminders.');
        let subscription=await registration.pushManager.getSubscription();
        const applicationServerKey=keyBytes(config.publicKey);
        if(subscription?.options.applicationServerKey&&Array.from(new Uint8Array(subscription.options.applicationServerKey)).join(',')!==Array.from(applicationServerKey).join(',')){
          await supabase.rpc('disable_heat_push',{push_endpoint:subscription.endpoint});await subscription.unsubscribe();subscription=null;
        }
        subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
        const value=subscription.toJSON();
        const {error}=await supabase.rpc('register_heat_push',{push_endpoint:subscription.endpoint,push_p256dh:value.keys!.p256dh,push_auth:value.keys!.auth,device_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
        if(error)throw error;setEnabled(true);
      }else{
        await disableHeatRemindersOnThisDevice();setEnabled(false);
      }
    }catch(e:any){setError(e.message||'Unable to change phone reminders.');}finally{setBusy(false);}
  }
  async function testReminder(){
    if(!supabase||busy)return;setBusy(true);setError('');setNotice('');
    try{const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager.getSubscription();if(!subscription)throw new Error('Enable reminders on this device first.');
      const {error}=await supabase.functions.invoke('heat-reminders',{body:{mode:'test',endpoint:subscription.endpoint}});if(error)throw new Error('The test could not be sent. Check the reminder server setup and try again.');
      setNotice('Test sent. Check this phone’s notifications.');
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <View style={s.box}>
    <Text style={s.heading}>Phone heat reminders</Text>
    <Text style={s.text}>First day of the expected month, seven days before, and the estimated day. Reminders arrive around 9 am in this device’s saved timezone.</Text>
    {!supabase?<Text style={s.text}>Phone reminders are available in the shared app.</Text>:!supported?<Text style={s.text}>This browser cannot receive push reminders. Use the installed app in a supported browser on your phone.</Text>:!homeScreen?<Text style={s.text}>On iPhone or iPad, add this site to your home screen, open it there, then enable reminders.</Text>:!config?<Text style={s.text}>Checking reminder setup…</Text>:!config.ready?<Text style={s.text}>Phone reminders need their one-time server setup. Heat dates and history still work.</Text>:<>
      <Text style={s.text}>{enabled?'Reminders enabled on this device.':'Enable reminders separately on each person’s phone.'}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void toggle()} style={[s.button,busy&&{opacity:.5}]}><Text style={s.buttonText}>{busy?'Saving…':enabled?'Turn off heat reminders':'Enable heat reminders'}</Text></Pressable>
      {enabled&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void testReminder()} style={s.button}><Text style={s.buttonText}>Send test heat reminder</Text></Pressable>}
    </>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={s.text}>{notice}</Text>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
const s=StyleSheet.create({box:{backgroundColor:'#e9eee0',padding:16,borderRadius:14,gap:10},heading:{fontSize:16,fontWeight:'600',color:'#244c40'},text:{fontSize:14,lineHeight:22,color:'#59695f'},button:{backgroundColor:'#285845',padding:14,borderRadius:10,minHeight:46,alignSelf:'flex-start'},buttonText:{color:'#fff',fontWeight:'600'},error:{color:'#8e302b',fontSize:14,lineHeight:22}});
