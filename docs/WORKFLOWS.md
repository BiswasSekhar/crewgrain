# GitHub Actions setup

Fork or clone into your own repository. CI works without secrets. Deploying a
backend, signing an APK, sending push and backups require your own accounts and
credentials. Repository publication does not configure those external services.

Create `staging` and `production` GitHub environments. Restrict deployment branches
and configure reviewers where your GitHub plan supports them. Keep unrelated
deployments' secrets separate. Do not run untrusted PR code in a secret-bearing
environment or change CI to `pull_request_target` with an untrusted checkout.

| Workflow | Trigger | Setup and behavior |
| --- | --- | --- |
| `ci.yml` | Push / PR | npm ci, lint, typecheck, tests, both Deno function checks, Expo compatibility, web and Android JS exports; web artifact |
| `backend.yml` | Manual, selected environment | Ordered database push and both Edge Functions; requires Supabase variables/secrets below |
| `release-apk.yml` | Version tag or manual | Checks then signed Android APK build/verification and GitHub Release; production environment |
| `backup.yml` | Nightly 02:00 IST / manual | Runs only with `ENABLE_BACKUPS=true`; encrypted dump, restore check and private R2 upload |
| `service-control.yml` | Manual | Runs only with `ENABLE_SERVICE_CONTROL=true`; operator warning/pause/resume, production environment |

Third-party Actions are pinned to commit SHAs. Dependabot proposes Action updates;
review them. npm versions are locked; Expo packages need SDK-aware upgrades.
The CLI version used in backend examples/workflow is 3.1.0. Check provider release
notes before upgrading it.

## Variables and secrets

| Integration | Public/config variables | Secrets |
| --- | --- | --- |
| Backend deploy environment | `SUPABASE_PROJECT_REF` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` |
| App APK release | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_WEB_ORIGIN`, optional `EXPO_PUBLIC_SENTRY_DSN` | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Optional Firebase | None | `GOOGLE_SERVICES_JSON_BASE64`, matching the package ID in the workflow |
| Alternate APK repository | `RELEASE_REPO` | `RELEASE_TOKEN` if writing to another repository |
| Backups | Repository `ENABLE_BACKUPS=true` | `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| Service control | Repository `ENABLE_SERVICE_CONTROL=true` | `SUPABASE_DB_URL` |

Opt-in flags are repository variables because job conditions are evaluated before
environment secrets are loaded. Other configuration can live in the target GitHub
environment. A database-owner connection string is sensitive, not a public URL.
Never print or upload it in a build artifact.

Edge Function secrets such as `ALLOWED_ORIGINS`, `SCHEDULED_PUSH_SECRET` and optional
`EXPO_ACCESS_TOKEN` belong in Supabase. The backend workflow deploys code/schema;
it deliberately does not invent or rotate these values. Configure them first
using the setup/operations guides. Do not put server keys in Expo public values.

For APK releases create your signing key securely, base64-encode it locally,
store it in the signing secret, and retain an offline backup. Workflow permissions
allow writing releases only in the release job. No key is shipped in this repo.

## First deployment sequence

1. Let CI pass on your repository without secrets.
2. Configure a staging Supabase project and its GitHub environment.
3. Run backend deploy on a reviewed ref; provision admin and configure origins.
4. Smoke-test hosted Auth, worker counts, approval and corrections.
5. Set up production only after a pilot and a tested restore.
6. Configure production signing/public app values and dispatch a release or push
   a matching version tag. Verify the release's certificate/checksum.
7. Opt into backups; run a manual job and verify a restore before trusting it.

The current backend is single-business. Backend deployment automation does not
turn it into a multi-tenant service. Production schema changes need a backup,
reviewed compatibility plan and controlled rollout. Never store customer dump
files as public GitHub artifacts.

Reference: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).
