# Open Camera: Phase 1 (done) and Phase 2 (partial)

Plan: `plans/261109-2101-open-camera-app/plan.md`. Date 2026-11-10.

## Repositories (local only, not pushed)

| Repo | Commits |
|---|---|
| `D:\Projects\open-camera` (branch `main` from upstream `lineage-24.0` @ 5c52de5, remote `upstream`) | `fe4b6a4` feat: fork Aperture as Open Camera; `49176b8` feat(profiles): auto-generate device profile from Camera2 |
| `D:\Projects\open-camera-profiles` (branch `main`) | `1393d5e` feat: device profile schema, validator and gauguin seed |

APK: `D:\Projects\open-camera\app\build\outputs\apk\debug\app-debug.apk` (`dev.opencamera.app.dev`).

## Phase 1

- Package/applicationId/namespace `dev.opencamera.app` (package dir moved with `git mv`, history kept). Soong: `OpenCamera`, `OpenCamera_*` prebuilts, `OpenCameraFrameworksBaseOverlay`, `OpenCameraLensLauncher`; `overrides: ["Aperture", "Camera2"]`.
- Label "Open Camera" (not translatable; translated `app_name` entries removed). New original adaptive icon (open ring + dot, teal).
- Modules: `:profiles` (Kotlin/JVM), `:capture`, `:ml`, `:vendor-bridge` (empty Android libs), `:pipeline` (NDK 27 + CMake 3.22.1, JNI `NativePipeline.nativeVersion()`, hand-written `Android.bp` `cc_library_shared`).
- NOTICE (credits LineageOS Aperture, disclaims relation to net.sourceforge.opencamera), README, CONTRIBUTING (code provenance rule), PR template with provenance checklist, `docs/upstream-sync.md` (rename map), REUSE.toml updated, LineageOS gerrit workflow removed; CI = `assembleDebug test lint` + `generateBp` diff check + `reuse lint`.
- Verified: `gradlew assembleDebug test lint` green (JDK `D:\CapCutMCP\rea\jdk-21`, SDK `%LOCALAPPDATA%\Android\Sdk`, installed platform 36 + build-tools 36.0.0); `app:generateBp` reproduces `Android.bp`; `reuse lint` clean for tracked files.
- Device: installed next to `org.lineageos.aperture`, cold start 1.8 s into CameraActivity, shutter produced `DCIM/Camera/2026-11-10-15-40-06-323.jpg` (2.9 MB) with camera 0 opened by `dev.opencamera.app.dev`. Screens: `plans/reports/open-camera-shots/` (preview was dark: phone lying in a dark spot, not a pipeline fault).

Deviations from the phase file:
- No `foss`/`qnn` flavors: the user dropped QNN, and `gradle-generatebp` hardcodes `releaseRuntimeClasspath`, so it breaks with flavors.
- `CameraRepository` not moved to `:capture`: it depends on `models/*` in `:app`, so moving it would drag most of the app. Skeleton modules are not yet dependencies of `:app`.
- `gradle-generatebp` cannot resolve Gradle project dependencies ("No POM found"). Workaround: `:app` depends on `:profiles` except when the `generateBp` task runs; Soong gets the sources via `filegroup OpenCamera_profiles_srcs` in `app/Android.bp` `srcs` (outside the generated section, which generateBp preserves).
- Not done: `m OpenCamera` in the LineageOS tree, manual video/QR test, lock-screen/secure camera test.

## Phase 2 (partial)

- `:profiles`: `LensCatalog` (equivalent focal = min focal x 43.27 / sensor diagonal; dedup by facing+focal+sensor+pixel array onto lowest id; sensors at or below 3 MP or without BACKWARD_COMPATIBLE are aux: depth if a member of a logical camera, else macro; main = largest usable sensor; ratio rounded to 0.1; 2x crop stop on main when no tele), `ProfileResolver` (override > verified > community > auto, match by normalized brand + device/model, SDK and fingerprint prefix), `LensPlan.stopFor()`, `ProfileJson` (org.json, compileOnly), `Quirk` enum. 8 unit tests pass (gauguin fixture from `dumpsys media.camera`).
- App: `DeviceProfileRepository` scans listed ids plus probed 0..15 on `Dispatchers.Default` with a mutex (no class lock), caches per fingerprint in `noBackupFilesDir`, reads `files/device-profile-override.json` and optional `assets/profiles.bundle.json`; Settings > "Export device profile" shares the JSON.
- On gauguin: logcat `Profile xiaomi/gauguin (auto), stops 0.6->3/physical, 1x->0/physical, 2->0/crop`. Only ids 0 and 1 are listed; 2..7 come from probing (marked `hidden`). Roles: 2 macro, 4 depth, 5 logical [0,4], 6 = dup of 3, 7 = dup of 1. Quirks `ULTRAWIDE_DUP_ID`, `DUPLICATE_CAMERA_ID`. The device export passes the validator.
- `open-camera-profiles`: JSON Schema 2020-12, `tools/validate.py` (stdlib semantic checks plus `jsonschema` when installed: stop roles, duplicates, monotonic ratios, one 1x stop, crop only on main, personal-data keys/values), `data/xiaomi/gauguin.json` (`verified`), CI workflow, issue form.

Remaining for Phase 2: wire `LensPlan` into `LensSelectorLayout`/`CameraViewModel` (the UI still uses Aperture's lens list), quirk effects in `:capture`, a build step that generates `profiles.bundle.json` from the profiles repo, the 20x lens-switch ANR check with StrictMode, and the issue-form-to-PR bot.

## Unresolved questions

1. Where will the GitHub repos live (org/name)? The schema `$id` uses a placeholder URL `github.com/open-camera/open-camera-profiles`.
2. Should the profiles repo be a git submodule of the app, or should the app fetch a tagged release at build time to produce `profiles.bundle.json`?
