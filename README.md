# myKennel

A staff nursery app built with Expo / React Native for Android, iPhone, and web. Track litters, parents, birth dates, puppy names or collar identifiers, and daily weights in grams or ounces. Each puppy has a chronological weight history with change from the previous recorded weigh-in.

## Run locally

Use Node 24 LTS and npm. From this checkout:

```sh
npm ci
npm start
```

Open with a compatible Expo Go client on Android or iPhone; `npm run web` runs the browser version. A physical phone must be able to reach the development machine. Cloud containers may not be reachable from a phone without additional networking. Native signed builds and App Store / Play Store publication are separate steps.

Without Supabase configuration, the app starts in **local preview** mode. Records persist on this device/browser using AsyncStorage. There is no login, sharing, remote backup, or migration from preview into Supabase. Do not use preview for real kennel data. Setting both Supabase variables switches to cloud mode and hides the separate preview records.

## Connect shared staff data

1. Create a Supabase project you control. Its free tier can support initial development; usage limits and project pausing mean it is not a guaranteed always-on production service.
2. Run [supabase/schema.sql](supabase/schema.sql) once in a new project's SQL editor. It creates the tables, unique daily weight constraints, birth-date validation, and row-level security policies.
3. In Authentication settings, disable public user sign-up. Create staff users through the Supabase dashboard (Authentication → Users → Add user). Use the dashboard's administrator-created/confirmed user flow; no in-app sign-up or invitation callback is implemented.
4. Copy each staff user's UUID into this SQL, executed as administrator:

   ```sql
   insert into public.staff (user_id) values ('STAFF-USER-UUID');
   ```

   Only explicitly listed users may read/add records. All staff share the nursery. Clients cannot grant membership, update or delete records. To revoke a staff member's data access, delete their membership using the administrator dashboard. Use the dashboard for password recovery/account administration in this first version.
5. Copy `.env.example` to `.env.local` and set the project's URL and **publishable/public key** from Project Settings → API. Never use a `service_role` key in a client app. `EXPO_PUBLIC_` values are bundled into the application; the key is intentionally public and the database policies enforce access. Restart Expo after configuration changes. If outbound access is restricted, allow your exact project hostname (`PROJECT.supabase.co`).
6. Sign in with a staff account. Verify a litter, puppy, and weight created on one device appear after Refresh on another. Cloud mode requires connectivity; it does not queue offline writes or automatically subscribe to other staff members' changes. Use Refresh to retrieve current records.

Before using real records, verify in the connected project: signed-out requests cannot read/add records; a signed-in nonstaff account cannot read/add records; a listed staff account can read/add; duplicate daily entries and weights before birth are rejected. The schema is provided but has not been executed against a hosted Supabase project in this workspace.

## Current behavior

- A litter has a label, mother's name, father's name, and birth date. Parents are text fields in this first version.
- Puppy identifiers are unique within each litter, ignoring case.
- One positive weight per puppy per calendar day; backdated entries are supported from birth through today. Dates use `YYYY-MM-DD` and the device's local date. The server also rejects future dates according to its database clock.
- Weights are stored in grams to three decimal places and displayed in grams or ounces. Changes compare adjacent recorded weigh-ins, which may be several days apart.
- Saved records cannot be edited/deleted in this first version. An administrator must correct mistakes in Supabase. Duplicate entries are rejected rather than silently overwriting another staff member's work.
- No health diagnosis, alerts, customer access, breeding pedigree, or store deployment is included.

## Validation

```sh
npm run typecheck
npm test
npx expo export --platform all
```

The five unit tests exercise calendar validation, birth-date bounds, weight conversion/validation, history ordering, and required identifiers. Android/iOS export validates JavaScript bundles; it does not replace native builds or device testing.

An additional browser smoke check creates a litter/puppy, records weights, checks gains and duplicate rejection, verifies ounce conversion and reload persistence, and checks a phone-sized viewport. It uses a fresh browser context and leaves no test records in your normal browser. With Playwright and Chromium available:

```sh
npx expo export --platform web
python -m http.server 8080 --directory dist
# In another terminal; override CHROMIUM_PATH if needed:
node scripts/smoke.cjs
```

Cloud onboarding uses the existing isolated checkout in `/workspace/myKennel`; no extra Git worktree is needed. Installation state can be retained, but Expo/server processes must be started in each new session.
