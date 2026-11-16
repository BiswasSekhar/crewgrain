# Operator guide

## Backups and recovery

Enable backups only after setting your private R2 bucket and the workflow secrets
in WORKFLOWS.md. Retain the encryption passphrase separately from the database and
configure bucket access/lifecycle for your retention needs. The nightly workflow
dumps `public` and `auth`, compresses/encrypts, restores into temporary PostgreSQL,
checks selected tables/counts and uploads only a checked file. It does not back up
Edge Function source/secrets, Firebase credentials, signing keys or all platform
configuration. The repository preserves code; back up configuration separately.

Rehearse recovery into an isolated Supabase staging project with matching
extensions/roles. Restore, deploy matching functions/config, reconcile events,
approvals and wages, revoke/rotate credentials as needed, and test sign-in before
switching users. Record recovery time and the last included transaction time.
Do not restore over live data as a routine rollback. The workflow's temporary
Postgres check is useful evidence, not a complete disaster-recovery exercise.

## Optional monitoring

Set `EXPO_PUBLIC_SENTRY_DSN` and `EXPO_PUBLIC_APP_ENV` for real builds. Development
and deliberate demo builds do not send errors. Source-map upload needs your
Sentry organization/project and a server/build-only auth token. The local APK
script skips source-map uploads when no token is present. Inspect received events
to verify scrubbing and keep access/retention appropriate for your employees.
Capture error class/action and release metadata without counts, phone credentials
or personal notes. Never assume redaction covers every free-text field.

## Optional Android push

Configure your own EAS project, Firebase client file for the chosen package and
FCM credentials. Deploy `send-push`, allow notification permission on a physical
device and verify token registration. Notification recipients are resolved on the
server; copy is generic. For scheduled reminders set a random
`SCHEDULED_PUSH_SECRET` of at least 32 characters in Supabase and the same value in
`public.push_config` under `cron_secret`; set `function_url` to your deployed
`send-push` URL. Do this through a trusted SQL/operator channel, never in git.

Migration 019 installs cron/net integration when available. Verify `pg_cron` and
`pg_net`, plus `crewgrain-push-morning` and
`crewgrain-push-evening` jobs in `cron.job`. Their UTC schedules correspond to
08:30 and 18:00 IST. These fixed times need tenant timezone redesign in the shared
platform. Test duplicates and invalid device-token cleanup. Push is not a durable
approval record or a guarantee that a worker saw a message.

## Retention and reports

Count events are the durable production record. Capture context can be pruned
with `private.prune_history(90)`; the function also removes throttle data and
presence older than 30 days. Schedule only after choosing retention and testing
against a copy. The default snapshot trims much dated history to about 62 days;
use a reviewed server export for longer historical reporting. Do not delete
original financial records to make a dashboard faster.

## Service control and incidents

The optional service-control workflow uses database-owner access to show a notice,
suspend or resume the current whole deployment. It is disabled unless explicitly
enabled. Customer admins cannot override it. A pause keeps local queues and
tokens for recovery; phones observe it at their next server contact. It is not
instant remote control of an offline device. Document any operational use with
your users. Shared hosting requires per-organization suspension and a separately
guarded platform emergency control before launch.

For sync incidents preserve the device/app and outbox; do not uninstall/reset it.
Record release, timestamp, action and redacted error, inspect authorization/date/
assignment rules, then reconcile events by UUID. Never repair by replaying a count
under a new ID without checking whether the original reached the server. Use
audited adjustments for approved quantity corrections.
