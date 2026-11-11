# Open Camera phase 8: vendor extension bridge

Date 2026-11-11. Worktree `D:\Projects\open-camera-wt\phase8-vendor-bridge`, branch `feat/phase8-vendor-bridge`, commit `d368ba2` (not pushed).
APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-phase8-debug.apk`.
`gradlew assembleDebug test lint` is green. `app:generateBp` shows no diff.

## What was built

- **`vendor-bridge/` module** (pure Camera2 code, no CameraX dependency, no vendor code):
  - `ExtensionsProbe`: per camera it reports:
    - the CameraX extensions (passed in from the app's `ExtensionsManager`)
    - the Camera2 `CameraExtensionCharacteristics` modes, with JPEG size count, `isPostviewAvailable`, `EXTENSION_STRENGTH` support and capture progress (API 34)
    - Ultra HDR (`JPEG_R` output)
    - vendor characteristics, request and result keys (any name not starting with `android.`)
  - `VendorTagRegistry`: reads profile `vendorTags` in the form `"<name>": "<type>:<value>"`. Types are `i32`, `i64`, `u8`, `f32`, `f64`, `bool` and `i32[]`.
    - A tag is used only if the profile is `verified` and the camera lists the key.
    - An invalid value disables the tag for the session.
    - Keys are built with `CaptureRequest.Key(name, type)`, which needs API 29+. Below that, no tags are written.
  - `VendorBridge`: holds the kill switch `vendor_bridge_enabled` and the per-mode source choice. It also has a crash guard: the tags being written are saved first, and if the app dies before the session settles (3 s), those tags are blocked on later launches. The report is dumped to logcat once per process (tag `VendorBridge`).
  - `SourcePolicy`: decides the source. The order is: Open if the user chose it, else OEM if the phone offers it and it has not failed this session, else Open. It also makes the labels `OEM Night` / `Open Camera HDR …`.
- **App integration** (bind fallback chain):
  - `CameraViewModel.resolveExtensionMode`:
    - an effect the user picked explicitly wins
    - otherwise the multi-frame setting maps HDR auto → OEM AUTO, HDR on → OEM HDR, Night → OEM NIGHT
    - this happens only for plain JPEG (not RAW, Ultra HDR, ZSL or single capture), when the camera supports the mode and the policy says PHONE
    - while OEM processing is active the YUV burst stream is not bound
  - Bind failure with an OEM mode: the feature is marked failed for the session, a toast is shown, and the bind is retried on the open pipeline. Only after that does the existing baseline fallback run.
  - A toast "Phone's Night processing" appears when the source changes. EXIF `ImageDescription` is written to the saved JPEG (before the look re-render). Multi-frame output now says `Open Camera HDR N frames`.
  - Vendor tags are written only when no extension is active:
    1. They are first sent as a separate `addCaptureRequestOptions`, which is awaited with a 3 s timeout. If that fails, the tags are disabled.
    2. On success they go into the base options, so Pro and burst restores keep them.
  - Settings, in a new category "Phone's camera features":
    - a master switch
    - an "HDR and auto HDR" choice and a "Night" choice, each Phone (default) / Open Camera
  - Changing a setting takes effect when you come back from Settings (the activity rebinds on start).
- **Docs**: `docs/vendor-tags.md` covers the source order, EXIF labels, the `adb logcat -s VendorBridge` report, `dumpsys media.camera`, the tag format and the safety rules. No blobs are distributed.
- **CI**: `scripts/check-no-vendor-libs.sh`, run in `.github/workflows/build/action.yml`, fails if the APK has any `.so` outside the allowlist: `libopencamera_*`, zxing-cpp, and the two CameraX JNI libs. Checked by hand on the current APK: only those five libs per ABI.
- **Tests**: 6 unit tests in `vendor-bridge/src/test/.../VendorBridgeTest.kt` cover the policy (Open wins; no OEM when the bridge is off, the mode is unavailable or it failed), the labels, typed parsing, malformed values, and selection (unverified profile, key not offered, invalid value, disabled tag).

## Device results

### gauguin (c28004a8, LineageOS, API 37)

Installed and launched with no crash. A photo captured OK. The probe report:

```
camera 0 facing=1 (back) / camera 1 facing=0 (front)
  camerax: none
  camera2: none
  ultraHdr(JPEG_R): false
  vendor characteristics (0)
  vendor request keys (2): org.codeaurora.qcamera3.sessionParameters.availableStreamMap,
                           org.codeaurora.qcamera3.sessionParameters.overrideResourceCostValidation
  vendor result keys (0)
```

- Only cameras 0 and 1 are listed to the package; the aux cameras are not exposed.
- `getKeys()` lists no vendor characteristics on this build. The framework filters them, so use `dumpsys media.camera` for the full tag list.

Guard test: I pushed a temporary `verified` override profile with two tags:
- `xiaomi.fake.tag: i32:1` → `Vendor tag xiaomi.fake.tag not offered by this camera, skipped`
- `...overrideResourceCostValidation: i32:oops` → `disabled for this session: invalid value "i32:oops"`

The app stayed up. I then removed the override; the phone is back to its normal profile.

### iQOO Neo 11 (adb-10CFBC0R3U0012F-…)

**Not tested.** `adb install` failed with `INSTALL_FAILED_ABORTED: User rejected permissions`: vivo's on-phone install confirmation was not accepted. The app is not installed on the phone. I did not touch the phone. Its extension list is therefore still unknown.

To finish: accept the install prompt on the phone during
`adb -s <serial> install -r C:\Users\nguye\Downloads\camera-test-apks\open-camera-phase8-debug.apk`, then run
`adb -s <serial> shell am start -n dev.opencamera.app.dev/dev.opencamera.app.CameraActivity` and
`adb -s <serial> logcat -d -s VendorBridge`.
In Photo mode with HDR auto, expect "Phone's Auto processing" if OriginOS exposes AUTO.

## Shared files touched (merge notes)

- `CameraActivity.kt`:
  - `bindCameraUseCases` now retries without OEM processing
  - `bindWithFallback` returns Boolean and takes a `quiet` flag
  - the extension mode comes from `viewModel.resolveExtensionMode`
  - vendor tags go into `baseOptions` before `proModeUi.bind`
  - the multi-frame collector rebinds when the bridged OEM feature changes
- `CameraViewModel.kt`: adds `vendorBridge`, `oemProcessingLabel`, `resolveExtensionMode`, `bridgedOemFeature`, `vendorTagsFor`, EXIF tagging in `onImageSaved`, and the probe dump in `init`.
- `MultiFrameCaptureController.kt`: description label only.
- `ext/ExtensionsManager.kt`: adds the OemFeature ↔ ExtensionMode mappings.
- `ApertureApplication.kt`, `root_preferences.xml`, `app/build.gradle.kts`, `app/Android.bp` (`:OpenCamera_vendor-bridge_srcs`), and the CI action.
- Licenses: no new dependencies or models.

## Open items

- iQOO run (above). That is the only device here likely to have OEM extensions, so the "OEM NIGHT photo + EXIF" check is still pending.
- The `open-camera-profiles` schema still allows any string in `vendorTags`. Suggested change in that repo, which I did not commit: a pattern `^(i32|i64|u8|f32|f64|bool|i32\[\]):.+$`. No profile has tags yet.
- An extension session that fails after the bind (an asynchronous camera error) is not detected, so it does not fall back automatically. A failure at bind time is detected.
- The "defaults per profile" option from the spec is not done. The default is "Phone" for every device.
- The blocked-tag list is cleared only by clearing app data.
