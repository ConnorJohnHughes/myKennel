// Run against `python -m http.server 8080 --directory dist` after an Expo web export.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8080');
    await page.getByRole('button',{name:'+ Add litter',exact:true}).click();
    await page.getByLabel('Litter name',{exact:true}).fill('Willow’s litter');
    await page.getByLabel('Mother (dam)',{exact:true}).fill('Willow');
    await page.getByLabel('Father (sire)',{exact:true}).fill('Oak');
    await page.getByLabel('Birth date (YYYY-MM-DD)',{exact:true}).fill('2020-01-01');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('button',{name:'Open Willow’s litter',exact:true}).click();
    await page.getByRole('button',{name:'+ Add puppy',exact:true}).click();
    await page.getByLabel('Puppy name or identifier',{exact:true}).fill('Blue collar');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    for(const [date,weight] of [['2020-01-01','300'],['2020-01-02','320']]) {
      await page.getByRole('button',{name:'+ Weight',exact:true}).click();
      await page.getByLabel('Weigh-in date (YYYY-MM-DD)',{exact:true}).fill(date);
      await page.getByLabel('Weight (g)',{exact:true}).fill(weight);
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByText('Saved.',{exact:true}).waitFor();
    }
    await page.getByText('+20 g',{exact:true}).waitFor();
    await page.getByRole('button',{name:'+ Weight',exact:true}).click();
    await page.getByLabel('Weigh-in date (YYYY-MM-DD)',{exact:true}).fill('2020-01-02');
    await page.getByLabel('Weight (g)',{exact:true}).fill('330');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('This puppy already has a weight for that date.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.reload();
    await page.getByRole('button',{name:'Open Willow’s litter',exact:true}).click();
    await page.getByText('Blue collar',{exact:true}).waitFor();
    await page.getByText('+20 g',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Show ounces',exact:true}).click();
    await page.getByText('+0.71 oz',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth),false);
    await page.screenshot({path:'/tmp/mykennel-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile viewport, litter and puppy creation, daily weights, gain, duplicate rejection, ounce conversion, reload persistence, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
