// Tests the real app/Supabase client in three browsers against a mocked HTTP + Realtime transport.
// This is not a hosted Supabase verification. No real kennel data or access code is used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const api='https://wnwdiyqlpaltndseqfxo.supabase.co';
const code='test-only-shared-kennel-code-123456789';
const records={litters:[],puppies:[],weights:[]};
const members=new Set();const sockets=new Set();
function jwt(id){return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,iss:api+'/auth/v1'})).toString('base64url'),'test-signature'].join('.');}
function identity(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub;}catch{return null;}}
function emit(table,event,row){
  for(const entry of sockets){
    if(!entry.joined||!members.has(entry.user))continue;
    const filter=entry.filters.find(f=>f.table===table);if(!filter)continue;
    entry.socket.send(JSON.stringify([entry.joinRef,null,entry.topic,'postgres_changes',{ids:[filter.id],data:{schema:'public',table,type:event,record:row,old_record:{},columns:[],commit_timestamp:new Date().toISOString()}}]));
  }
}
async function transport(context){
  await context.route(api+'/**',async route=>{
    const req=route.request();const url=new URL(req.url());const method=req.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    const id=identity((req.headers().authorization||'').replace(/^Bearer /,''));
    if(url.pathname==='/auth/v1/signup'){
      const userId=randomUUID();return reply({access_token:jwt(userId),refresh_token:'test-refresh-'+userId,token_type:'bearer',expires_in:3600,user:{id:userId,aud:'authenticated',role:'authenticated',is_anonymous:true,app_metadata:{provider:'anonymous',providers:[]},user_metadata:{},created_at:new Date().toISOString()}});
    }
    if(url.pathname==='/auth/v1/logout')return reply({});
    if(url.pathname==='/rest/v1/rpc/join_kennel'){
      if(!id||req.postDataJSON().access_code!==code)return reply({message:'That kennel code is incorrect',code:'P0001'},400);
      members.add(id);return reply(null);
    }
    const table=url.pathname.split('/').pop();
    if(table==='staff')return reply(id&&members.has(id)?[{user_id:id}]:[]);
    if(!records[table])return reply({message:'Unmocked endpoint'},404);
    if(!members.has(id))return reply({message:'Access denied'},403);
    if(method==='GET')return reply(records[table]);
    if(method==='POST'){
      const row={...req.postDataJSON(),id:randomUUID(),version:1};
      if(table==='weights'&&records.weights.some(w=>w.puppy_id===row.puppy_id&&w.date===row.date))return reply({message:'duplicate daily weight',code:'23505'},409);
      records[table].push(row);emit(table,'INSERT',row);return route.fulfill({status:201,body:''});
    }
    if(method==='PATCH'){
      const row=records[table].find(r=>r.id===url.searchParams.get('id')?.slice(3)&&r.version===Number(url.searchParams.get('version')?.slice(3)));
      if(!row)return reply(null);
      Object.assign(row,req.postDataJSON(),{version:row.version+1});emit(table,'UPDATE',row);return reply(row);
    }
    return reply({message:'Unsupported mock operation'},400);
  });
  await context.routeWebSocket(/^wss:\/\/wnwdiyqlpaltndseqfxo\.supabase\.co\/realtime\//,socket=>{
    const entry={socket,joined:false,topic:null,joinRef:null,filters:[],user:null};sockets.add(entry);
    socket.onMessage(raw=>{
      const [joinRef,ref,topic,event,payload]=JSON.parse(raw.toString());
      if(event==='phx_join'){
        entry.joined=true;entry.topic=topic;entry.joinRef=joinRef;entry.user=identity(payload.access_token);
        entry.filters=(payload.config.postgres_changes||[]).map((f,i)=>({...f,id:i+1}));
        socket.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:entry.filters}}]));
      }else if(event==='heartbeat'||event==='phx_leave'){
        if(event==='phx_leave')entry.joined=false;
        socket.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{}}]));
      }
    });
    socket.onClose(()=>{sockets.delete(entry);});
  });
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const pages=[];const errors=[];
    for(let i=0;i<3;i++){
      const context=await browser.newContext({viewport:{width:390,height:844}});await transport(context);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));pages.push(page);
      await page.goto(process.env.SHARED_SMOKE_URL||'http://127.0.0.1:8080');
      await page.getByLabel('Kennel code',{exact:true}).fill(i===0?'incorrect':code);
      await page.getByRole('button',{name:'Connect to kennel',exact:true}).click();
      if(i===0){
        await page.getByText('That kennel code is incorrect',{exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'+ Add litter',exact:true}).count(),0);
        await page.getByLabel('Kennel code',{exact:true}).fill(code);await page.getByRole('button',{name:'Connect to kennel',exact:true}).click();
      }
      await page.getByRole('button',{name:'+ Add litter',exact:true}).waitFor();
      await page.getByText('Live updates connected',{exact:true}).waitFor();
      assert.equal(await page.getByLabel('Email',{exact:true}).count(),0);
    }
    const [one,two,three]=pages;
    await one.getByRole('button',{name:'+ Add litter',exact:true}).click();
    await one.getByLabel('Litter name',{exact:true}).fill('Shared litter');
    await one.getByLabel('Mother (dam)',{exact:true}).fill('Willow');
    await one.getByLabel('Father (sire)',{exact:true}).fill('Oak');
    await one.getByRole('button',{name:'Save',exact:true}).click();
    for(const page of pages){await page.getByRole('button',{name:'Open Shared litter',exact:true}).click();}
    await one.getByRole('button',{name:'+ Add puppy',exact:true}).click();
    await one.getByLabel('Puppy name or identifier',{exact:true}).fill('Blue');await one.getByRole('button',{name:'Save',exact:true}).click();
    for(const page of pages){await page.getByRole('button',{name:'Edit Blue',exact:true}).waitFor();}
    await two.getByRole('button',{name:'+ Weight',exact:true}).click();
    await two.getByLabel('Weight (oz)',{exact:true}).fill('18');await two.getByRole('button',{name:'Save',exact:true}).click();
    for(const page of pages){await page.getByText('1 lb 2 oz',{exact:true}).waitFor();}
    // Preserve a draft while someone else saves; reject a stale version instead of overwriting.
    await one.getByRole('button',{name:'Edit Blue',exact:true}).click();await one.getByLabel('Puppy name or identifier',{exact:true}).fill('Daisy');
    await three.getByRole('button',{name:'Edit Blue',exact:true}).click();await three.getByLabel('Puppy name or identifier',{exact:true}).fill('Clover');
    await three.getByRole('button',{name:'Save changes',exact:true}).click();
    await one.getByRole('button',{name:'Edit Clover',exact:true}).waitFor();assert.equal(await one.getByLabel('Puppy name or identifier',{exact:true}).inputValue(),'Daisy');
    await one.getByRole('button',{name:'Save changes',exact:true}).click();
    await one.getByText('This record changed on another device. Cancel this edit and reopen the latest record.',{exact:true}).waitFor();
    assert.equal(records.puppies[0].name,'Clover');await one.getByRole('button',{name:'Cancel',exact:true}).click();
    await two.getByRole('button',{name:'Edit Clover',exact:true}).waitFor();
    // Different records can be corrected concurrently without blocking one another.
    await one.getByRole('button',{name:'Edit litter',exact:true}).click();
    await one.getByLabel('Litter name',{exact:true}).fill('Shared updates');
    await two.getByRole('button',{name:/^Edit weight for Clover on /}).click();
    await two.getByLabel('Weight (oz)',{exact:true}).fill('20');
    await one.getByRole('button',{name:'Save changes',exact:true}).click();
    await two.getByRole('button',{name:'Save changes',exact:true}).click();
    for(const page of pages){await page.getByText('Shared updates',{exact:true}).waitFor();await page.getByText('1 lb 4 oz',{exact:true}).waitFor();}
    // Returning to a device retains admission without asking for the code again.
    await two.reload();await two.getByRole('button',{name:'Open Shared updates',exact:true}).click();
    await two.getByRole('button',{name:'Edit Clover',exact:true}).waitFor();
    // Close a socket, change the database without emitting, and verify re-subscribe reconciliation.
    const connection=[...sockets].find(e=>e.joined);connection.socket.close({code:1012,reason:'test reconnect'});sockets.delete(connection);
    records.puppies[0].name='Recovered';records.puppies[0].version++;
    for(const page of pages){await page.getByRole('button',{name:'Edit Recovered',exact:true}).waitFor({timeout:30000});}
    assert.deepEqual(errors,[]);
    console.log('PASS (mocked transport): three independent device sessions, code admission, live litter/puppy/weight updates, preserved drafts, conflict rejection, session restore, and reconnect reconciliation.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
