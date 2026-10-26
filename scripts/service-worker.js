/* Build placeholders are replaced by scripts/build-web.cjs. Static app files only; never kennel data. */
const RELEASE = __RELEASE__;
const CACHE = `mykennel-shell-${RELEASE}`;
const ASSETS = __ASSETS__;
const assetPaths = new Set(ASSETS);
const clientVersions = new Map();
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // An existing app keeps running until its user chooses Update app.
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    await self.clients.claim();
    for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type:'REPORT_RELEASE',release:RELEASE});
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
  if(event.data?.type==='CLIENT_RELEASE' && event.source?.id){
    clientVersions.set(event.source.id,event.data.release);
    if(event.data.release!==RELEASE)event.source.postMessage({type:'RELEASE_MISMATCH',release:RELEASE});
    event.waitUntil((async()=>{
      const windows=await self.clients.matchAll({type:'window'});
      // Retain previous bundles while another tab is still using them or hasn't reported yet.
      if(windows.length && windows.every(client=>clientVersions.get(client.id)===RELEASE)) {
        for(const name of await caches.keys())if(name.startsWith('mykennel-shell-')&&name!==CACHE)await caches.delete(name);
      }
    })());
  }
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==self.location.origin)return;
  // Supabase and authentication traffic are never intercepted or cached.
  if(event.request.mode==='navigate' && url.pathname==='/') {
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match('/') || fetch(event.request)));
  } else if(assetPaths.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.pathname) || fetch(event.request)));
  } else if(url.pathname.startsWith('/_expo/static/')) {
    // Other open tabs may still need a previously cached, content-addressed bundle.
    event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request)));
  }
});

self.addEventListener('push', event => {
  let payload={};try{payload=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification('R2GD · Heat reminder',{
    body:typeof payload.body==='string'?payload.body:'Open Heat cycles to check upcoming estimated heats.',
    icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
    tag:typeof payload.tag==='string'?payload.tag:'r2gd-heat-reminder',renotify:false,
    data:{heatReminder:true},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    // Always use the app's own origin; never open a URL supplied by a push payload.
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
      if(new URL(client.url).origin===self.location.origin){client.postMessage({type:'OPEN_HEAT_CYCLES'});await client.focus();return;}
    }
    await self.clients.openWindow('/?tab=heats');
  })());
});
