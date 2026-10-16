// Tests the real app/Supabase client in three browsers against a mocked HTTP + Realtime transport.
// This is not a hosted Supabase verification. No real kennel data or access code is used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {records,members,sockets,code,transport}=require('./mock-supabase.cjs')();
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
