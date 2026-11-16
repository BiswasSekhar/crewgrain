# Public foundation validation

Checked locally on 17 November 2026 with Node 24.14.0 and npm 11.9.0.

| Check | Result |
| --- | --- |
| Dependency install | Passed with lockfile |
| Expo compatibility | Passed; Expo 58.0.25 and SQLite 58.0.17 |
| Lint and application typecheck | Passed |
| Tests | 232 passed across 34 files with two workers |
| Web export | Passed |
| Android JavaScript/Hermes export | Passed |
| Brand asset generation | Passed; generated mark/wordmark inspected |
| Documentation links and workflow YAML | Passed |
| Publication guard | No matched private-file/key patterns or connected Expo template target |
| Supabase CLI examples | Checked v3.1.0 help for remote push, linking, secrets and function deployment |

The factory-specific sheet and its five tests are excluded from the public
snapshot. Fixtures are synthetic. The original private repository/history and
its configured Expo project are not copied into this new Git history.

Exports emitted upstream Expo Router package-export fallback warnings and a
notice that optional Sentry organization/project configuration is unset. Both
exports completed. No provider issue or automatic report was submitted.

These checks do not establish hosted Auth/device behavior, push delivery,
signed APK installation, a complete backup restore, multi-tenant isolation,
restaurant readiness or support for other database providers. Those remain
explicit deployment/roadmap gates. No live infrastructure or production secrets
were configured for this source release. GitHub Actions is the independently
reproducible CI record; inspect the run associated with your commit.
