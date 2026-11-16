# Setup

The current app is one business per backend. The shared service described in the
platform plan needs further implementation. Use a new test project first.

## 1. Run the client

Install Node 24+ and Git. Clone the repository, run `npm ci`, then `npm run web`.
The development demo works without backend settings. `npm start` also opens the
Expo development server. Native modules and release behavior require a compatible
development/standalone build; browser/Expo Go tests do not prove phone behavior.

## 2. Choose a backend

For local development, install Docker and use the pinned CLI:

```sh
npx --yes supabase@3.1.0 start
npx --yes supabase@3.1.0 db reset
npx --yes supabase@3.1.0 functions serve
```

`db reset` destroys and recreates the LOCAL database. Never use a remote/reset
option against real records. Copy local URL/key values from CLI status into your
ignored `.env.local`. Serve Edge Functions in a second terminal.

For hosted Supabase, create your own staging project, disable public signups,
then run:

```sh
npx --yes supabase@3.1.0 login
npx --yes supabase@3.1.0 link --project-ref YOUR_STAGING_PROJECT_REF
npx --yes supabase@3.1.0 db push --remote --dry-run
npx --yes supabase@3.1.0 db push --remote
npx --yes supabase@3.1.0 secrets set ALLOWED_ORIGINS=https://YOUR_WEB_HOST
npx --yes supabase@3.1.0 functions deploy device-access
npx --yes supabase@3.1.0 functions deploy send-push
```

Check the project reference before applying changes. Apply the complete ordered
chain of 22 migrations. Both functions have JWT platform verification disabled in
`supabase/config.toml` because they implement their own admin/device/cron
authentication. Do not remove those internal checks. Supabase supplies the
function's service credentials; never send them to the client.

For local web testing set exact localhost origins as well. Use the real web
origin in production. Origin checks do not replace authentication.

## 3. Configure the client

Copy `.env.example` to `.env.local` and fill only your values:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
EXPO_PUBLIC_WEB_ORIGIN=https://YOUR_WEB_HOST
```

Use the public/anon client key supported by your project, never a secret or
service-role key. Restart Metro after changing public values. These values are
bundled at build/update time; changing GitHub variables does not change an
already-built app. Leave demo opt-in unset for a real build.

Set Supabase Auth's Site URL to your web origin and add your chosen native
`crewgrain://**` redirect. Configure email delivery, password reset and provider
settings for your deployment; the initial UI does not implement a full self-service
account-registration flow.

## 4. Create the first admin

Create an ignored `.env.admin.local` with server/operator values:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY
CREWGRAIN_ADMIN_EMAIL=YOUR_ADMIN_EMAIL
CREWGRAIN_ADMIN_EMPLOYEE_ID=ADMIN-001
CREWGRAIN_ADMIN_NAME=YOUR_ADMIN_NAME
CREWGRAIN_ADMIN_PASSWORD=YOUR_LONG_UNIQUE_PASSWORD
CREWGRAIN_FIRST_UNIT_NAME=YOUR_FIRST_LINE
```

Then run `node --env-file=.env.admin.local scripts/bootstrap-admin.mjs` from a
trusted operator machine. Use at least 12 password characters. The script refuses
to replace an existing admin and removes its new Auth account if provisioning
fails. Use `scripts/add-admin.mjs` for additional admins; inspect its required env
names first. Delete local provisioning files when no longer needed and keep real
credentials in your password manager. Do not set server keys as `EXPO_PUBLIC_*`.

## 5. Set up work

Sign in with admin email/password. Create lines, choose captains, add employees,
create styles/operations and set rates. Assign daily styles and operations. Staff
enter their existing ID/phone. This ID-only login is a documented security
limitation, not proof of identity. Do not expose it as a shared multi-owner service.

## 6. Verify before real use

Run lint, typecheck, tests, Expo compatibility and web/Android bundle exports.
Then exercise hosted Auth and HTTP, a worker count, duplicate retry, captain
approval, approved-count correction, line restrictions, logout, revocation,
airplane mode, force-close and recovery. Reconcile counts and earnings manually.
Verify signed APK installation/upgrade on a real device and restore a backup.

`npm run setup:check` checks files and public values; it is not a hosted health
check. Embedded Postgres tests do not simulate the complete Supabase platform.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| "Not connected" | Public URL/key at build time; demo is deliberately disabled in ordinary releases |
| Login fails | Correct project, all migrations, deployed gateway, active staff, unique ID/phone and origin |
| Counts need attention | Assignment/date validity, revoked access and server message; preserve unsent work before repair |
| Push missing | Own EAS project, Firebase/FCM, token permission, function deployment and cron secret |
| Public config changed but APK unchanged | Rebuild or publish a compatible update with the same env values |

Provider references: [local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
[environments](https://supabase.com/docs/guides/deployment/managing-environments),
[function deployment](https://supabase.com/docs/guides/functions/deploy).
