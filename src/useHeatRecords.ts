import {useEffect,useRef,useState,useCallback} from 'react';
import {AppState,Platform} from 'react-native';
import {supabase} from './storage';
import {loadHeatRecords} from './heatStorage';
import {emptyHeatRecords} from './heatDomain';
import {createRefreshQueue} from './refreshQueue';
import {subscribeToBrowserRecovery} from './browserRecovery';
export function useHeatRecords() {
  const [records,setRecords]=useState(emptyHeatRecords);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const ref=useRef<()=>Promise<void>>(async()=>{});const refresh=useCallback(()=>ref.current(),[]);
  useEffect(()=>{
    const queue=createRefreshQueue(loadHeatRecords,data=>{setRecords(data);setError('');setLoading(false);},(e:any)=>{setError(e.code==='PGRST205'||e.code==='42P01'?'Heat tracking needs its database update. Your litter data is unaffected.':e.message||'Unable to sync heat records.');setLoading(false);});
    ref.current=queue.refresh;const request=()=>{void queue.refresh().catch(()=>{});};
    const channel=supabase?.channel('heat-records').on('postgres_changes',{event:'*',schema:'public',table:'heat_dogs'},request).on('postgres_changes',{event:'*',schema:'public',table:'heat_cycles'},request).subscribe(status=>{if(status==='SUBSCRIBED')request();});
    request();const listener=AppState.addEventListener('change',state=>{if(state==='active')request();});const timer=setInterval(request,20000);
    const stop=subscribeToBrowserRecovery(Platform.OS,typeof window==='undefined'?undefined:window,request);
    return()=>{queue.dispose();ref.current=async()=>{};listener.remove();clearInterval(timer);stop();if(channel)void supabase!.removeChannel(channel);};
  },[]);
  return {records,error,loading,refresh};
}
