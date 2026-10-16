// Real service-worker lifecycle test on an internal loopback server, with mocked Supabase only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const createMockSupabase=require('./mock-supabase.cjs');
const root=path.resolve(__dirname,'../dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/');
assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
const first=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).release;
const second=first+'-next';let next=false;
const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://test').pathname;
  // Match Cloudflare Pages' canonical redirect for HTML index files.
  if(pathname==='/index.html'){res.writeHead(301,{location:'/'});res.end();return;}
  if(pathname==='/')pathname='/index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  let body=fs.readFileSync(file);
  if(next && (pathname==='/index.html'||pathname==='/sw.js'||pathname==='/version.json'))body=Buffer.from(body.toString().replaceAll(first,second));
  const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const fixture=createMockSupabase();await fixture.transport(context);
    const one=await context.newPage();const errors=[];one.on('pageerror',e=>errors.push(e.message));
    await one.goto(base);
    await one.getByRole('button',{name:'Install app',exact:true}).click();
    // In browsers without a prompt event, install guidance remains accessible.
    const guide=one.getByText(/iPhone\/iPad: open this site in Safari/);
    if(await guide.count())await guide.waitFor();
    const manifestLink=await one.locator('link[rel="manifest"]').getAttribute('href');assert.equal(manifestLink,'/manifest.webmanifest');
    assert.equal(await one.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'/icons/icon-180.png');
    for(const icon of manifest.icons){const response=await context.request.get(base+icon.src);assert.equal(response.status(),200);assert.equal((await response.body()).readUInt32BE(16),Number(icon.sizes.split('x')[0]));}
    await one.evaluate(()=>navigator.serviceWorker.ready);
    await one.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await one.getByLabel('Kennel code',{exact:true}).fill(fixture.code);await one.getByRole('button',{name:'Connect to kennel',exact:true}).click();
    await one.getByRole('button',{name:'+ Add litter',exact:true}).waitFor();
    const two=await context.newPage();two.on('pageerror',e=>errors.push(e.message));await two.goto(base);
    await two.getByRole('button',{name:'+ Add litter',exact:true}).waitFor();
    await two.getByRole('button',{name:'+ Add litter',exact:true}).click();await two.getByLabel('Litter name',{exact:true}).fill('Unsaved litter draft');
    // Simulate a newly deployed release. Its worker waits; neither running page reloads.
    next=true;
    await one.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
    await one.getByRole('button',{name:'Update app',exact:true}).waitFor();
    await two.getByRole('button',{name:'Update app',exact:true}).waitFor();
    assert.equal(await two.getByRole('button',{name:'Update app',exact:true}).isDisabled(),true);
    assert.equal(await two.getByLabel('Litter name',{exact:true}).inputValue(),'Unsaved litter draft');
    assert.equal(await one.locator('meta[name="mykennel-release"]').getAttribute('content'),first);
    // Accept on the idle page; the page with a draft must stay on its old running release.
    await one.getByRole('button',{name:'Update app',exact:true}).click();
    await one.waitForFunction(expected=>document.querySelector('meta[name="mykennel-release"]').content===expected,second);
    assert.equal(await two.getByLabel('Litter name',{exact:true}).inputValue(),'Unsaved litter draft');
    assert.equal(await two.locator('meta[name="mykennel-release"]').getAttribute('content'),first);
    await two.getByRole('button',{name:'Cancel',exact:true}).click();
    await two.getByRole('button',{name:'Update app',exact:true}).click();
    await two.waitForFunction(expected=>document.querySelector('meta[name="mykennel-release"]').content===expected,second);
    // The static app shell can open offline, without pretending shared records are locally saved.
    await context.setOffline(true);await one.reload();
    assert.equal(await one.locator('meta[name="mykennel-release"]').getAttribute('content'),second);
    const cached=await one.evaluate(async()=>{const found=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())found.push(request.url);return found;});
    assert.ok(cached.length>0);assert.ok(cached.some(url=>url===base+'/'));assert.equal(cached.some(url=>url===base+'/index.html'),false);assert.equal(cached.some(url=>url.includes('supabase.co')||url.includes('/auth/')||url.includes('/rest/')),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: install manifest/icons/iOS metadata, real worker install/offline shell, two-release update, protected draft in a second tab, explicit updates per tab, and no cached Supabase data.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
