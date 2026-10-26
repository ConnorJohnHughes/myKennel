import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createECDH,randomBytes} from 'node:crypto';
const webpush=createRequire(import.meta.url)('web-push');
test('setup generates private local files without printing keys and refuses to overwrite',()=>{
  const dir=mkdtempSync(join(tmpdir(),'r2gd-push-setup-'));
  try{
    const stdout=execFileSync(process.execPath,['scripts/setup-heat-reminders.cjs','--output-dir',dir],{cwd:resolve('.'),encoding:'utf8'});
    const env=Object.fromEntries(readFileSync(join(dir,'.heat-reminders.env'),'utf8').trim().split('\n').map(line=>line.split('=')));
    const sql=readFileSync(join(dir,'.heat-reminders-schedule.sql'),'utf8');
    assert.equal(env.VAPID_PUBLIC_KEY.length,87);assert.ok(env.HEAT_REMINDER_SECRET.length>=32);
    assert.equal(stdout.includes(env.VAPID_PRIVATE_KEY),false);assert.equal(stdout.includes(env.HEAT_REMINDER_SECRET),false);
    assert.equal(sql.includes(env.VAPID_PRIVATE_KEY),false);assert.match(sql,/vault.create_secret/);assert.match(sql,/'0 \* \* \* \*'/);
    if(process.platform!=='win32')assert.equal(statSync(join(dir,'.heat-reminders.env')).mode&0o777,0o600);
    assert.throws(()=>execFileSync(process.execPath,['scripts/setup-heat-reminders.cjs','--output-dir',dir],{stdio:'pipe'}));
    assert.equal(readFileSync(join(dir,'.heat-reminders.env'),'utf8').includes(env.VAPID_PRIVATE_KEY),true);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('web push signs and encrypts payloads with VAPID keys without making a network request',()=>{
  const vapid=webpush.generateVAPIDKeys();const device=createECDH('prime256v1');device.generateKeys();
  const request=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/example',keys:{p256dh:device.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},JSON.stringify({body:'Willow is expected today',tag:'heat-test'}),{TTL:43200,vapidDetails:{subject:'https://mykennel.pages.dev',publicKey:vapid.publicKey,privateKey:vapid.privateKey}});
  assert.equal(request.method,'POST');assert.match(request.headers.Authorization,/vapid /);assert.equal(String(request.headers.TTL),'43200');
  assert.ok(Buffer.isBuffer(request.body));assert.equal(request.body.includes(Buffer.from('Willow is expected today')),false);
});
