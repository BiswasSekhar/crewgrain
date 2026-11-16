# Database choices and portability

## Supported now

The current backend is Supabase: PostgreSQL schema/functions, RLS, Auth, RPC/Data
API, Deno Edge Functions and optional cron/net extensions. Moving only the
database connection string does not reproduce those services.

Hosted Supabase is the shortest deployment path. Local Supabase is the development
environment. A self-hosted Supabase stack can provide the same service boundaries,
but the operator owns TLS, gateway/Auth configuration, email, updates, secrets,
function runtime, extensions, monitoring and recovery. Follow the official
[Docker self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker)
and validate the full migration/function chain. We have not verified an arbitrary
self-hosted installation. Never expose database-owner credentials to phones.

## Why plain Postgres is not currently plug-and-play

Migrations reference `auth.users`, `auth.uid()`, platform roles, RLS policies and
privileged RPCs. Admin sign-in uses Supabase Auth and staff gateway calls use the
Supabase function client. Some operations use PostgreSQL advisory locks, JSONB
and database triggers. Neon/RDS or another Postgres host supplies a database,
not automatically these application services.

Do not run the migrations against another database and claim support by creating
fake Auth tables. Test stand-ins in embedded Postgres are test infrastructure.

## Planned adapter contract

First isolate client calls in `src/lib/backend/` behind a versioned interface:

| Operation | Required semantics |
| --- | --- |
| Authenticate/enroll | Server-verified identity and organization membership; scoped credentials and revocation |
| Read snapshot/history | Tenant/site scoping, pagination, stable date/currency metadata |
| Submit event batch | Durable UUID deduplication, ordered receipts, transactional count update, immutable original context |
| Run business command | Explicit permissions, tenant-safe foreign keys, concurrency/version checks, audited result |
| Approve/correct | Captured rates and originals retained; adjustment transaction rather than overwrite |
| Register/dispatch push | Tokens and recipients scoped to authorized membership; no client-selected arbitrary audience |
| Export | Server-side permissions, bounded pagination, tenant-safe audit and formula-safe CSV |

Implement the existing Supabase adapter first with unchanged tests. Then a
trusted HTTP API over plain PostgreSQL can reuse reviewed database rules while
providing real identity/session middleware and request-scoped authorization.
It must manage connection-pool transaction context safely; never leave an actor
or tenant setting on a reused connection. The same contract and negative
authorization tests must pass before marking a provider supported.

MySQL/MongoDB/Firebase need a different implementation of locking, authorization,
constraints and immutable-event transactions. They are deferred until a concrete
operator requirement justifies the cost. SQLite remains an offline client store.

## Migration and transfer

Back up before transfer. Export one organization's catalog, memberships,
assignments, events, approvals, rates and adjustments with stable IDs. Do not
export reusable credentials. Restore into a staging instance, enroll users again,
reconcile ledger totals and capture an import manifest. Prove repeated imports
do not duplicate events. A shared-database tenant export must omit other owners'
records; a whole-database dump cannot be given to an individual customer.

The initial release has no generic provider selector or migration assistant. See
[the platform plan](PLATFORM-PLAN.md) for phased implementation.
