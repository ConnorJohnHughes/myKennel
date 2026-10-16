// Run against `python -m http.server 8080 --directory dist` after an Expo web export.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function displayDate(date) {return `${date.slice(8,10)}${months[Number(date.slice(5,7))-1]}${date.slice(2,4)}`;}
async function pickDate(page,label,date) {
  await page.getByRole('button',{name:new RegExp(`^${label}: `)}).click();
  await page.getByRole('button',{name:'Choose year',exact:true}).click();
  const year=page.getByRole('button',{name:`Year ${Number(date.slice(0,4))}`,exact:true});
  for(let i=0;!(await year.count());i++) {
    if(i>=20) throw new Error('Target year not reachable');
    await page.getByRole('button',{name:'Previous years',exact:true}).click();
  }
  await year.click();
  await page.getByRole('button',{name:`Month ${months[Number(date.slice(5,7))-1]}`,exact:true}).click();
  await page.getByRole('button',{name:`Select ${displayDate(date)}`,exact:true}).click();
}
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:8082');
    await page.getByRole('button',{name:'+ Add litter',exact:true}).click();
    await page.getByLabel('Litter name',{exact:true}).fill('Willow’s litter');
    await page.getByLabel('Mother (dam)',{exact:true}).fill('Willow');
    await page.getByLabel('Father (sire)',{exact:true}).fill('Oak');
    await pickDate(page,'Birth date','2020-01-01');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('button',{name:'Open Willow’s litter',exact:true}).click();
    await page.getByRole('button',{name:'+ Add puppy',exact:true}).click();
    await page.getByLabel('Puppy name or identifier',{exact:true}).fill('Blue collar');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    for(const [date,weight] of [['2020-01-01','12'],['2020-01-02','18']]) {
      await page.getByRole('button',{name:'+ Weight',exact:true}).click();
      await pickDate(page,'Weigh-in date',date);
      await page.getByLabel('Weight (oz)',{exact:true}).fill(weight);
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByText('Saved.',{exact:true}).waitFor();
    }
    await page.getByText('+6 oz',{exact:true}).waitFor();
    await page.getByRole('button',{name:'+ Weight',exact:true}).click();
    await pickDate(page,'Weigh-in date','2020-01-02');
    await page.getByLabel('Weight (oz)',{exact:true}).fill('20');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('This puppy already has a weight for that date.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.reload();
    await page.getByRole('button',{name:'Open Willow’s litter',exact:true}).click();
    await page.getByText('Blue collar',{exact:true}).waitFor();
    await page.getByText('+6 oz',{exact:true}).waitFor();
    await page.getByText('1 lb 2 oz',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Grams (g)',exact:true}).count(),0);
    // Correct all litter details and ensure invalid birth-date changes are blocked.
    await page.getByRole('button',{name:'Edit litter',exact:true}).click();
    assert.equal(await page.getByLabel('Mother (dam)',{exact:true}).inputValue(),'Willow');
    await page.getByRole('button',{name:'Birth date: 01JAN20',exact:true}).click();
    await page.getByRole('button',{name:'Next month',exact:true}).click();
    await page.getByRole('button',{name:'Cancel date selection',exact:true}).click();
    await page.getByRole('button',{name:'Birth date: 01JAN20',exact:true}).waitFor();
    await page.getByLabel('Litter name',{exact:true}).fill('Hazel’s litter');
    await page.getByLabel('Mother (dam)',{exact:true}).fill('Hazel');
    await page.getByLabel('Father (sire)',{exact:true}).fill('Ash');
    await pickDate(page,'Birth date','2020-01-02');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Birth date cannot be after an existing weigh-in. Correct the weigh-in first.',{exact:true}).waitFor();
    await pickDate(page,'Birth date','2019-12-31');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Hazel × Ash · Born 31DEC19',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit Blue collar',exact:true}).click();
    await page.getByLabel('Puppy name or identifier',{exact:true}).fill('Do not save');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByText('Blue collar',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit Blue collar',exact:true}).click();
    await page.getByLabel('Puppy name or identifier',{exact:true}).fill('Daisy');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Daisy',{exact:true}).waitFor();
    // Edit an 18 oz entry as pounds plus ounces, then verify date-only edits preserve it.
    await page.getByRole('button',{name:'Edit weight for Daisy on 02JAN20',exact:true}).click();
    assert.equal(await page.getByLabel('Weight (oz)',{exact:true}).inputValue(),'18.00');
    await pickDate(page,'Weigh-in date','2020-01-01');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('This puppy already has a weight for that date.',{exact:true}).waitFor();
    await pickDate(page,'Weigh-in date','2020-01-03');
    await page.getByRole('button',{name:'Pounds + ounces',exact:true}).click();
    assert.equal(await page.getByLabel('Pounds (lb)',{exact:true}).inputValue(),'1');
    assert.equal(await page.getByLabel('Remaining ounces (oz)',{exact:true}).inputValue(),'2.00');
    await page.getByLabel('Remaining ounces (oz)',{exact:true}).fill('16');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Remaining ounces must be less than 16. Add another pound or use ounces only.',{exact:true}).waitFor();
    await page.getByLabel('Remaining ounces (oz)',{exact:true}).fill('14.34');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 03JAN20',exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit weight for Daisy on 03JAN20',exact:true}).click();
    assert.equal(await page.getByLabel('Weight (oz)',{exact:true}).inputValue(),'30.34');
    await page.getByRole('button',{name:'Pounds + ounces',exact:true}).click();
    assert.equal(await page.getByLabel('Remaining ounces (oz)',{exact:true}).inputValue(),'14.34');
    await page.getByRole('button',{name:'Ounces (oz)',exact:true}).click();
    assert.equal(await page.getByLabel('Weight (oz)',{exact:true}).inputValue(),'30.34');
    await pickDate(page,'Weigh-in date','2020-01-04');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 04JAN20',exact:true}).waitFor();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mykennel-preview-v1')));
    assert.equal(saved.litters.length,1);assert.equal(saved.puppies.length,1);assert.equal(saved.weights.length,2);
    assert.equal(saved.weights.find(w=>w.date==='2020-01-04').grams,Math.round(30.34*28.349523125*1000)/1000);
    await page.reload();
    await page.getByRole('button',{name:'Open Hazel’s litter',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 04JAN20',exact:true}).waitFor();
    await page.getByText('1 lb 14.34 oz',{exact:true}).waitFor();
    // Seed an older gram-based record and confirm a date-only edit retains its exact value.
    await page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('mykennel-preview-v1'));data.weights.find(w=>w.date==='2020-01-04').grams=335.125;localStorage.setItem('mykennel-preview-v1',JSON.stringify(data));});
    await page.reload();
    await page.getByRole('button',{name:'Open Hazel’s litter',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 04JAN20',exact:true}).click();
    assert.equal(await page.getByLabel('Weight (oz)',{exact:true}).inputValue(),'11.82');
    await page.getByRole('button',{name:'Pounds + ounces',exact:true}).click();
    await pickDate(page,'Weigh-in date','2020-01-05');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 05JAN20',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mykennel-preview-v1')).weights.find(w=>w.date==='2020-01-05').grams),335.125);
    await page.getByRole('button',{name:'+ Weight',exact:true}).click();
    await pickDate(page,'Weigh-in date','2020-01-06');
    await page.getByRole('button',{name:'Weigh-in date: 06JAN20',exact:true}).click();
    await page.getByRole('button',{name:'Previous month',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Select 30DEC19',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Cancel date selection',exact:true}).click();
    await page.getByRole('button',{name:'Pounds + ounces',exact:true}).click();
    await page.getByLabel('Pounds (lb)',{exact:true}).fill('1');
    await page.getByLabel('Remaining ounces (oz)',{exact:true}).fill('14.34');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 06JAN20',exact:true}).waitFor();
    await page.getByText('1 lb 14.34 oz',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mykennel-preview-v1')).weights.length),3);
    assert.equal(await page.getByRole('button',{name:'View all weights for Daisy',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth),false);
    await page.screenshot({path:'/tmp/mykennel-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'Edit litter',exact:true}).click();
    await pickDate(page,'Birth date','2024-02-29');
    await page.getByRole('button',{name:'Birth date: 29FEB24',exact:true}).waitFor();
    await page.getByRole('button',{name:'Birth date: 29FEB24',exact:true}).click();
    await page.waitForTimeout(350); // Let the calendar modal's fade finish before visual capture.
    await page.screenshot({path:'/tmp/mykennel-calendar.png'});
    await page.getByRole('button',{name:'Cancel date selection',exact:true}).click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByText('Hazel × Ash · Born 31DEC19',{exact:true}).waitFor();
    // The default selector cannot advance beyond this month; it also scrolls in landscape.
    await page.getByRole('button',{name:'← All litters',exact:true}).click();
    await page.getByRole('button',{name:'+ Add litter',exact:true}).click();
    await page.getByRole('button',{name:/^Birth date: /}).click();
    assert.equal(await page.getByRole('button',{name:'Next month',exact:true}).isDisabled(),true);
    await page.setViewportSize({width:844,height:390});
    await page.getByRole('button',{name:'Cancel date selection',exact:true}).click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();

    // Long histories collapse independently and older records remain editable.
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      const data=JSON.parse(localStorage.getItem('mykennel-preview-v1'));
      const daisy=data.puppies[0];
      for (const [day,oz] of [[2,14],[3,16],[4,18]]) data.weights.push({id:`extra-${day}`,puppyId:daisy.id,date:`2020-01-0${day}`,grams:Math.round(oz*28.349523125*1000)/1000});
      data.puppies.push({id:'sibling',litterId:daisy.litterId,name:'Bramble'});
      for(let day=1;day<=4;day++) data.weights.push({id:`sibling-${day}`,puppyId:'sibling',date:`2020-01-0${day}`,grams:Math.round((day+9)*28.349523125*1000)/1000});
      localStorage.setItem('mykennel-preview-v1',JSON.stringify(data));
    });
    await page.reload();
    await page.getByRole('button',{name:'Open Hazel’s litter',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 06JAN20',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Daisy on/}).count(),3);
    assert.equal(await page.getByRole('button',{name:'Edit weight for Daisy on 01JAN20',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Bramble on/}).count(),3);
    await page.getByRole('button',{name:'View all weights for Daisy',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Daisy on/}).count(),6);
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Bramble on/}).count(),3);
    assert.equal(await page.getByRole('button',{name:'Show recent 3 weights for Daisy',exact:true}).getAttribute('aria-expanded'),'true');
    await page.getByRole('button',{name:'Edit weight for Daisy on 02JAN20',exact:true}).click();
    await pickDate(page,'Weigh-in date','2020-01-07');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Edit weight for Daisy on 07JAN20',exact:true}).waitFor();
    await page.getByRole('button',{name:'Show recent 3 weights for Daisy',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Daisy on/}).count(),3);
    assert.equal(await page.getByRole('button',{name:'Edit weight for Daisy on 07JAN20',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Edit weight for Daisy on 04JAN20',exact:true}).count(),0);
    await page.getByText('-6.18 oz',{exact:true}).waitFor(); // Third row still compares with the hidden fourth.
    await page.getByRole('button',{name:'View all weights for Bramble',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Bramble on/}).count(),4);
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Daisy on/}).count(),3);
    await page.getByRole('button',{name:'← All litters',exact:true}).click();
    await page.getByRole('button',{name:'Open Hazel’s litter',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Edit weight for Bramble on/}).count(),3);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mykennel-preview-v1')).weights.length),10);
    await page.screenshot({path:'/tmp/mykennel-recent-weights.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile viewport, litter and puppy creation, daily weights, gain, duplicate rejection, automatic pounds/ounces display, both input modes, remainder validation, reload persistence, litter/parent/birth corrections, puppy rename, weight/date corrections, cancellation, precision preservation, calendar navigation and cancellation, disabled out-of-range dates, DDMMMYY display, recent-three history, independent expansion/collapse, hidden-row gains, older-entry corrections, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
