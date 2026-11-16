<p align="center"><img src="assets/brand/crewgrain-symbol.svg" width="72" alt="Crewgrain" /></p>

# Crewgrain

[![CI](https://github.com/BiswasSekhar/crewgrain/actions/workflows/ci.yml/badge.svg)](https://github.com/BiswasSekhar/crewgrain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Daily work, production records and approvals for teams.**

Crewgrain is an open-source, mobile-first operations app built with Expo, React
Native and Supabase. Workers record completed operations, supervisors plan and
check work, and owners review production and piece-rate earnings. Counts can be
recorded offline and synced later.

[Setup](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Databases](docs/DATABASES.md) · [GitHub Actions](docs/WORKFLOWS.md) ·
[Releases](docs/RELEASES.md) · [Shared-platform plan](docs/PLATFORM-PLAN.md)

## Status

This first public development release comes from a garment-production app. The
working application supports **one business per backend** and multiple lines
within that business. Admin access spans that backend. **Do not put unrelated
businesses in the same backend yet.**

The next milestone is a shared platform with isolated owner accounts and several
factories/sites per owner. Restaurant and other industry modules are planned;
they are not implemented by relabelling garment screens. The
[platform plan](docs/PLATFORM-PLAN.md) defines implementation and release gates.

## Working features

| Role | Tools |
| --- | --- |
| Worker | Assigned operations, plus/minus and exact counts, offline queue, quantities/pay history and correction requests |
| Supervisor (`captain` internally) | Daily styles/targets, operation assignments/defaults, attendance, approval of unchanged worker counts, team output |
| Admin | Staff, lines, supervisors, phone access, styles/operations/materials/rates, approvals, count corrections, production/pay filters and CSV export |

Phone layouts serve workers and supervisors; admins also get a desktop workspace.
SQLite/IndexedDB outboxes and unique event IDs make count retries safe. Approved
counts and captured rates are retained; corrections create audited adjustments.
English and 22 Indian language catalogs are bundled, with draft translations
requiring native-speaker review. Notifications, monitoring, backups and Android
distribution are optional integrations.

Boundaries: earnings do not record payments; attendance is present/absent; count
dates cover today and the previous two days; much loaded history is limited to
roughly 62 days. INR and Asia/Kolkata are current defaults. Captain report forms
and audit navigation are hidden. No POS, stock, kitchen ticketing or general
workflow designer is included.

## Try the demo

Use Node 24+ and npm. No backend or credentials are needed for the labelled
development demo.

```sh
git clone https://github.com/BiswasSekhar/crewgrain.git
cd crewgrain
npm ci
npm run web
```

Open the printed localhost URL and `/login`. Choose a demo role or enter worker
ID `ZV-041` / supervisor ID `ZV-010`. Those synthetic IDs grant no hosted access.
The account menu supports demo role switching and offline simulation.

For real use, follow [SETUP.md](docs/SETUP.md): configure your own Supabase
environment, apply **all 22 migrations**, deploy both Edge Functions and create
the first admin. An unconfigured release displays a connection message. Sample
releases require explicit `EXPO_PUBLIC_ALLOW_DEMO=true`.

No original backend, Expo update project, signing key, customer production sheet
or real employee record is distributed here.

## Database support

| Backend | Status |
| --- | --- |
| Hosted Supabase | Implemented integration; configure your own project |
| Local Supabase | Development guide; Docker required |
| Self-hosted Supabase | Compatible architecture; operator validation required |
| Plain PostgreSQL / Neon / RDS | Planned adapter; not a connection-string switch |
| MySQL / SQLite server / MongoDB / Firebase | Not supported; separate implementation required |

Authorization, RPCs, transactions and admin Auth currently depend on
Supabase/PostgreSQL. Client SQLite is an offline outbox, not the authoritative
database. See [DATABASES.md](docs/DATABASES.md).

## Develop and deploy

```sh
npm run lint
npm run typecheck
npm test
npm run check:expo
npm run build:web
npm run build:android-bundle
```

Tests include domain rules and actual SQL migrations in embedded Postgres. They
do not replace hosted Auth, load tests or installed-phone checks.

| Guide | Contents |
| --- | --- |
| [Setup](docs/SETUP.md) | Local/hosted backend, admin provisioning and smoke tests |
| [Architecture](docs/ARCHITECTURE.md) | Source map, rules and trust boundaries |
| [Database options](docs/DATABASES.md) | Providers and portability contract |
| [GitHub Actions](docs/WORKFLOWS.md) | CI, deployments, releases, secrets and fork setup |
| [Releases](docs/RELEASES.md) | Identity, signing, updates and rollback |
| [Operations](docs/OPERATIONS.md) | Backups, push, monitoring, retention and incidents |
| [Platform plan](docs/PLATFORM-PLAN.md) | Owner isolation, industry modules and implementation phases |
| [Roadmap](ROADMAP.md) | Milestones and completion criteria |
| [Contributing](CONTRIBUTING.md) / [Security](SECURITY.md) | Contribution and vulnerability reporting |

## License and origins

MIT; see [LICENSE](LICENSE). Upstream notices and font licenses are retained.
Contributions use the same license. Crewgrain starts a clean public history from
an earlier private app; the original deployment stays separate. The name is a
project identifier, not a claim of trademark or domain registration.
