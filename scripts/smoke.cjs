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
    // Correct all litter details and ensure invalid birth-date changes are blocked.
    await page.getByRole('button',{name:'Edit litter',exact:true}).click();
    assert.equal(await page.getByLabel('Mother (dam)',{exact:true}).inputValue(),'Willow');
    await page.getByLabel('Litter name',{exact:true}).fill('Hazel’s litter');
    await page.getByLabel('Mother (dam)',{exact:true}).fill('Hazel');
    await page.getByLabel('Father (sire)',{exact:true}).fill('Ash');
    await page.getByLabel('Birth date (YYYY-MM-DD)',{exact:true}).fill('2020-01-02');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Birth date cannot be after an existing weigh-in. Correct the weigh-in first.',{exact:true}).waitFor();
    await page.getByLabel('Birth date (YYYY-MM-DD)',{exact:true}).fill('2019-12-31');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Hazel × Ash · Born 2019-12-31',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit Blue collar',exact:true}).click();
    await page.getByLabel('Puppy name or identifier',{exact:true}).fill('Do not save');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByText('Blue collar',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit Blue collar',exact:true}).click();
    await page.getByLabel('Puppy name or identifier',{exact:true}).fill('Daisy');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Daisy',{exact:true}).waitFor();
    // Even from an ounce display, editing starts with the unrounded stored grams.
    await page.getByRole('button',{name:'Edit weight for Daisy on 2020-01-02',exact:true}).click();
    assert.equal(await page.getByLabel('Weight (g)',{exact:true}).inputValue(),'320');
    await page.getByLabel('Weigh-in date (YYYY-MM-DD)',{exact:true}).fill('2020-01-01');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('This puppy already has a weight for that date.',{exact:true}).waitFor();
    await page.getByLabel('Weigh-in date (YYYY-MM-DD)',{exact:true}).fill('2020-01-03');
    await page.getByLabel('Weight (g)',{exact:true}).fill('335.125');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 2020-01-03',exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit weight for Daisy on 2020-01-03',exact:true}).click();
    assert.equal(await page.getByLabel('Weight (g)',{exact:true}).inputValue(),'335.125');
    await page.getByRole('button',{name:'Ounces (oz)',exact:true}).click();
    await page.getByRole('button',{name:'Grams (g)',exact:true}).click();
    await page.getByLabel('Weigh-in date (YYYY-MM-DD)',{exact:true}).fill('2020-01-04');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 2020-01-04',exact:true}).waitFor();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mykennel-preview-v1')));
    assert.equal(saved.litters.length,1);assert.equal(saved.puppies.length,1);assert.equal(saved.weights.length,2);
    assert.equal(saved.weights.find(w=>w.date==='2020-01-04').grams,335.125);
    await page.reload();
    await page.getByRole('button',{name:'Open Hazel’s litter',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 2020-01-04',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth),false);
    await page.screenshot({path:'/tmp/mykennel-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile viewport, litter and puppy creation, daily weights, gain, duplicate rejection, ounce conversion, reload persistence, litter/parent/birth corrections, puppy rename, weight/date corrections, cancellation, precision preservation, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
