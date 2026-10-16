// Executes the real SQL in an isolated PostgreSQL WASM instance; no hosted credentials needed.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
  const db=new PGlite();
  const staff='00000000-0000-0000-0000-000000000001';
  const outsider='00000000-0000-0000-0000-000000000002';
  const litter='10000000-0000-0000-0000-000000000001';
  const puppy='20000000-0000-0000-0000-000000000001';
  const weight='30000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    await db.exec(readFileSync('supabase/schema.sql','utf8'));
    // Simulate the original schema, then upgrade a populated database.
    await db.exec(`drop policy "Staff edit litters" on public.litters;
      drop policy "Staff edit puppies" on public.puppies;
      drop policy "Staff edit weights" on public.weights;
      drop trigger check_litter_birth_edit on public.litters;
      revoke update(name,mother,father,born) on public.litters from authenticated;
      revoke update(name) on public.puppies from authenticated;
      revoke update(date,grams) on public.weights from authenticated;
      insert into auth.users values ('${staff}'),('${outsider}');
      insert into public.staff values ('${staff}');
      insert into public.litters(id,name,mother,father,born) values ('${litter}','Spring','Willow','Oak','2020-01-01');
      insert into public.puppies(id,litter_id,name) values ('${puppy}','${litter}','Blue');
      insert into public.weights(id,puppy_id,date,grams) values ('${weight}','${puppy}','2020-01-01',300.123);`);
    const migration=readFileSync('supabase/migrations/20261016_allow_staff_edits.sql','utf8');
    await db.exec(migration);await db.exec(migration); // Idempotence and existing data preservation.
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${staff}';`);
    await db.exec(`update public.litters set name='Winter',mother='Hazel',father='Ash',born='2019-12-31' where id='${litter}';
      update public.puppies set name='Daisy' where id='${puppy}';
      update public.weights set date='2020-01-02',grams=335.125 where id='${weight}';`);
    const result=await db.query(`select p.name, w.grams, w.date::text from public.puppies p join public.weights w on w.puppy_id=p.id`);
    assert.equal(result.rows[0].name,'Daisy');assert.equal(Number(result.rows[0].grams),335.125);assert.equal(result.rows[0].date,'2020-01-02');
    await assert.rejects(db.exec(`update public.litters set born='2020-01-03' where id='${litter}'`),/existing weigh-in/);
    await assert.rejects(db.exec(`update public.weights set date='2019-12-30' where id='${weight}'`),/before/);
    await db.exec(`insert into public.weights(puppy_id,date,grams) values ('${puppy}','2020-01-03',340)`);
    await assert.rejects(db.exec(`update public.weights set date='2020-01-03' where id='${weight}'`),/unique constraint/);
    await assert.rejects(db.exec(`insert into public.puppies(litter_id,name) values ('${litter}','DAISY')`),/unique constraint/);
    await assert.rejects(db.exec(`update public.weights set grams=0 where id='${weight}'`),/check constraint/);
    await assert.rejects(db.exec(`update public.puppies set litter_id='${litter}' where id='${puppy}'`),/permission denied/);
    await assert.rejects(db.exec(`insert into public.staff values ('${outsider}')`),/permission denied/);
    await assert.rejects(db.exec(`delete from public.weights where id='${weight}'`),/permission denied/);
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal((await db.query('select * from public.weights')).rows.length,0);
    assert.equal((await db.query(`update public.weights set grams=999 where id='${weight}' returning id`)).rows.length,0);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.exec('select * from public.weights'),/permission denied/);
    await assert.rejects(db.exec(`update public.weights set grams=999 where id='${weight}'`),/permission denied/);
    console.log('PASS: SQL schema, repeatable migration over existing data, staff edits, date/duplicate/weight constraints, column restrictions, and anonymous/nonstaff access.');
  } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
