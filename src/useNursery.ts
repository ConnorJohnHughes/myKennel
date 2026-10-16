import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { emptyRecords, type Records } from './domain';
import { joinKennel, loadRecords, supabase } from './storage';
import { subscribeToBrowserRecovery } from './browserRecovery';
import { createRefreshQueue } from './refreshQueue';

export function useNursery() {
  const [records,setRecords]=useState<Records>(emptyRecords);
  const [session,setSession]=useState<Session|null>(null);
  const [authReady,setAuthReady]=useState(!supabase);
  const [hasAccess,setHasAccess]=useState(!supabase);
  const [loading,setLoading]=useState(false);
  const [connection,setConnection]=useState<'local'|'connecting'|'live'|'reconnecting'>(supabase?'connecting':'local');
  const [syncError,setSyncError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const refresh=useCallback(()=>refreshRef.current(),[]);
  useEffect(()=>{
    if(!supabase) return;
    let active=true;
    // Register the listener first so an auth change cannot fall between getSession and subscribe.
    const {data}=supabase.auth.onAuthStateChange((_event,next)=>{if(active){setSession(next);setAuthReady(true);}});
    supabase.auth.getSession().then(({data,error})=>{
      if(!active)return;
      if(error)setSyncError(error.message);
      setSession(data.session);setAuthReady(true);
    }).catch(error=>{if(active){setSyncError(error.message);setAuthReady(true);}});
    if(AppState.currentState==='active')supabase.auth.startAutoRefresh();
    const listener=AppState.addEventListener('change',state=>{
      if(state==='active')supabase!.auth.startAutoRefresh();else supabase!.auth.stopAutoRefresh();
    });
    return ()=>{active=false;data.subscription.unsubscribe();listener.remove();supabase!.auth.stopAutoRefresh();};
  },[]);
  useEffect(()=>{
    setRecords(emptyRecords);setHasAccess(!supabase);setSyncError('');
    if(supabase && !session){setLoading(false);setConnection('connecting');return;}
    let active=true;
    setLoading(true);
    const queue=createRefreshQueue(loadRecords,data=>{
      setRecords(data);setHasAccess(true);setLoading(false);setSyncError('');
    },(error:any)=>{
      setLoading(false);
      if(error.code==='KENNEL_ACCESS_REQUIRED'){setHasAccess(false);setRecords(emptyRecords);}
      else setSyncError(error.message || 'Unable to sync. Check your connection.');
    });
    refreshRef.current=queue.refresh;
    const request=()=>{void queue.refresh().catch(()=>{});};
    // Subscribe before loading; a SUBSCRIBED/re-subscribed callback reloads any missed changes.
    const channel=supabase?.channel(`nursery-${session!.user.id}-${attempt}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'litters'},request)
      .on('postgres_changes',{event:'*',schema:'public',table:'puppies'},request)
      .on('postgres_changes',{event:'*',schema:'public',table:'weights'},request)
      .on('postgres_changes',{event:'*',schema:'public',table:'staff'},request)
      .subscribe(status=>{
        if(!active)return;
        if(status==='SUBSCRIBED'){setConnection('live');request();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setConnection('reconnecting');
      });
    if(supabase)setConnection('connecting');
    request();
    // Reconcile after foregrounding/reconnecting and periodically if a socket event was missed.
    const listener=AppState.addEventListener('change',state=>{if(state==='active')request();});
    const interval=supabase?setInterval(request,20000):undefined;
    const reconnect=()=>request();
    const stopBrowserRecovery=subscribeToBrowserRecovery(Platform.OS,typeof window==='undefined'?undefined:window,reconnect);
    return ()=>{
      active=false;queue.dispose();refreshRef.current=async()=>{};listener.remove();
      if(interval)clearInterval(interval);
      stopBrowserRecovery();
      if(channel)void supabase!.removeChannel(channel);
    };
  },[session?.user.id,attempt]);
  const connect=useCallback(async(code:string)=>{
    await joinKennel(code);
    setAttempt(n=>n+1); // Also retry membership loading when the anonymous session already existed.
  },[]);
  return {records,session,authReady,hasAccess,loading,connection,syncError,refresh,connect};
}
