// Two-browser integration test; all hosted requests and push subscription delivery use test fixtures.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const webpush=require('web-push');
const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
async function date(page,value){
  await page.getByRole('button',{name:/^Detected heat date:/}).click();await page.getByRole('button',{name:'Choose year',exact:true}).click();
  await page.getByRole('button',{name:`Year ${Number(value.slice(0,4))}`,exact:true}).click();await page.getByRole('button',{name:`Month ${months[Number(value.slice(5,7))-1]}`,exact:true}).click();
  await page.getByRole('button',{name:`Select ${value.slice(8,10)}${months[Number(value.slice(5,7))-1]}${value.slice(2,4)}`,exact:true}).click();
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const fixture=require('./mock-supabase.cjs')();const errors=[];const pages=[];
    fixture.records.litters.push({id:'existing',name:'Existing litter',mother:'Willow',father:'Oak',born:'2026-01-01',version:1});
    fixture.records.puppies.push({id:'puppy',litter_id:'existing',name:'Blue',version:1});fixture.records.weights.push({id:'weight',puppy_id:'puppy',date:'2026-01-01',grams:340.194,version:1});
    const original=JSON.stringify(fixture.records.weights);
    for(let i=0;i<2;i++){
      const context=await browser.newContext({viewport:{width:390,height:844},permissions:['notifications']});await fixture.transport(context);
      await context.addInitScript(()=>{
        let subscription=null;
        PushManager.prototype.getSubscription=async()=>subscription;
        PushManager.prototype.subscribe=async function(options){subscription={endpoint:'https://fcm.googleapis.com/test-device-'+Math.random(),options:{applicationServerKey:options.applicationServerKey.buffer},toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'B'.repeat(87),auth:'C'.repeat(22)}};},async unsubscribe(){subscription=null;return true;}};return subscription;};
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));pages.push(page);
      await page.goto(process.env.HEAT_SMOKE_URL||'http://127.0.0.1:8080');await page.getByLabel('Kennel code',{exact:true}).fill(fixture.code);await page.getByRole('button',{name:'Connect to kennel',exact:true}).click();
      await page.getByText('Rust to Gold Dust Bullies',{exact:true}).first().waitFor();await page.getByRole('tab',{name:'Heat cycles',exact:true}).click();
      await page.getByText('Phone reminders need their one-time server setup. Heat dates and history still work.',{exact:true}).waitFor();
    }
    const [one,two]=pages;
    await one.getByRole('button',{name:'+ Track a dog',exact:true}).click();await one.getByLabel('Dog name',{exact:true}).fill('Willow');await date(one,'2026-04-15');
    assert.equal(await one.getByRole('tab',{name:'Litters',exact:true}).isDisabled(),true);await one.getByRole('button',{name:'Save heat record',exact:true}).click();
    await two.getByText('Estimated next heat: 15OCT26',{exact:true}).waitFor();
    await two.getByRole('button',{name:'Record heat for Willow',exact:true}).click();await date(two,'2026-10-20');await two.getByRole('button',{name:'Save heat record',exact:true}).click();
    await one.getByText('Estimated next heat: 20APR27',{exact:true}).waitFor();await one.getByText('Reminder dates: 01APR27 · 13APR27 · 20APR27',{exact:true}).waitFor();
    await one.getByRole('button',{name:'Record heat for Willow',exact:true}).click();await date(one,'2026-08-15');await one.getByRole('button',{name:'Save heat record',exact:true}).click();
    await one.getByRole('button',{name:'View heat history for Willow (3)',exact:true}).click();await one.getByRole('button',{name:'Edit heat for Willow on 15APR26',exact:true}).waitFor();
    await one.getByRole('button',{name:'Edit heat for Willow on 20OCT26',exact:true}).click();await date(one,'2026-10-21');await one.getByRole('button',{name:'Save heat record',exact:true}).click();
    await two.getByText('Estimated next heat: 21APR27',{exact:true}).waitFor();
    await two.getByRole('button',{name:'Edit name for Willow',exact:true}).click();await two.getByLabel('Dog name',{exact:true}).fill('Hazel');await two.getByRole('button',{name:'Save heat record',exact:true}).click();
    await one.getByRole('button',{name:'Record heat for Hazel',exact:true}).waitFor();
    await one.getByRole('button',{name:'Record heat for Hazel',exact:true}).click();await date(one,'2026-10-21');await one.getByRole('button',{name:'Save heat record',exact:true}).click();
    await one.getByText('That heat date is already recorded for this dog.',{exact:true}).waitFor();await one.getByRole('button',{name:'Cancel heat edit',exact:true}).click();
    fixture.configurePush(webpush.generateVAPIDKeys().publicKey);
    await one.getByRole('tab',{name:'Litters',exact:true}).click();await one.getByRole('button',{name:'Open Existing litter',exact:true}).click();await one.getByText('12 oz',{exact:true}).waitFor();
    assert.equal(JSON.stringify(fixture.records.weights),original);
    await one.getByRole('tab',{name:'Heat cycles',exact:true}).click();await one.evaluate(()=>navigator.serviceWorker.ready);
    await one.getByRole('button',{name:'Enable heat reminders',exact:true}).click();await one.getByRole('button',{name:'Send test heat reminder',exact:true}).click();
    await one.getByText('Test sent. Check this phone’s notifications.',{exact:true}).waitFor();assert.equal(fixture.pushTests.length,1);assert.equal(fixture.records.heat_push_subscriptions[0].enabled,true);
    await one.getByRole('button',{name:'Turn off heat reminders',exact:true}).click();await one.getByRole('button',{name:'Enable heat reminders',exact:true}).waitFor();assert.equal(fixture.records.heat_push_subscriptions[0].enabled,false);
    // A stale name correction cannot overwrite another member's save.
    await one.getByRole('button',{name:'Edit name for Hazel',exact:true}).click();await one.getByLabel('Dog name',{exact:true}).fill('Unsaved name');
    await two.getByRole('button',{name:'Edit name for Hazel',exact:true}).click();await two.getByLabel('Dog name',{exact:true}).fill('Gold Dust');await two.getByRole('button',{name:'Save heat record',exact:true}).click();
    await one.getByRole('button',{name:'Record heat for Gold Dust',exact:true}).waitFor();await one.getByRole('button',{name:'Save heat record',exact:true}).click();
    await one.getByText('This record changed on another device. Cancel and reopen it to edit the latest version.',{exact:true}).waitFor();await one.getByRole('button',{name:'Cancel heat edit',exact:true}).click();
    await one.screenshot({path:'/tmp/r2gd-heat-cycles.png',fullPage:true});
    await one.getByRole('button',{name:'Enable heat reminders',exact:true}).click();await one.getByRole('button',{name:'Turn off heat reminders',exact:true}).waitFor();
    await one.getByRole('button',{name:'Leave kennel',exact:true}).click();await one.getByLabel('Kennel code',{exact:true}).waitFor();
    assert.equal(fixture.records.heat_push_subscriptions.some(s=>s.enabled),false);
    assert.deepEqual(errors,[]);
    console.log('PASS (mocked transport): R2GD tabs, shared dog/date creation, forecast and history, name/date corrections, duplicate rejection, litter-data preservation, and opt-in/test/disable phone reminder flows.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
