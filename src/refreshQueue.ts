// Keep background events and manual refreshes in one queue so old responses cannot win races.
export function createRefreshQueue<T>(load:()=>Promise<T>,onData:(data:T)=>void,onError:(error:unknown)=>void) {
  let active=true;
  let pending=false;
  let running:Promise<void>|null=null;
  function refresh():Promise<void> {
    if(!active) return Promise.resolve();
    pending=true;
    if(!running) {
      running=(async()=>{
        while(active && pending) {
          pending=false;
          try {const result=await load();if(active)onData(result);}
          catch(error) {if(active)onError(error);throw error;}
        }
      })().finally(()=>{running=null;});
    }
    return running;
  }
  return {refresh,dispose:()=>{active=false;pending=false;}};
}
