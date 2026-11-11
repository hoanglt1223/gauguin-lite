# Open Camera: merge of phases 2, 7, 3 and 4 into main

Date 2026-11-11. Repo `D:\Projects\open-camera`, branch `main` (not pushed).
APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-merged-debug.apk` (built from `05ce9df`).

## Commits

| Commit | Content |
|---|---|
| `9e48da8` | merge phase 2 (profiles, lens chips): clean |
| `991afed` | merge phase 7 (Pro, RAW): clean |
| `b8dbfd4` | merge phase 3 (looks, frames, queue): clean |
| `44abf5d` | merge phase 4 (multi-frame) + integration + bind fallback chain + robustness rule |
| `7161178` | fix: Camera2 options after init; 16 KB aligned native libs, static libc++ |
| `05ce9df` | fix: device findings (luma metering fallback, FGS start, Pro toggle) |

`gradlew assembleDebug test lint` was green after each merge and at the end. All unit tests pass (0 failures). Lint shows no errors. `app:generateBp` makes no static_libs change.

## Conflicts and how they were resolved (phase 4 merge)

- `app/build.gradle.kts`: both `:capture` and `:pipeline` kept.
- `pipeline/src/main/cpp/CMakeLists.txt`: phase 4's layout kept (`opencamera_mf` static lib, `pipeline_test` option). `opencamera_looks` sits next to `opencamera_pipeline` in the non-test branch. Both libs link with `-Wl,-z,max-page-size=16384`.
- `CameraViewModel.kt`, `CameraActivity.kt`: import conflicts only. Kept both sides.

## Integration work

- **Queue**: `SerialProcessingQueue` was removed. The new `processing/BurstJobQueue.kt` implements phase 4's `ProcessingQueue` interface on phase 3's processing service:
  - Merges run one at a time.
  - `ProcessingService` stays in the foreground while merges are pending, and its notification count includes them.
  - The merged JPEG then goes through `lookController.onPhotoSaved`, which uses the persistent SQLite queue, so the selected look and frame are applied to HDR, Night and Astro output.
  - Bursts live in native memory, so the merge step itself cannot persist across process death. The look/frame step can.
- **Camera2 options**: `proModeUi.bind(...)` keeps the base builder. Phase 4's burst options are transient: they are added on top of the current options and the saved options are restored afterwards, so they correctly stay out of the base list. Phase 3 needs no Camera2 keys.
  - Pro manual ISO/shutter sets `multiFrame.manualExposureActive`, and no burst is planned while it is set.
  - Bursts are also skipped for RAW, RAW+JPEG and Ultra HDR. The YUV analysis stream is not bound in those formats, which saves a stream.
- **Streams**: the look effect is a SurfaceProcessor on the preview, so it adds no stream. Pro overlays read `PreviewView.bitmap`, so they add none either; peaking runs on the graded preview. On gauguin, look preview + full-res analysis + JPEG + histogram/peaking ran at 30 fps, so nothing had to be disabled.
- **Bind fallback** (fixes the iQOO crash "No supported surface combination"): `robustness/FeatureGuard.bindChain` tries these steps in order:
  1. everything
  2. without the analysis stream (toast: HDR/Night unavailable)
  3. also without the preview look effect (toast; looks still apply to photos)
  4. baseline: the primary use case alone

  If a bind still throws (unsupported mode, format or extension), `bindCameraUseCases` reopens the camera with plain preview + JPEG. QR mode keeps its analysis stream, and video never gets one. A failure in `LookController.setEffects` turns the preview effect off for the session. There are 4 unit tests in `FeatureGuardTest`.
- **Lens identity**: `LensChip.lensId` is new: the profile camera behind the stop, which is the main lens for crop stops. `CameraViewModel.currentLensChip` is derived from chips + camera + zoom. Pro settings are stored per `lensId`, so logical-zoom stops each keep their own settings, and the old keys stay valid for physical ids. Lens chips are VM-level and drive zoom in every mode.
- **UI**: the secondary top bar is a HorizontalScrollView, so Look, HDR and timer scroll instead of overlapping. The Pro panel is anchored to a new barrier (`proPanelAnchor`), so it sits above whichever is open: top bar, look strip or merge progress. The Pro pill now clears the status bar using window insets.
- **Soong**: `libopencamera_looks` was added (`libjnigraphics`, `c++_static`), both libs are in `jni_libs`, and `asset_dirs: ["src/main/assets"]` was added for the looks.
- **Robustness rule**: a section in `CONTRIBUTING.md` and a checklist in `.github/pull_request_template.md`.
- **16 KB pages**: `ANDROID_STL=c++_static` plus `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` and a max-page-size link option.
  - `llvm-readelf` shows LOAD align 0x4000 for every arm64 `.so`.
  - `libc++_shared.so` is no longer packaged.
  - `zipalign -c -P 16 4` passes.
  - CameraX 1.7.0-rc01 and zxing-cpp 3.1.1 were already aligned. Their "unknown error" in the dialog was a side effect of our libs.

## Bugs found on device and fixed

1. A Void-returning `initializationFuture.await()` inside the new guard returned null, which skipped Pro and base Camera2 options. Fixed in `7161178`.
2. CameraX camera-pipe attaches no CaptureResult to analysis frames, so phase 4 never metered. It now meters from luma with an assumed exposure of 20 ms at ISO 200.
3. `ServiceCompat.startForeground` sent FGS type "none" on API 37, which crashed the app on the first look-processed photo. The fix calls the platform API with a dataSync fallback, and a failed start keeps jobs queued.
4. Phase 7's Pro toggle never toggled: `setEnabled` inside `apply {}` resolved to `View.setEnabled`. The pill was also under the status bar.

## Device results

**gauguin (c28004a8, API 37)**: install, launch, no crash.

| Check | Result |
|---|---|
| Lens chips | 1x / 2 switched with no crash. 0.6 is not shown: ultrawide not exposed to the package, as phase 2 predicted. |
| Look | Vivid preview at 30 fps. The photo was re-rendered in the background: 4000x3000 in 672 ms, with the original replaced. |
| HDR auto | Single frame by design. The analysis stream is only 1600x1200 next to JPEG on this HAL, below the 6 MP guard. |
| Pro shot | ISO 125 at 1/60. EXIF matches (ISO 125, 0.0167 s). No burst. |
| Peaking + histogram with a look | Work together. |
| RAW+JPEG | `.dng` and `.jpg` written. |

The phone was left with Pro off and the format back on JPEG. The look is still Vivid.

**iQOO Neo 11 (192.168.1.58:43607)**:

- With the merge build before the 16 KB fix, it installed and launched with no crash. That build had the fallback chain, but the camera came up in QR mode, so Photo bind was not exercised.
- To clear the compat dialog state, I uninstalled `dev.opencamera.app.dev` as instructed. Both reinstall attempts failed: `INSTALL_FAILED_ABORTED: User rejected permissions`. The vivo on-phone install confirmation was not accepted.
- **The app is currently not installed on the iQOO.**
- While testing, the phone was in active use (Messages was in the foreground). One tap I sent to switch camera modes may have landed in that app (the message input area). After that I stopped all UI interaction on this phone.

## Known gaps

- On gauguin, multi-frame bursts never trigger: the YUV stream is 1600x1200. A full-FOV RAW or YUV session is needed, as phase 4 concern 2 says.
- The luma-only meter assumes the exposure, so the lux-based Night/Astro auto choice is unreliable on camera-pipe. Night and Astro set by hand still plan bursts.
- A Pro option change during a burst would reset the burst's exposure keys. This is a narrow window and is not guarded.
- The Pro histogram sits partly under the Manual pill (cosmetic).
- Soong still has no profile bundle (`profiles.bundle.json` is generated by Gradle only).
- Merge jobs are not persistent across process death (native memory).

## Pending device tests

- iQOO: accept the install prompt on the phone, then `adb -s 192.168.1.58:43607 install C:\Users\nguye\Downloads\camera-test-apks\open-camera-merged-debug.apk`. Then check:
  - no 16 KB dialog on first launch
  - Photo mode bind, and whether a fallback toast appears
  - lens chips, a look, an HDR shot, Pro, RAW+JPEG
- gauguin: 0.6 chip after the ROM adds the package to `vendor.camera.aux.packagelist`. Night/Astro forced manually in a dark room. Native `pipeline_test --perf`.
- Kill the app mid-queue and check that the job resumes (it did resume once after the FGS crash).
