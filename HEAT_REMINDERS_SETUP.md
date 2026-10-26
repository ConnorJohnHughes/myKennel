# R2GD heat tracking and phone reminders

This release adds new tables and functions. It does **not** reset the shared kennel, change its access code, or delete litter/puppy/weight records. Back up/export existing records before applying a production database change. Do not rerun `bootstrap-shared.sql` or the original schema on your live project.

## 1. Enable heat tracking

In your existing Supabase project's SQL Editor, run:

[`supabase/migrations/20261026_heat_cycles.sql`](supabase/migrations/20261026_heat_cycles.sql)

“Success. No rows returned” is expected. The migration is repeatable. It adds heat dogs/dates, access policies matching your existing kennel membership, version protection for edits, and Realtime subscriptions. The Litters tab continues working even if this migration has not yet been applied; the Heat cycles tab reports that its database update is needed.

The app uses six **calendar months** after the most recent detected heat as an estimate. Dates display as `15OCT26`; month ends clamp to a valid date (31AUG26 → 28FEB27). Recording a newer heat replaces the old forecast, while all detected dates remain in history. Backdated entries do not supersede a newer detection. Names and incorrect heat dates can be corrected.

## 2. One-time private reminder service setup

A web app cannot reliably schedule closed-app notifications using a browser timer. The Supabase Edge Function and hourly database job below send Web Push reminders even when the app is closed. Each person enables notifications separately on their device.

These administrator commands run once from your own project checkout. Regular use and future app updates do not require your computer to stay on.

```sh
git pull --ff-only origin main
npm ci
npm run setup:heat-reminders
```

The generator creates two **private, Git-ignored files**, with restricted file permissions:

- `.heat-reminders.env`: the VAPID signing keys and a separate scheduler secret.
- `.heat-reminders-schedule.sql`: your private Vault/cron configuration.

The generator does not print key values and refuses to overwrite existing files. Keep the files private; do not paste them into chat or commit them. Retain a secure copy for future deployments. Reuse the same VAPID keys so existing phone subscriptions keep working.

Authorize the Supabase CLI using your account, upload the generated secrets, and deploy the function:

```sh
npx supabase login
npx supabase secrets set --env-file .heat-reminders.env --project-ref wnwdiyqlpaltndseqfxo
npx supabase functions deploy heat-reminders --project-ref wnwdiyqlpaltndseqfxo --no-verify-jwt
```

`--no-verify-jwt` disables the gateway's legacy JWT check for this one function. The function itself verifies either the scheduler's private header or a real authenticated kennel member requesting a test to their **own device**. It does not allow public sends. Do not disable authentication checks in the function code. Supabase supplies the service-role key inside the function automatically; never copy that key into the app or chat.

After deployment, open **`.heat-reminders-schedule.sql` on your computer**, copy its SQL into Supabase SQL Editor, and run it. It enables Supabase's `pg_cron`, `pg_net`, and Vault extensions if needed; stores the cron secret in Vault; creates/replaces only the `r2gd-heat-reminders` job; and marks reminder setup ready with your public VAPID key. The final query should show that job with schedule `0 * * * *` and `active = true`. The exact same generated SQL can be rerun without creating duplicate jobs.

Web app changes still deploy automatically through Cloudflare. Changes to the reminder function itself require rerunning the function deploy command; a GitHub push alone does not deploy Supabase Edge Functions. Reuse the existing private env file and keys for those deployments.

Do not mark setup ready before deploying the function and its secrets. Until then the app says that phone reminders need one-time server setup; it does not claim notifications are active.

## 3. Enable each phone and send a test

1. Update the installed app at `https://mykennel.pages.dev/` and open **Heat cycles**.
2. On iPhone/iPad, use the home-screen installed app on iOS/iPadOS 16.4 or newer. Android Chrome supports Web Push. This web notification setup does not send through Expo Go.
3. Tap **Enable heat reminders** and allow notifications. The device's current IANA timezone is saved with its subscription.
4. Tap **Send test heat reminder** and confirm it appears in that phone's notifications. Repeat on each person's phone. Your phone's Focus/Do Not Disturb and notification settings can affect display.
5. Tap a reminder to open the Heat cycles tab. An existing unsaved form is preserved; navigation waits until it is finished/canceled.

The app can turn reminders off for its own device. **Leave kennel** also disables this device’s reminders before disconnecting it. To change that device's saved timezone, turn reminders off and enable them again after changing timezone. Device subscriptions are private to that connected device session, while heat records are shared with the kennel.

## Timing and reliability

For the estimated next date, reminders are due on the **first day of that month**, **seven days before**, and **on the date**. The hourly job sends at its first run at/after 9 am in the saved device timezone; delivery timing is best effort. If stages coincide, one combined reminder is sent that day. New detections and date corrections change the forecast; delivery claims reject superseded cycles or stale versions.

A delivery lease prevents overlapping jobs sending the same cycle/day/device repeatedly. Successful sends are recorded; transient failures are released for retry at the next hourly run. Expired subscriptions (404/410) are disabled. Notification tags make duplicate provider delivery replace the previous notification rather than intentionally sounding again. If the service is down for a whole reminder date, it does not flood phones with old reminders later. Supabase free-plan pauses and provider/device outages can delay or prevent notifications; this is a reminder tool, not a guarantee of when a dog will enter heat.

For a manual scheduler check after setup, run the same `net.http_post(...)` statement from the generated SQL in SQL Editor. Check **Edge Functions → heat-reminders → Logs** and database cron run history. The function reports counts only and does not log private subscription keys or scheduler secrets. Do not send those private files or key values when asking for help; share only the error message.

## Validation in this repository

- `npm test`: month arithmetic, leap years, first-of-month/week/day timing, timezones/DST, latest-cycle behavior, retries, deduplication, setup-file privacy, and Web Push request signing/encryption.
- `npm run test:db`: repeatable migration on existing litter/weight data, member/outsider access, atomic dog creation, date uniqueness, edit versions, private push records, delivery leases/retries, and cancellation after a newer detection.
- `node scripts/heat-smoke.cjs` against a built app served on port 8080: two-browser shared records, calendar input, history/corrections, existing litter data, and opt-in/test/disable reminder flows with mocked delivery.
- `node scripts/pwa-smoke.cjs`: real service-worker installation/update protection plus injected browser push-display handling and notification navigation. It uses test data, not your production subscription.

Hosted cron/function deployment and real phone delivery must be verified by the administrator using the test button. Local fixtures, encrypted request generation, and bundle checks do not establish that the live reminder service has been deployed.
