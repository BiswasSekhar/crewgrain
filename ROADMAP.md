# Roadmap

Planned capabilities below are not shipped. See [the design](docs/PLATFORM-PLAN.md).

| Milestone | Outcome | Gate |
| --- | --- | --- |
| Public foundation | Clean rebrand, guides, CI and opt-in operations | Fresh clone checks/builds; no original deployment targets |
| Tenant foundation | Organizations, sites, memberships, secure enrollment, scoped data | Two owners cannot access each other's rows, RPCs, exports or pushes |
| Tenant-safe mobile | Owner/site selection, scoped offline state, protocol versioning | Switch/restart/upgrade cannot send work to the wrong organization |
| Owner configuration | Branding, terminology, capabilities, timezone, units, versioned workflows | Settings survive upgrades without weakening authorization |
| Garment pilot | Two isolated businesses on a shared backend | Real-phone quantities/wages reconcile; restore and rollback rehearsed |
| Restaurant operations | Prep batches, tasks/checklists, shift completion | Validated with restaurant users; no POS or inventory claim |
| Provider portability | Backend contract and plain-Postgres adapter | Same authorization, transaction, idempotency and isolation suite passes |

Ship reviewable PRs with migration notes. Normal customization should use settings
and tested modules rather than customer-specific code branches.
