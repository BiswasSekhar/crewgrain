# Contributing

Use Node 24+, `npm ci`, then `npm run web` for the demo. Read the architecture and
platform plan. Open an issue before a large schema/workflow change; focused fixes
can come directly as PRs. Describe the problem, behavior and validation.

Before submitting run lint, typecheck, tests, Expo compatibility and the relevant
exports. SQL changes need meaningful authorization, concurrency and retry tests.
The app typecheck excludes tests and Edge Functions; Deno-check changed functions.
Use synthetic data only in tests, screenshots and reports. Never commit secrets.

Use Expo Router and keep non-route code outside `src/app/`. Read the matching SDK
docs before changing Expo/React Native APIs. Use `npx expo install` for packages.
Do not edit generated native folders. Maintain small-phone and low-end Android
usability and the existing web behavior.

Never rewrite a migration included in a public release; add an ordered migration
and upgrade notes. Preserve worker originals, historical rates, deduplication and
outbox recovery. Tenant isolation belongs in server authorization and constraints;
UI filters and client-supplied IDs are insufficient.

Keep discussion respectful and specific. Explain disagreements with examples.
No harassment, private records or credentials. Contributions are licensed under
MIT; preserve third-party notices.
