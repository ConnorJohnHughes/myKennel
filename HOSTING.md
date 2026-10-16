# Publish the installable web app on Cloudflare Pages

The installable app is ready to build from GitHub. Cloudflare account authorization and the first deployment are done in your own dashboard; no Cloudflare token or kennel code needs to be shared in chat.

## One-time connection

1. Sign into Cloudflare and open **Workers & Pages**. Create a **Pages** project using its Git repository integration.
2. Connect GitHub and select **ConnorJohnHughes/myKennel**. Authorize access to this repository.
3. Use these build settings:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Root directory | Repository root (leave the default) |
   | Build command | `npm run build:web` |
   | Build output directory | `dist` |
   | Node version, if requested | `24.19.0` (also pinned in `.node-version`) |

4. Save and deploy. Cloudflare installs dependencies from the lockfile and builds the website. The app already includes your Supabase **public** project URL/publishable key. No environment variables or database changes are required for this release. Do not add the private kennel code or a Supabase secret/service-role key to public client configuration.
5. Open the assigned **HTTPS `pages.dev` address** and test the app. Use that production address for everyone. A custom domain can be added later.

This repository does not hard-code a Cloudflare project name or invent a hosting address. The dashboard supplies the actual URL after deployment. Keep the free plan for the initial small team; hosting/database limits still apply.

## Install on phones

- **iPhone/iPad:** open the production link in Safari → Share → **Add to Home Screen** → Add.
- **Android:** open it in Chrome and use the app’s **Install app** button when a browser prompt is available. Chrome’s menu also offers **Install app** or **Add to Home screen**.

The icon is named **myKennel**, and the installed app opens in its own window. Browser/OS installation wording can vary. On the new hosted address, each device enters the same existing kennel code once. Your Supabase records are shared with the Expo/native/local web versions; they do not need to be re-entered. Browser sessions are separate for each website address, so installing on a new host can require entering the code again.

## Future updates

Push a change to `main` and Cloudflare automatically builds/deploys it. The build creates a new release ID and service worker. An open app checks on startup, returning to the foreground, and once a minute while visible. When a release is ready, **Update app** loads it after the user chooses to do so. The button is disabled while that tab has an open edit form or an in-progress action.

If another person/tab activates an update, other running tabs keep their current interface and drafts. Each can update after finishing. Previous cached bundles are retained while an old tab still needs them. Once all open tabs report the current release, old app caches are removed. Saved kennel data stays in Supabase throughout. The app shell can open without a network connection, but viewing current records and saving changes still require Internet. Supabase/authentication responses are never stored in the service-worker cache.

## Verify the published site

1. Check the root page loads and `manifest.webmanifest`, `sw.js`, and `version.json` return successfully on the production URL.
2. Install from Safari/Chrome, enter the shared code, and confirm **Live updates connected**.
3. Open two devices and verify a saved change appears on the other.
4. After the next deployment, check the update prompt; keep a draft open on another device/tab and confirm it is not discarded.

The `public/_headers` file configures Cloudflare to revalidate HTML/installation metadata and avoid caching the worker/version file in the browser HTTP cache. Content-addressed Expo JavaScript is immutable. Deploy the **entire `dist` directory** using the documented build command. Plain `expo export` is useful for development bundles but does not generate all installation/update files.

## Local validation

```sh
npm ci
npm run typecheck
npm test
npm run build:web
node scripts/pwa-smoke.cjs
```

The PWA check starts its own internal test server. It exercises a real browser service worker across two simulated releases, offline shell loading, explicit per-tab updates, draft protection, manifest/icon metadata, and exclusion of Supabase responses from its cache. Backend requests use a mocked transport with test data. It does not prove Cloudflare deployment or physical iPhone/Android installation; those require the production URL/device checks above.
