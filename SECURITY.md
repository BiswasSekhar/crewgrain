# Security

This is a development project with no security SLA. Only the current `main`
development line is maintained. The initial app is not a shared multi-business
service.

Use the repository's **Security → Report a vulnerability** entry for a private
report when available. If unavailable, open an issue asking for a private contact
without including exploits, credentials or personal data. Include version,
deployment mode, expected authorization and a synthetic reproduction in the
private report. Rotate exposed credentials; deleting a commit does not revoke them.

## Current boundaries

- Staff sign in with ID/phone only. This proves neither a secret nor ownership
  of a phone number. A person knowing another ID may impersonate that worker or
  captain. Throttles/device limits do not solve this. Secure enrollment is a
  prerequisite for the shared platform.
- Admins can access the whole current backend. Use one backend per business.
- Native credentials use SecureStore; web staff tokens use localStorage and
  admin sessions use sessionStorage. Caches/outboxes are not encrypted databases.
- Service-role keys bypass RLS and must remain on trusted servers. Every gateway
  and privileged database function must enforce authorization.
- Optional monitoring removes selected personal fields; inspect actual events.
- The optional vendor service pause currently affects the entire deployment.

Before real use test hosted Auth/HTTP, revocation, CORS, bad connectivity,
original-count preservation, restore and installed-phone behavior. The platform
plan specifies additional tenant-boundary and secure-login tests.
