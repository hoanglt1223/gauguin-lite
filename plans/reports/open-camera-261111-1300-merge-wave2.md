# Open Camera: wave 2 merge and fixes (full-res, vendor bridge, AI, video modes)

Date 2026-11-11 (Asia/Saigon). Repo `D:\Projects\open-camera`, branch `main`. 23 commits on top of `05ce9df`. Nothing is pushed.
APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-wave2-debug.apk` (debug, 284 MB, 4 ABIs). It is installed on gauguin as `dev.opencamera.app.dev`.
Final gates: `gradlew assembleDebug test lint` is green. `app:generateBp` shows no diff. `assembleRelease` is green.

## Merges (`--no-ff`, in this order)

| Merge | Conflicts and how they were resolved |
|---|---|
| `169243d` fix-fullres-limits (includes phase 10) | None. Its tree is identical to `bd39c08`, which was already green. |
| `329a499` phase 8 vendor bridge | `CameraActivity`, `CameraViewModel` and `MultiFrameCaptureController`. Details below. |
| `6eaaf3d` phase 5 AI | `app/build.gradle.kts`: kept both `:vendor-bridge` and `:ml`. `AndroidManifest`: kept both `ColorMatchActivity` and `AiEditActivity`. `ProcessingService` imports: kept both sets. |
| `8c79be3` phase 6 video modes | `NOTICE`: union of both. `generateBp` regenerated `app/Android.bp` and `app/libs/Android.bp`. |

The phase 8 merge needed these changes so the phone's processing, the full-res session and the creative modes share one bind chain:

- **Bind**: the full-res path (`FeatureGuard`, demoting RAW → YUV → JPEG) and the vendor bridge (OEM bind failure → mark failed → retry on the open pipeline) are combined in one block. The OEM toast is still shown.
- **Rebind key**: `boundStreams` is now (analysis wanted, `StreamConfig`, bridged OEM feature). One `rebindIfAnalysisChanged` covers HDR setting, creative, motion, flash, cap, OEM and look changes.
- **Stream policy**: `desiredStreamConfig` uses `resolveExtensionMode(cfg)`, so when the phone's processing is picked, the session stays on JPEG.
- **EXIF**: `MergeRunner` labels merged photos `SourcePolicy.label(OPEN, …)`, for example "Open Camera NIGHT 6 frames RAW". The JPEG path writes the OEM label, then embeds the motion photo, then queues the look.

Phase 5 integration:

- Best shot does not run in a full-res session (there is no JPEG ImageCapture) or while a creative/multi-frame shot owns the shutter.
- Portrait and beauty ops ride on `lookController.onPhotoSaved`, which every capture path (JPEG, full-res, creative) calls. That makes it one processing queue. The log shows `ai=[portrait=NoSubject] look=vivid`.

Phase 6 integration:

- The More activity binds its own camera. The bokeh-video segmenter is left unregistered, because the recording path for that mode is not built yet (the mode stays hidden).
- CMake/Soong: `opencamera_ai` (phase 5) and `mf/raw.cpp` (fix branch) are both in `pipeline/CMakeLists.txt` and `pipeline/Android.bp`.

Build note: `app:generateBp` must run on its own. In the same Gradle invocation it switches off the project dependencies, and the first phase 5 build failed because of that.

## Verification on gauguin (c28004a8, new ROM)

The phone was idle: the compile log said "DONE" and load was 0.1. Logcat buffer was set to 16 MB.

### 1. Clean up

- `dev.opencamera.app.fr` and `dev.opencamera.pipeline.test` were uninstalled.
- `.p6` was not installed.
- App data of `.dev` was cleared once, because a left-over RAW format and manual Pro state were forcing the JPEG session.

### 2. Full-res multi-frame and RAW

The sensor is **4624x3472 (16 MP)**, not 4000x3000. On this HAL CameraX streams YUV at **3264x2448** next to preview. `getOutputSizes(YUV)` lists up to 9.0 MP; RAW_SENSOR is 16.05 MP.

New rule (`StreamPolicy.rawLarger`): in AUTO, bursts use RAW when RAW has at least 20% more pixels than YUV. This happens only when **no look is selected**, because CameraX refuses a `CameraEffect` next to RAW capture. Night and Astro use RAW as before.

| Shot (1x unless noted) | Output | Capture | Merge |
|---|---|---|---|
| HDR on, RAW, 10 frames | **4624x3472** | 10.3 s | 6.8 s (align 4.2) |
| HDR, YUV, 10 frames (look active) | 3264x2448 | 2.7–3.0 s | 3.8–4.9 s |
| HDR auto on 0.6x (ultra, YUV) | 3264x2448 (full ultra sensor) | 2.7 s | 3.8 s |
| Night, RAW, 6 × 1 s | **4624x3472** | 50 s (≈8 s per frame) | 4.1–4.7 s |
| Night, YUV, 6 × 1 s (look active) | 3264x2448 | 6.6 s | 2.7 s |
| Super Res 2x, RAW, 6 frames | 4624x3472 from a 2312x1736 crop | 6.1 s | 6.7 s |

- **Issue:** each RAW still at a 1 s exposure costs about 8 s. CameraX ImageCapture waits behind the 1 s repeating requests. Night via RAW works, but it is slow.
- **Fixed:** the 16 MP RAW burst archive ran out of Java heap (`OutOfMemoryError` in `BurstRecovery.archive`). The merge itself still completed. The fix adds `android:largeHeap`.

### 3. Capture callback on the analysis stream

**Root cause, two parts:**

1. CameraX 1.7 on this build runs the **camera-pipe backend** (`CXCP` logs). `CameraController` also rebuilds its analysis use case on provider init and on viewport attach (`unbindAllAndRecreate`, verified by disassembling `CameraController`), which drops the interop callback.
2. A frame's `TotalCaptureResult` arrives after its image, so the one-shot warning fired on frame 0.

**Fix** (`dd27825`):

- `CameraControllerInterop.ensureAttached` re-applies the swap and restarts the camera if the use case was rebuilt.
- The meter falls back to the latest result.
- The warning fires only after 40 frames.

Device result: `Analysis capture results: true` on every launch, and bursts log `measured=true`. The estimate fallback is kept.

### 4. Look cold start

Measured with a Vivid look. Before this work it was about 10 s.

| Build | Process start → Displayed | Displayed → first look frame | Total |
|---|---|---|---|
| debug, JIT | 1.87–2.10 s | 1.39–1.47 s | 3.27–3.53 s |
| debug, `compile -m speed` | 1.57–1.66 s | 1.68–1.74 s | 3.25–3.27 s |

- After the window shows, the first look frame arrives in about 1.4 s, which is the target. The whole 3.3 s from launch is still above target.
- Process and dex start take about 0.45 s on this 284 MB debug APK. The camera open and session take the rest. There is no rebind at start.
- Also fixed: in a RAW session the look effect used to be blocked for the rest of the session. `LookController.setRawSession` now drops it only while that session is bound.

### 5. Super Res preview jump

- **RAW Super Res**: the preview stays at the user's zoom, and frames are cropped afterwards. The 6 s screen recording at 2x shows no jump.
- **YUV fallback**: the HAL is set to 1x and `previewZoomCompensation` scales the PreviewView by the zoom ratio, so the framing stays the same. That code path was not exercised on the device, because the 1x camera uses RAW.

### 6. Smoke test (no crash in the whole session; `logcat -b crash` is empty)

| Feature | Result |
|---|---|
| Photo, HDR auto/on, Night | ok (table in item 2) |
| Lens chips | 0.6 / 1 / 2 now shown. **Fix:** `config_enableAuxCameras` is true, so the profile can map 0.6 to aux camera 3. 0.6 binds and shoots. |
| Looks | Vivid live preview, and the background look job is applied |
| Pro | ISO 1600 shot saved. **Fix:** toggling manual exposure now rebinds to the JPEG session (it used to stay in the YUV session). |
| Portrait | toggled 7 times, with lens and mode switches; no crash. See below. |
| Scene chip | no chip on this desk scene |
| Moon (no moon present) | 20 frames, saved |
| Long exposure (30 frames) and light trails (45 frames) | **Hang found and fixed:** a burst timeout is a `CancellationException`, so the shutter stayed in TAKING_PHOTO forever. Now it is reported as a failure, the timeout allows for slow full-size YUV (about 3.6 fps), and CameraX control waits are capped at 3 s. After the fix: saved in 5.3 s and 10.2 s. |
| Remove people, focus stack, sports | saved (9, 6 and 20 frames) |
| Motion photo | 12 frames at 816x608, video embedded |
| Video | main 1080p30; Pro video 1080p |
| Slow-mo | 1080p, Camera2 high-speed 120 fps |
| Time-lapse and hyperlapse | 1072x1920 |
| Slow shutter | JPEG |
| Time freeze | mp4 |
| Panorama | starts and stops (the phone is static) |
| Document | page captured, PDF exported (10 MB) |
| Dual | hidden (no concurrent pair) |
| QR, front camera | ok. Front photo is 1600x1200, which is the existing resolution choice. |
| AI editor | opened by EDIT intent. It cannot read another app's MediaStore image ("no access"); it fails with a toast and does not crash. |

### 7. Models

All 5 files were reproduced byte for byte from freshly downloaded upstream inputs. Two export runs gave identical results. Every SHA-256 matches `docs/models.md`, so no doc change was needed.

The files are in `C:\Users\nguye\Downloads\camera-test-apks\models-v1\`: nafnet_sidd_w32_256.onnx, nima_mobilenet.tflite, realesr_general_x4v3_128.onnx, selfie_multiclass_256x256.tflite and u2netp.onnx. Reproduction inputs and scripts are in `D:\Projects\.model-repro`.

- NAFNet weights came from a Hugging Face mirror (`nyanko7/nafnet-models`), because the official source is a Google Drive link. The weights hash matches the earlier download.
- `docs/models.md` does not give download URLs for the 4 weight inputs.

### 8. APK size

- Release builds keep only `arm64-v8a` and `armeabi-v7a` (`ndk.abiFilters` in the `release` block). The unsigned release APK is **103 MB** and contains only those 2 ABIs.
- Debug keeps all 4 ABIs: 284 MB.

## Follow-ups from the coordinator

### Portrait flicker

**Cause:** the live portrait ImageView covered the **whole** viewfinder with a 480 px snapshot, refreshed at 5–10 fps. When no subject was found, it showed the unblurred snapshot. The full view therefore looked soft and pulsed. The selfie segmenter also finds "people" in clutter.

**Fix** (`2090ba2`, `8d941f5`):

- Only the blurred background is drawn (`BokehProcessor.renderBackgroundLayer`, alpha = 1 − sharpness), so the subject is the live, sharp preview.
- `MaskStabilizer` adds an EMA over masks (α 0.5) and hysteresis: it shows after 2 frames with ≥ 4% coverage and hides after 3 frames below 2%.
- No subject means no blur.
- Live blur also needs a face (BlazeFace, score ≥ 0.6, checked every 300 ms, held for 1.2 s).
- No rebind loop: the portrait toggle does not rebind.

**Evidence:**

- `open-camera-shots/wave2-portrait-before.mp4` / `-after.mp4` and their strips.
- `wave2-portrait-before-after.png` is the same crop at frame 60: soft before, sharp after.
- Saved photo: `portrait=NoSubject` on the desk scene.

**Not verified:** a live person in front of the camera (none available, and the phone faces a desk). The live and saved blur use the same aperture → radius formula (`BokehMath.radius` relative to the work width).

### Grid

- Added 3x3, golden ratio, 4x4, **diagonal** and **square** (centred square with thirds) to Aperture's `GridView` through `GridGeometry`.
- Quick toggle: the existing grid button cycles all 6. Settings: new "Grid" list (same `last_grid_mode` key).
- Missing preview surface: the grid now skips drawing instead of throwing.
- Screenshot: `wave2-grid-modes.png`.

### Level

- `LevelMath` + `AssistController` replace the old `LevelerView`, under the same "leveler" setting.
- Uses the gravity sensor (accelerometer if there is none), low-passed.
- Horizon line reduced to the nearest 90°, so it works in every orientation.
- Bubble level when |gz| ≥ 0.9 g.
- Green within ±1°, one haptic tick on reaching level, re-armed after 2°.
- The sensor runs only while resumed and enabled.
- Screenshot: `wave2-level-hints-square-grid.png` (the green line is on the device).

### Composition hints

- `CompositionHints`: a move arrow (subject → thirds point, ≥ 8% away), straighten (≥ 3° tilt) and headroom (subject top < 6%).
- Uses the phase 5 saliency at its existing 1.5 s interval, off the camera streams, so preview fps is unaffected (`preview fps 30.0`).
- Off by default; setting "Composition hints". Tapping a hint hides hints for the session.
- An arrow was seen on the device (same screenshot).

### Tests

- `AssistGeometryTest` (10): grid lines for all modes, horizon in 4 orientations, bubble, haptic gate, hints.
- `MaskStabilizerTest` (5).

## Remaining gaps

1. Night via RAW takes about 8 s per 1 s frame (CameraX still pipeline). Fix idea: drop the repeating request to a short exposure during RAW stills, or use direct Camera2 bursts.
2. HDR on 1x is 16 MP RAW without a look but 8 MP YUV with one (CameraX limit on effect + RAW).
3. Cold start is 3.3 s from launch (1.4 s after the window shows). A release build with a baseline profile is untested.
4. Live portrait was not tested with a real person; the AI editor cannot open other apps' photos without the media permission flow.
5. YUV Super Res preview compensation was not exercised on the device.
6. Commit `25a3bd6` alone does not compile, because `previewZoomCompensation` arrives in `45e9b11`. `main` HEAD is green.
7. iQOO was not tested in this wave.

Status: DONE_WITH_CONCERNS
