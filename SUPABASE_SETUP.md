# Connect the shared kennel

Your app uses this Supabase project's public connection details:
`https://wnwdiyqlpaltndseqfxo.supabase.co`.
The public/publishable key is included in the app; database rules control access.
Do not use a database password or a secret/service_role key in the app.

## New project: one-time setup

1. In the Supabase dashboard, open **SQL Editor** and create a new query.
2. Copy the entire contents of [`supabase/bootstrap-shared.sql`](supabase/bootstrap-shared.sql) into it and run it **once on the new, empty project**. The last result displays a randomly generated `kennel_code`. Save that code privately and share it only with your team. The database stores its hash. Do not paste the code in chat or commit it to Git.
3. Open **Authentication → Sign In / Providers** (the exact dashboard label may vary). Enable **Anonymous Sign-Ins**. This creates an invisible device session; the three people do not need emails, passwords, profiles, or personal logins. Do not disable all new sign-ups, since a new device must be able to establish an anonymous session. No email/password signup is exposed by this app.
4. Update the app on each computer/device. Start it, enter the same kennel code once, and choose **Connect to kennel**. Each device remembers its own session. All connected devices share the same records. Clearing app/browser storage or disconnecting requires entering the code again. There is no three-device limit; one person may use both a phone and computer.
5. Confirm **Live updates connected** appears. With two devices open, create/edit a litter, puppy, or weight on one and verify it appears on the others without Refresh. Keep all three apps updated to this version for conflict protection.

The bootstrap includes the existing schema and new shared realtime migration. It preserves database access restrictions: a public key or an anonymous session alone cannot read the kennel; the shared code grants that device membership. Edits still enforce valid dates, unique daily entries, and record versions. If another person saves the same record after you open its edit form, your save is rejected and you can cancel/reopen the latest version.

## If you already ran the old schema

Do not rerun the bootstrap. Apply `supabase/migrations/20261016_allow_staff_edits.sql` if necessary, then `supabase/migrations/20261016_shared_realtime.sql`. Both migrations are repeatable and retain existing records/memberships. Generate a new random code in SQL Editor:

```sql
with generated as materialized (select gen_random_uuid()::text as code)
select code as kennel_code, public.set_kennel_access_code(code) from generated;
```

The same code-setting query rotates the code later. Rotation changes admission for new devices; it does not disconnect devices already admitted. To revoke a device, remove its row in `public.staff` through the administrator dashboard. Devices check membership while syncing. Anonymous device accounts appear in Supabase Authentication internally; no manual user administration is needed for normal use.

## Sync behavior

Saved inserts/edits use Supabase Realtime. Unsaved form typing stays on its device. Active edit fields are preserved when remote updates arrive. A version check prevents silently overwriting someone else's correction to the same record. Different records can be edited independently.

The app reloads on realtime subscription/reconnection, returning to the foreground, and browser focus/network recovery. It also reconciles every 20 seconds as a fallback. A connection indicator and errors distinguish live updates from reconnecting/stale data. It needs Internet connectivity to save; it does not queue offline writes.

Existing local-preview records are separate and are **not automatically uploaded**. Keep that device's storage intact until any real preview records have been transferred. Supabase's free tier is adequate for initial use but can pause inactive projects and has usage limits; it does not guarantee uninterrupted availability.

## Troubleshooting

- “The kennel code has not been configured”: finish the setup SQL and save the code from its final result.
- “Unable to connect. Enable anonymous sign-ins…”: check the Anonymous Sign-Ins setting and network connection.
- “That kennel code is incorrect”: use the full generated code, including hyphens.
- “The shared database needs its latest setup SQL”: apply the shared realtime migration.
- “Reconnecting live updates…”: check **Database → Publications → supabase_realtime** includes `litters`, `puppies`, `weights`, and `staff`. The setup SQL registers them. HTTPS and WSS access to the project hostname must be available.
- For this cloud workspace only, save the project hostname `wnwdiyqlpaltndseqfxo.supabase.co` in its environment network settings before remote verification. The saved draft adds this hostname; a draft save alone does not change runtime access. Your local computer's Internet access is separate.
