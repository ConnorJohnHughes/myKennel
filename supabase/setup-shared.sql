-- Run AFTER schema.sql and migrations/20261016_shared_realtime.sql.
-- Generate a random code on your computer, for example:
-- node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
-- Replace the placeholder below in the SQL editor. Share the code privately with your team.
-- Do not save the real code in Git, an EXPO_PUBLIC_ variable, or chat.
select public.set_kennel_access_code('REPLACE-WITH-YOUR-RANDOM-KENNEL-CODE');
