# myKennel

A staff nursery app built with Expo / React Native for Android, iPhone, and web. Track litters, parents, birth dates, puppy names or collar identifiers, and daily weights in ounces or pounds plus ounces. Each puppy has a chronological weight history with change from the previous recorded weigh-in.

## Run locally

Use Node 24 LTS and npm. From this checkout:

```sh
npm ci
npm start
```

This project targets **Expo SDK 57** to match Expo Go supporting SDK 57. Open with a compatible Expo Go client on Android or iPhone; `npm run web` runs the browser version. A physical phone must be able to reach the development machine. Cloud containers may not be reachable from a phone without additional networking. Native signed builds and App Store / Play Store publication are separate steps.

Without Supabase configuration, the app starts in **local preview** mode. Records persist on this device/browser using AsyncStorage. There is no login, sharing, remote backup, or migration from preview into Supabase. Do not use preview for real kennel data. Setting both Supabase variables switches to cloud mode and hides the separate preview records.

## Updating your local copy / Expo Go version mismatch

Stop the existing Expo server with Ctrl+C, then run these commands inside `myKennel`:

```sh
git pull --ff-only origin main
npm ci
npx expo start --clear
```

Scan the new QR code with Expo Go on the same Wi-Fi. `npm ci` installs the versions from the updated lockfile. Expo Go and the project must support the same SDK major version; updating Expo Go alone does not change the project SDK. This repository currently targets SDK 57, with matching React, React Native, and Expo packages. If the phone reports a different supported SDK, use that exact error to diagnose the mismatch rather than repeatedly reinstalling Expo Go.

For physical iOS devices, if Expo Go requests sign-in, run `npx expo login` on your computer and sign into the same Expo account in Expo Go. Native phone behavior still needs to be verified on a real device.

## Connect shared staff data

1. Create a Supabase project you control. Its free tier can support initial development; usage limits and project pausing mean it is not a guaranteed always-on production service.
2. Run [supabase/schema.sql](supabase/schema.sql) once in a new project's SQL editor. It creates the tables, unique daily weight constraints, birth-date validation, and row-level security policies.
3. In Authentication settings, disable public user sign-up. Create staff users through the Supabase dashboard (Authentication → Users → Add user). Use the dashboard's administrator-created/confirmed user flow; no in-app sign-up or invitation callback is implemented.
4. Copy each staff user's UUID into this SQL, executed as administrator:

   ```sql
   insert into public.staff (user_id) values ('STAFF-USER-UUID');
   ```

   Only explicitly listed users may read/add/edit records. All staff share the nursery. Clients cannot grant membership, delete records, or change record IDs/relationships. To revoke a staff member's data access, delete their membership using the administrator dashboard. Use the dashboard for password recovery/account administration in this first version.
5. Copy `.env.example` to `.env.local` and set the project's URL and **publishable/public key** from Project Settings → API. Never use a `service_role` key in a client app. `EXPO_PUBLIC_` values are bundled into the application; the key is intentionally public and the database policies enforce access. Restart Expo after configuration changes. If outbound access is restricted, allow your exact project hostname (`PROJECT.supabase.co`).
6. Sign in with a staff account. Verify a litter, puppy, and weight created on one device appear after Refresh on another. Cloud mode requires connectivity; it does not queue offline writes or automatically subscribe to other staff members' changes. Use Refresh to retrieve current records.

Before using real records, verify in the connected project: signed-out requests cannot read/add records; a signed-in nonstaff account cannot read/add records; a listed staff account can read/add/edit; duplicate daily entries and weights before birth are rejected. The schema is provided but has not been executed against a hosted Supabase project in this workspace.

## Enable editing in an existing Supabase project

If you already applied the original schema, run [supabase/migrations/20261016_allow_staff_edits.sql](supabase/migrations/20261016_allow_staff_edits.sql) in your Supabase SQL editor before using cloud edits. It preserves records, grants staff updates only to editable columns, and adds birth-date consistency checks. It is safe to rerun. Do **not** rerun the full schema on an existing database. New projects only need the current `schema.sql`, which already includes these rules. Local preview needs no migration and retains its existing records.

## Current behavior

- A litter has a label, mother's name, father's name, and birth date. Parents are text fields in this first version.
- Puppy identifiers are unique within each litter, ignoring case.
- One positive weight per puppy per calendar day; backdated entries are supported from birth through today. Dates display as **DDMMMYY**, for example **15OCT26**, everywhere in the app. Birth dates and weigh-in dates use a calendar selector with month/year shortcuts and cancellation. Future dates are disabled; weigh-ins before birth are disabled. Dates remain stored as `YYYY-MM-DD` using the device's local calendar date, so existing records need no migration. The server also rejects future dates according to its database clock.
- Enter either total **ounces**, or whole **pounds + remaining ounces** (0–15.99 oz). Ounces accept up to two decimal places: for example, `1 lb 14.34 oz`.
- Recorded weights automatically display ounces below a pound, and pounds plus ounces at or above a pound: `14.34 oz`, `1 lb 0 oz`, `1 lb 2 oz` for an 18 oz entry. Display precision is up to two decimal places; trailing zeros are omitted. Changes compare adjacent recorded weigh-ins, which may be several days apart.
- Existing storage remains in grams internally for compatibility; there are no gram fields in the app and no new database migration is needed for the units change.
- Each puppy initially shows their **three most recent weigh-ins**. **View all weights** expands that puppy’s full history; **Show recent 3** collapses it. Expansion is independent for each puppy and resets when leaving the litter. Gains/losses still compare against the actual previous weigh-in, including hidden entries.
- Use **Edit litter** to correct the litter name, parents, or birth date; **Edit puppy** to rename an identifier; and **Edit** beside a weigh-in to correct its date or weight. Forms open with saved values. **Cancel** leaves the original unchanged. Puppy history stays attached after renaming.
- Weight edits open in total ounces, and switching to pounds + ounces converts the fields. Editing only the date or switching modes retains the original stored weight, including older records with more precision than the displayed hundredth of an ounce. Changing a weight field uses the entered amount.
- Duplicate daily entries remain blocked on edits, and a birth-date correction cannot move birth after an existing weigh-in. Correct incompatible weigh-in dates before moving birth forward. Deletion is not included. Staff edits replace the current values; an audit history and simultaneous-edit conflict resolution are not implemented.
- No health diagnosis, alerts, customer access, breeding pedigree, or store deployment is included.

## Validation

```sh
npm run typecheck
npm test
npm run test:db
npx expo export --platform all
```

The unit tests exercise calendar validation, birth-date bounds, weight conversion/validation, history ordering, required identifiers, edit uniqueness, record identity preservation, pounds/ounces conversion, two-decimal validation, rounding at pound boundaries, and DDMMMYY date formatting. `npm run test:db` runs the actual schema and repeatable upgrade migration over populated data in PGlite (isolated PostgreSQL WASM), checking staff edits, denied anonymous/nonstaff access, column restrictions, and date/weight/uniqueness constraints. It does not establish connectivity or authentication against a hosted Supabase project. Android/iOS export validates JavaScript bundles; it does not replace native builds or device testing.

An additional browser smoke check creates a litter/puppy, records weights, checks gains and duplicate rejection, verifies ounce conversion and reload persistence, corrects litter/parent/birth details, renames a puppy, edits weight dates and values, checks cancellation, both imperial input modes, automatic display, remainder validation, and legacy record precision, tests calendar navigation, cancellation, disabled dates, recent-three history, per-puppy expansion/collapse, and editing older weigh-ins, and checks a phone-sized viewport. It uses a fresh browser context and leaves no test records in your normal browser. With Playwright and Chromium available:

```sh
npx expo export --platform web
python -m http.server 8080 --directory dist
# In another terminal; override CHROMIUM_PATH if needed:
node scripts/smoke.cjs
```

Cloud onboarding uses the existing isolated checkout in `/workspace/myKennel`; no extra Git worktree is needed. Installation state can be retained, but Expo/server processes must be started in each new session.
