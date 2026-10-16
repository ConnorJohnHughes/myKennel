type BrowserEvents = {
  addEventListener?: (event:string,listener:()=>void)=>void;
  removeEventListener?: (event:string,listener:()=>void)=>void;
};
// React Native exposes `window` too, but it is not a DOM Window.
// Mobile foreground recovery is handled separately through AppState.
export function subscribeToBrowserRecovery(platform:string,target:BrowserEvents|undefined,recover:()=>void) {
  if(platform!=='web' || typeof target?.addEventListener!=='function' || typeof target.removeEventListener!=='function') return ()=>{};
  target.addEventListener('online',recover);
  target.addEventListener('focus',recover);
  return ()=>{
    target.removeEventListener!('online',recover);
    target.removeEventListener!('focus',recover);
  };
}
