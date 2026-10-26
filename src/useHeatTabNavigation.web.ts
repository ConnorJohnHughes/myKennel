import {useEffect,useRef} from 'react';
export function useHeatTabNavigation(admitted:boolean,editing:boolean,open:()=>void){
  const pending=useRef(new URLSearchParams(window.location.search).get('tab')==='heats');
  const handler=useRef(open);handler.current=open;
  useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.data?.type==='OPEN_HEAT_CYCLES'){pending.current=true;if(admitted&&!editing){pending.current=false;handler.current();}}};navigator.serviceWorker?.addEventListener('message',receive);return()=>navigator.serviceWorker?.removeEventListener('message',receive);},[admitted,editing]);
  useEffect(()=>{if(pending.current&&admitted&&!editing){pending.current=false;handler.current();}},[admitted,editing]);
}
