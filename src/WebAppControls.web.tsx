import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
type InstallPrompt = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
function standalone(){return window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & {standalone?:boolean}).standalone;}
export default function WebAppControls({editing}:{editing:boolean}) {
  const [installed,setInstalled]=useState(false);
  const [prompt,setPrompt]=useState<InstallPrompt|null>(null);
  const [help,setHelp]=useState(false);
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  const [updating,setUpdating]=useState(false);
  const [message,setMessage]=useState('');
  const reload=useRef(false);
  useEffect(()=>{
    setInstalled(standalone());
    const onPrompt=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);};
    const onInstalled=()=>{setInstalled(true);setPrompt(null);setHelp(false);};
    window.addEventListener('beforeinstallprompt',onPrompt);window.addEventListener('appinstalled',onInstalled);
    return ()=>{window.removeEventListener('beforeinstallprompt',onPrompt);window.removeEventListener('appinstalled',onInstalled);};
  },[]);
  useEffect(()=>{
    // The manifest and worker are generated for production builds, not the Expo development server.
    const release=document.querySelector('meta[name="mykennel-release"]')?.getAttribute('content');
    if(!release || !('serviceWorker' in navigator) || !window.isSecureContext)return;
    let active=true;let registration:ServiceWorkerRegistration|undefined;let watched:ServiceWorker|undefined;
    const report=()=>navigator.serviceWorker.controller?.postMessage({type:'CLIENT_RELEASE',release});
    const onMessage=(event:MessageEvent)=>{
      if(event.data?.type==='REPORT_RELEASE')report();
      if((event.data?.type==='REPORT_RELEASE'||event.data?.type==='RELEASE_MISMATCH') && event.data.release!==release && active)setWaiting(navigator.serviceWorker.controller);
    };
    const onController=()=>{if(reload.current)window.location.reload();else report();};
    const stateChanged=()=>{if(active && watched?.state==='installed' && registration?.waiting && navigator.serviceWorker.controller)setWaiting(registration.waiting);};
    const updateFound=()=>{watched?.removeEventListener('statechange',stateChanged);watched=registration?.installing || undefined;watched?.addEventListener('statechange',stateChanged);};
    navigator.serviceWorker.addEventListener('controllerchange',onController);
    navigator.serviceWorker.addEventListener('message',onMessage);
    navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(result=>{
      if(!active)return;
      registration=result;
      if(result.waiting && navigator.serviceWorker.controller)setWaiting(result.waiting);
      result.addEventListener('updatefound',updateFound);updateFound();report();
    }).catch(()=>{if(active)setMessage('Installation support is unavailable right now. You can keep using the website.');});
    const check=()=>{if(document.visibilityState==='visible')void registration?.update().catch(()=>{});};
    window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
    const timer=window.setInterval(check,60000);
    return ()=>{
      active=false;window.clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);
      navigator.serviceWorker.removeEventListener('controllerchange',onController);navigator.serviceWorker.removeEventListener('message',onMessage);
      registration?.removeEventListener('updatefound',updateFound);watched?.removeEventListener('statechange',stateChanged);
    };
  },[]);
  async function install(){
    if(!prompt){setHelp(value=>!value);return;}
    try{await prompt.prompt();await prompt.userChoice;setPrompt(null);}catch{setPrompt(null);setHelp(true);}
  }
  function update(){
    if(!waiting || editing)return;
    if(waiting.state==='activated'){window.location.reload();return;}
    if(waiting.state==='redundant'){setMessage('This update was replaced. Reopen the app after finishing your changes.');return;}
    reload.current=true;setUpdating(true);waiting.postMessage({type:'ACTIVATE_UPDATE'});
  }
  return <View style={s.container}>
    {!installed && <>
      <Pressable accessibilityRole="button" onPress={()=>void install()} style={s.button}><Text style={s.buttonText}>Install app</Text></Pressable>
      {help && <Text style={s.text}>iPhone/iPad: open this site in Safari, tap Share, then Add to Home Screen. Android: open Chrome’s menu and choose Install app or Add to Home screen.</Text>}
    </>}
    {waiting && <View accessibilityLiveRegion="polite" style={s.notice}>
      <Text style={s.heading}>An app update is ready</Text>
      <Text style={s.text}>{editing?'Finish or cancel your current edit before updating.':'Update to load the latest version. Your saved records stay in the shared kennel.'}</Text>
      <Pressable accessibilityRole="button" disabled={editing||updating} onPress={update} style={[s.button,(editing||updating)&&{opacity:.45}]}><Text style={s.buttonText}>{updating?'Updating…':'Update app'}</Text></Pressable>
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.text}>{message}</Text>}
  </View>;
}
const s=StyleSheet.create({container:{gap:10},button:{alignSelf:'flex-start',backgroundColor:'#e7ecdf',paddingHorizontal:16,paddingVertical:12,minHeight:46,borderRadius:10,justifyContent:'center'},buttonText:{color:'#244c40',fontSize:14,fontWeight:'600'},notice:{backgroundColor:'#e9eee0',borderRadius:14,padding:16,gap:10},heading:{fontSize:16,fontWeight:'600',color:'#244c40'},text:{fontSize:14,color:'#59695f',lineHeight:22}});
