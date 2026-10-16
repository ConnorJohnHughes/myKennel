// In-memory HTTP/WebSocket fixture shared by browser integration tests only.
const {randomUUID}=require('node:crypto');
module.exports=function createMockSupabase(){
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

return {records,members,sockets,code,transport,emit};
};
