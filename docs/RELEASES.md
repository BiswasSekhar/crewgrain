# Releases and upgrades

## Identity

The public source defaults to Crewgrain 0.1.0, code/build 1 and package
`io.github.biswassekhar.crewgrain`. Independent deployments must choose their own
package/bundle ID, URL scheme, app name, artwork and Expo project. Configure these
in `app.json`; no original owner's update URL/project ID is included. OTA updates
are disabled until you connect your own project.

Changing the package ID creates a different app; it does not upgrade a previously
installed Ziva app. Never remove an old app with unsynced counts.

## Android APK via GitHub

Create a private release keystore, store it and its password in two secure
locations, and set the release secrets listed in WORKFLOWS.md. Every upgrade must
use the same signing key. The workflow is manual or triggered by a `v*` tag, runs
checks and builds a signed APK with checksums and certificate metadata. The tag
must match `app.json` (for example `v0.1.0`). Increase Android versionCode on every
binary release. A local build with no signing variables uses a test key only.

Local Android builds require a JDK and Android SDK. Run
`npm run build:android:apk`; supported ABI selection is
`-- --architectures=arm64-v8a,armeabi-v7a`. Inspect the build script's Windows short
workspace handling before running several checkouts on one PC.

No signed production APK is included in the source release. A public repository
can host its APK releases without employee GitHub accounts. Verify the SHA-256
and expected signer before installation.

## EAS builds and updates

Use your own account:

```sh
npx eas-cli@27.10.0 login
npx eas-cli@27.10.0 init
npx eas-cli@27.10.0 update:configure
```

Review the resulting config. Remove the initial `updates.enabled: false` or set
it to true after configuring your project. Set the app backend values in EAS's
preview/production environments; builds and update jobs each need their own
values. Profiles/channels are development, preview and production. Build with
`npx eas-cli@27.10.0 build --platform android --profile preview`, then pilot before
production. `npm run update:preview -- --message "..."` publishes a compatible
JavaScript/assets update after EAS is connected.

An OTA update must match the installed binary's native runtime. New native
modules, permissions, plugins or SDKs require a new binary/runtime. This source
uses the appVersion runtime policy; bump the app version appropriately. EAS
rollouts distribute to a percentage of eligible clients; they are not an
organization-authorization system. Use server-side feature cohorts for per-owner
features, while retaining schema/protocol compatibility for every client.

See [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions.md),
[rollouts](https://docs.expo.dev/eas-update/rollouts.md) and
[rollbacks](https://docs.expo.dev/eas-update/rollbacks.md).

## Backend and app rollout order

1. Backup and verify the release manifest: DB version, API protocol, binary
   runtime, app commit and feature/config revisions.
2. Deploy additive database changes and a backend that accepts both current and
   previous clients. Backfill and verify before enabling a new feature.
3. Pilot on test owners; reconcile queued counts, approvals and totals.
4. Publish compatible client updates, then enable features by owner/cohort.
5. Monitor rejection rates and latency; advance or turn the feature off.
6. Remove old columns/protocols only after the supported offline-client window
   and upgrade criteria have been satisfied.

Client rollback does not undo a migration or already-recorded work. Restore is
an incident action that can lose writes after the backup; prefer a forward fix
for data bugs. Preserve event UUIDs and original payloads. For incompatible old
clients, offer a recoverable update-required state, not silent deletion of queues.

Owner customization should be versioned settings, presets and approved module
versions. Store overrides separately from defaults so upstream updates do not
overwrite them. White-label apps need separate signing/update credentials and a
release matrix; they increase maintenance and are not the shared-platform default.
