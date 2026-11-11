# Open Camera: Phase 3 (looks, frames, background processing)

Plan: `plans/261109-2101-open-camera-app/phase-03-looks-watermark.md`. Worktree `D:\Projects\open-camera-wt\phase3-looks`, branch `feat/phase3-looks`.
Commits: `1d74b61` (looks, renderers, layout, queue), `b4edf96` (app integration), `ca95f2e` (CC0 license for generated assets).

## Features

- **Looks (original, procedural):** `tools/lutgen/gen_luts.py` (numpy) generates 12 looks into `app/src/main/assets/looks/<id>/` (`lut.cube` 33³ + `look.json`) plus `index.json`: Natural, Vivid, Classic CCD, Classic CCD Plus, Rangefinder Neutral, Silver Mono, Warm Film, Cool Chrome, Faded Matte, Soft Portrait, Teal and Orange, High Contrast Mono. The colour part (white balance, Oklab chroma and hue bands, split toning, fade, channel-mix mono) is baked into the LUT. The tone curve, highlight roll-off, grain and vignette stay as runtime parameters in the descriptor. No third-party LUTs, models or artwork were used. Assets are CC0-1.0 (REUSE annotation), and `reuse lint` passes.
- **One math, three implementations:** `LookMath.kt` (JVM reference), `cpp/looks/look_apply.cpp` (native stills) and the GLES3 fragment shader in `GlLookProgram.kt` all run the same steps in the same order: tetrahedral LUT, then intensity mix, then 256-entry tone table (monotone cubic plus shoulder), then vignette, then hashed grain. The grain is deterministic, so preview and photo match by design.
- **Preview:** `LookSurfaceProcessor` (CameraX `SurfaceProcessor`, own EGL/GL thread, OES input) and `LookEffect` (target PREVIEW). It logs preview fps every 2 s. When "Original" is selected, the effect is removed so the preview runs on Aperture's stock path.
- **Picker UI:** a new "Look" button in the secondary top bar toggles `LookPickerView` (a strip of looks above the bar). Settings has a new "Looks and frames" section with strength (0–100) and frame (None, Film border, EXIF strip).
- **Stills:** `StillProcessor` decodes the JPEG, renders the look in place on the native side (strips of 64 rows on up to 8 threads, no full-size intermediate buffer) and adds the frame. It encodes at quality 95 and copies all EXIF tags except thumbnail and dimensions, then updates the dimensions. Orientation is kept: the frame is laid out upright and drawn through a rotation matrix.
- **Frames:** `WatermarkLayout` sizes everything as a percentage of the short side. Film border is 3.5% on the sides and top and 13% at the bottom. EXIF strip is a 10% band with a divider. Fields are model (EXIF, falling back to `Build.MODEL`), focal length, f-number, shutter, ISO and date. Missing fields are dropped and the remaining text closes up, and text shrinks to fit its slot. There is no logo.
- **Queue:** `ProcessingQueue` is a pure state machine (QUEUED → RUNNING → WRITTEN → DONE, or FAILED). It retries up to 3 attempts with exponential backoff of 2 s then 4 s. A job left RUNNING after process death counts as an attempt, so a bad image cannot crash-loop forever. Enqueue is idempotent per source URI, and finished jobs are pruned after 24 h. Storage is `SqliteJobStore` (plain SQLite, so no KSP/Room plugin was added).
  - `ProcessingService` runs as a foreground service (mediaProcessing on API 35+, dataSync below) only while jobs are pending. Its notification reads "N photos left" with no percentage and is removed (`STOP_FOREGROUND_REMOVE`) when the queue drains. Queue decisions run on the main thread, so they cannot race `onStartCommand`.
  - Publishing is crash-safe. The original stays in DCIM until the rendered copy is fully written as an `IS_PENDING` item named `<name>_oc<jobId>`. Only then is the original deleted and the copy published under the original name. Every step can be repeated safely, and stale half-written pending copies are deleted before a retry.
  - Leftover jobs resume when the camera opens again.

## Test evidence

- `gradlew assembleDebug test lint`: green (re-run after the restart, 2026-11-11). `reuse lint` is compliant.
- Unit tests (`:pipeline`, 23 tests, 0 failures):
  - `LookTest` (8): .cube parsing order; broken cubes rejected with a message (8 cases); identity look leaves pixels exactly unchanged; tetrahedral reproduces affine LUTs; intensity 0 is a no-op; tone table is monotone and roll-off works; all 12 shipped looks parse and stay in range; grain and vignette are deterministic.
  - `WatermarkLayoutTest` (6): percentage layout math in landscape, portrait and other resolutions; slots stay inside the canvas; fields are omitted correctly; shutter formatting.
  - `ProcessingQueueTest` (9): happy path, idempotent enqueue, backoff then FAILED, non-retryable failure, recovery after process death, crash-loop cap, publish retry keeps the output, illegal transitions, pruning.

## Pending: device verification (phone was not connected)

- `gradlew :pipeline:connectedDebugAndroidTest` runs `LookDeviceTest`:
  - native vs reference (max channel difference ≤ 1)
  - shader vs reference through a 2D-input variant of the same program (≤ 2)
  - EXIF-rotation frame test
  - **perf at 12 / 48 / 64 MP**, logged as `PERF ...` under tag `LookDeviceTest`, split into decode, look, frame and encode times. Targets are under 1 s at 12 MP and under 3 s at 64 MP.
- Manual checks:
  - install `app-debug.apk` and pick 3 looks; check the preview look and the fps logcat line (`LookSurfaceProcessor`, target ≥ 30 fps)
  - shoot and confirm the gallery item is replaced by the rendered copy with EXIF intact
  - kill the app mid-queue and confirm the original survives and processing resumes on relaunch
  - confirm the notification disappears once the queue drains
  - check whether Night/Bokeh extension modes are compatible with the preview effect
- Per-photo timings are logged at runtime as `ProcessingService: Job N WxH ... total=… ms`.

## Merge notes: shared files touched

- `gradle/libs.versions.toml`: added `androidx-test-runner` and `androidx-test-ext-junit`.
- `app/build.gradle.kts`: `implementation(project(":pipeline"))` inside the existing generateBp guard.
- `app/src/main/AndroidManifest.xml`: FGS and notification permissions, plus the `.processing.ProcessingService` entry.
- `app/src/main/res/layout/activity_camera.xml`: `lookButton` in the secondary top bar and `lookPickerView` above it.
- `app/src/main/res/xml/root_preferences.xml`: android namespace and a "Looks and frames" category.
- `CameraViewModel.kt`: `lookController` field, `onPhotoSaved` call in `onImageSaved` (non-RAW only), release in `onCleared`.
- `CameraActivity.kt`: 2 view lookups, `setupLookPicker()`, `onResume` refresh, `resumeIfPending` after the controller attaches.
- `pipeline/build.gradle.kts`, `pipeline/src/main/cpp/CMakeLists.txt`: a separate `opencamera_looks` library, so it should not conflict with phase 4's native code. `REUSE.toml`, `LICENSES/CC0-1.0.txt`.

## Deviations / limits

- Room and WorkManager were replaced by plain SQLite and a service. This avoids new Gradle plugins and dependencies, and the behaviour is the same.
- Processing needs API 29+ (`IS_PENDING`). Below that, photos are saved unprocessed.
- Soong `Android.bp` does not yet include `:pipeline` Kotlin sources or `libopencamera_looks`; this is needed before an AOSP build.
- Not done from the phase file: the look editor (custom looks, user `.cube` import), Polaroid/Minimal templates, bundled fonts (system sans is used), and a user logo.
- Notification permission is not requested at runtime. The service still runs, but on Android 13+ the notification stays hidden until permission is granted.
- Ultra HDR: the gain map survives without a frame but is dropped when a frame is added.

## Unresolved questions

1. Should the original be kept as a separate file (a "keep original" option) instead of being replaced?
2. Is the look editor and `.cube` import wanted in this phase or the next?
