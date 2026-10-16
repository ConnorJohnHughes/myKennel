# myKennel

A staff nursery app built with Expo / React Native for Android, iPhone, and web. Track litters, parents, birth dates, puppy names or collar identifiers, and daily weights in ounces or pounds plus ounces. Each puppy has a chronological weight history with change from the previous recorded weigh-in.

## Run locally

Use Node 24 LTS and npm. From this checkout:

```sh
npm ci
npm start
```

This project targets **Expo SDK 57** to match Expo Go supporting SDK 57. Open with a compatible Expo Go client on Android or iPhone; `npm run web` runs the browser version. A physical phone must be able to reach the development machine. Cloud containers may not be reachable from a phone without additional networking. Native signed builds and App Store / Play Store publication are separate steps.

The app connects to the shared Supabase project by default using its public URL/key in `src/projectConfig.ts`. Each device enters the same kennel code once; no personal username/password or manual staff account setup is required. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to initialize the new project and enable anonymous device sessions.

For an explicit **local preview**, run `EXPO_PUBLIC_LOCAL_PREVIEW=true npx expo start --clear` (or set that flag in `.env.local`). Preview records persist only on this device/browser using AsyncStorage. Preview has no sharing, login, or remote backup. Existing preview records remain separate and are not automatically uploaded. Clear Expo's cache when switching modes; never use preview for real kennel data.

## Updating your local copy / Expo Go version mismatch

Stop the existing Expo server with Ctrl+C, then run these commands inside `myKennel`:

```sh
git pull --ff-only origin main
npm ci
npx expo start --clear
```

Scan the new QR code with Expo Go on the same Wi-Fi. `npm ci` installs the versions from the updated lockfile. Expo Go and the project must support the same SDK major version; updating Expo Go alone does not change the project SDK. This repository currently targets SDK 57, with matching React, React Native, and Expo packages. If the phone reports a different supported SDK, use that exact error to diagnose the mismatch rather than repeatedly reinstalling Expo Go.

For physical iOS devices, if Expo Go requests sign-in, run `npx expo login` on your computer and sign into the same Expo account in Expo Go. Native phone behavior still needs to be verified on a real device.

## Connect shared data and realtime updates

Use the [one-time Supabase setup guide](SUPABASE_SETUP.md). For a new project, run `supabase/bootstrap-shared.sql` once in Supabase's SQL editor. It creates the schema, membership rules, record versions, Realtime publication, and a random shared code. Enable Anonymous Sign-Ins, then enter that code once on each device. The public key alone cannot read or edit kennel data. Do not paste the code or any secret/service-role key into source or chat.

All admitted devices share the nursery. Saved changes appear via Realtime while the app is open. The app reconciles on subscription/reconnection, foregrounding, browser focus/network recovery, and every 20 seconds as a fallback. It shows connection status and sync errors, preserves unsaved form typing, and rejects stale same-record edits using a version check. It requires Internet to save and does not queue offline changes.

Existing projects must use the migrations described in the setup guide instead of rerunning the bootstrap. Local preview needs no database migration. Previously created memberships remain valid.

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
- Duplicate daily entries remain blocked on edits, and a birth-date correction cannot move birth after an existing weigh-in. Correct incompatible weigh-in dates before moving birth forward. Deletion is not included. Staff edits replace the current values; stale same-record saves are rejected rather than silently overwriting another device’s edit. An audit history and automatic field-by-field merging are not implemented.
- No health diagnosis, alerts, customer access, breeding pedigree, or store deployment is included.

## Validation

```sh
npm run typecheck
npm test
npm run test:db
npx expo export --platform all
```

The unit tests exercise calendar validation, birth-date bounds, weight conversion/validation, history ordering, required identifiers, edit uniqueness, record identity preservation, pounds/ounces conversion, two-decimal validation, rounding at pound boundaries, and DDMMMYY date formatting. `npm run test:db` runs the actual schema and repeatable upgrade migration over populated data in PGlite (isolated PostgreSQL WASM), checking shared-code admission, record versions and stale edits, Realtime publication, denied public/nonmember access, column restrictions, and date/weight/uniqueness constraints. It does not establish connectivity or authentication against a hosted Supabase project. Android/iOS export validates JavaScript bundles; it does not replace native builds or device testing.

An additional browser smoke check creates a litter/puppy, records weights, checks gains and duplicate rejection, verifies ounce conversion and reload persistence, corrects litter/parent/birth details, renames a puppy, edits weight dates and values, checks cancellation, both imperial input modes, automatic display, remainder validation, and legacy record precision, tests calendar navigation, cancellation, disabled dates, recent-three history, per-puppy expansion/collapse, and editing older weigh-ins, and checks a phone-sized viewport. It uses a fresh browser context and leaves no test records in your normal browser. With Playwright and Chromium available:

```sh
EXPO_PUBLIC_LOCAL_PREVIEW=true npx expo export --platform web --output-dir dist-preview --clear
python -m http.server 8082 --directory dist-preview
# In another terminal; override CHROMIUM_PATH if needed:
node scripts/smoke.cjs
```

The shared-mode browser test runs the real application and Supabase client in **three independent browser contexts against a mocked HTTP/WebSocket service**. It verifies live inserts/edits, shared-code admission, session restore, draft preservation, stale-edit rejection, and reconnect reconciliation. It does not prove hosted connectivity. With `dist` built in normal shared mode and served on port 8080:

```sh
npx expo export --platform web --clear
python -m http.server 8080 --directory dist
# In another terminal:
node scripts/shared-smoke.cjs
```

`SMOKE_URL` and `SHARED_SMOKE_URL` can override test server addresses. The transport test intercepts all project HTTP/WebSocket requests and does not use real kennel records or a real kennel code. Verify actual cross-device behavior against your project after the dashboard steps are complete.

Cloud onboarding uses the existing isolated checkout in `/workspace/myKennel`; no extra Git worktree is needed. Installation state can be retained, but Expo/server processes must be started in each new session.
