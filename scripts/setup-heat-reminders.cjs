// Run on the administrator's computer. Writes secrets locally; never prints or commits them.
const fs=require('node:fs');const path=require('node:path');const {randomBytes}=require('node:crypto');const webpush=require('web-push');
const at=process.argv.indexOf('--output-dir');const root=at>=0?path.resolve(process.argv[at+1]):path.resolve(__dirname,'..');
const env=path.join(root,'.heat-reminders.env');const sql=path.join(root,'.heat-reminders-schedule.sql');
fs.mkdirSync(root,{recursive:true});
if(fs.existsSync(env)||fs.existsSync(sql)){console.error('Setup files already exist. Reuse them; do not rotate keys for existing devices unintentionally.');process.exit(1);}
const {publicKey,privateKey}=webpush.generateVAPIDKeys();const secret=randomBytes(32).toString('base64url');
fs.writeFileSync(env,`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nHEAT_REMINDER_SECRET=${secret}\n`,{mode:0o600});
const schedule=`-- PRIVATE GENERATED SETUP. Do not commit this file or paste it in chat.
-- Run only AFTER deploying the heat-reminders function and its secrets.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
do $setup$
declare secret_id uuid; job_id bigint;
begin
  select id into secret_id from vault.secrets where name='r2gd_heat_dispatch_secret';
  if secret_id is null then
    perform vault.create_secret('${secret}','r2gd_heat_dispatch_secret');
  else
    perform vault.update_secret(secret_id,'${secret}');
  end if;
  for job_id in select jobid from cron.job where jobname='r2gd-heat-reminders' loop
    perform cron.unschedule(job_id);
  end loop;
end;
$setup$;
select cron.schedule('r2gd-heat-reminders','0 * * * *', $job$
  select net.http_post(
    url:='https://wnwdiyqlpaltndseqfxo.supabase.co/functions/v1/heat-reminders',
    headers:=jsonb_build_object('Content-Type','application/json','x-heat-reminder-secret',(select decrypted_secret from vault.decrypted_secrets where name='r2gd_heat_dispatch_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=120000
  );
$job$);
select public.set_heat_push_config('${publicKey}',true);
commit;
select jobname,schedule,active from cron.job where jobname='r2gd-heat-reminders';
`;
fs.writeFileSync(sql,schedule,{mode:0o600});
console.log('Created .heat-reminders.env and .heat-reminders-schedule.sql with private keys. They are ignored by Git.');
console.log('Follow HEAT_REMINDERS_SETUP.md to deploy the function, upload the env file securely, and run the generated schedule SQL.');
