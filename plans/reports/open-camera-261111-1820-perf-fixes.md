# Open Camera: performance fixes (main thread, rebinds, memory, editor, latency audit)

Date: 2026-11-11 (Asia/Saigon). Repo `D:\Projects\open-camera`, branch `main`, from `92e7f22` to `b6d03a1`. Nothing pushed.
Inputs: `audit-261111-1723-main-thread.md`, `audit-261111-1723-memory.md`, `audit-261111-1723-latency.md` (added mid-task), `open-camera-261111-1628-merge-wave3.md`.
Debug APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-perf-debug.apk` (package `dev.opencamera.app.dev`).

## How it was measured

- Device: gauguin `c28004a8`, a dark room. A non-debuggable variant was used for timings: a temporary `isDebuggable = false` toggle in `app/build.gradle.kts`, never committed, with package suffix `.perf`.
  - `before-perf.apk` was built from `92e7f22`; the after APK from the final tree.
  - Both were installed under the same package, one after the other.
  - `dev.opencamera.app.perf` was uninstalled at the end.
- Scripts (outside the repo):
  - `D:\Projects\gauguin\.tools\perf\measure.ps1` (camera) and `editor.ps1` (editor).
  - Each camera scenario starts from `pm clear` plus permission grants, so the UI state is the same every time.
  - Frame numbers come from `dumpsys gfxinfo` (reset before each scenario). Memory comes from `dumpsys meminfo`.
  - Bind times come from the new `OcPerf` log line ("bind <reason> <ms>").
  - Raw outputs: `.tools\perf\before2.txt`, `before3.txt`, `after2.txt`, `after3.txt`, `ed-before2.txt`, `ed-after2.txt`, `strict.txt`.
- The app was force-stopped and the phone sent home after each session. The iQOO was not used.

## Results (before → after, non-debuggable, gauguin)

| Scenario | Before | After |
|---|---|---|
| Cold start TotalTime (median of 5) | 513 ms | 508–516 ms (no change; the variance between runs is ±100 ms) |
| Idle camera screen, 10 s | 15 frames | 16 frames (see C1 below) |
| Flash, 6 taps | p50 24 / p95 77 / p99 109 ms, 24 % janky | 12 / 48 / 57 ms, 9 % janky |
| HDR, 6 taps | 13 / 36 / 81 ms, 6 % | 11 / 31 / 46 ms, 6 % |
| Motion photo, 6 taps | 8 / 18 / 93 ms | 12 / 29 / 40 ms (no rebind before or after; noise) |
| Photo ↔ Night, 3 cycles | p50 65 / p95 89 ms, **82 % janky** | 16 / 61 ms, 9 % janky |
| Looks sheet, 4 open/close | 8 / 61 / 85 ms, 12 % | 10 / 48 / 69 ms, 6 % |
| More sheet, 5 open/close | 17 / 113 / 200 ms, 16 frames ≥100 ms | 17 / 34 / 101 ms, 3 frames ≥100 ms |
| Photo ↔ Video, 20 swipes | p50 81 / p95 105 ms, **65 % janky**, 16 frames ≥100 ms | 15 / 57 / 101 ms, 8 % janky, 11 frames ≥100 ms |
| Photo → Video → Pro and back, 4 cycles | 20 / 113 / 150 ms, 25 frames ≥100 ms | 14 / 53 / 105 ms, 11 frames ≥100 ms |
| Photo ↔ Portrait, 4 cycles | 25 / 150 / 150 ms, 16 frames ≥100 ms | 17 / 73 / 113 ms, 7 frames ≥100 ms |
| Binds per Photo↔Video switch | 2 (a redundant stream rebind 160 ms after each switch) | 1 (20–30 ms on main) |
| Night shot in the dark (6 RAW frames, t = 1 s) | capture **126 s** (latency audit) | capture **15.2 s** + processing 4.7 s |
| Camera PSS after the run | 256–299 MB | 245–447 MB (after: a Night burst had just run; Java heap 206 MB held by the burst) |
| Editor open, fresh JPEG (first frame) | 501 ms | 459 ms |
| Editor open, photo with 1 MI-GAN step | engine ready **2936 ms**, MI-GAN loaded, PSS 724 MB | first frame **338 ms**, "Retouch result from cache", no model, PSS 213 MB |
| Slider drag (exposure dial, 8 drags) | p50 34 / p95 69 ms, 31 % janky; draft render 1800×2400, 46 ms | **24 / 32 ms, 14 % janky**; draft 1080×1440, 22 ms |
| Object removal (grid, MI-GAN) | 2.76 s, PSS 860 MB, native 580 MB | 3.55 s, **PSS 409 MB, native 128 MB** |
| meminfo after the retouch is picked | PSS 876 MB / native 577 MB | 375 MB / 90 MB |
| meminfo after closing the editor | 668 MB / 571 MB | **158 MB / 59 MB** |
| …40 s later | 620 MB / 531 MB | 147 MB / 57 MB |
| RAW export (Pixel 3a DNG), peak PSS | 701 MB | 645 MB |
| RAW open (engine ready) | 1214 ms | 1196 ms |

## What changed, per task item

1. **Rebind storm** (`CameraActivity`, `CameraViewModel`, `LookController`).
   - Every toggle collector now posts to one request flow. Requests within 150 ms collapse into one check, and the camera rebinds only when the stream key (analysis, stream config, OEM feature) really changed. The bind runs in its own frame (`awaitFrame`).
   - Flash, EV and zoom were already applied through the controller; they no longer cause rebinds.
   - The bound key is recorded for every bind (Video included). This removed the second bind on each mode switch.
   - A change made while a photo is being taken is kept, newest wins, and applied when the camera is idle. A "Will apply when capture finishes" toast is shown (en and vi).
     - This covers flip, lens, aspect, effect, video quality/fps/HDR and mode.
     - While recording video, a change is still refused, so the mode does not switch by surprise after the user stops.
   - `bindCameraUseCases` never runs outside IDLE, so the `require(IDLE)` no longer falls into the OEM/baseline fallback (main-thread audit #19).
   - The first bind waits at most 300 ms for the look LUT (was 1200 ms).
   - Look → Original keeps the effect attached in pass-through mode (`setLook(null)`), so it is no longer a session rebind.
2. **Off the main thread.**
   - **Portrait, scene and composition frames:** a 480 px asynchronous `PixelCopy` into a reused bitmap. The copy completes on a `preview-copy` HandlerThread (`ui/views/PreviewFrames.kt`). Pro assists and the Glass sheet backdrop use the same path; `previewSnapshot()` is now `suspend`.
     - Deviation: frames do not come from ImageAnalysis. The controller's single analysis stream is the full-resolution YUV stream for bursts. Adding a 480 px analysis stream would change every session layout and the fallback chain.
   - **VideoModesActivity:**
     - Recorder capabilities, the HEVC codec scan and the high-speed configs are probed on Default and cached per process.
     - Binds are scheduled in a later frame. Option taps are debounced by 200 ms.
     - A failed mode drops to the next one in a later frame, not recursively in the same frame.
     - The Pro LOG LUT loads on IO.
   - **ProcessingService:**
     - The worker runs on `IO.limitedParallelism(1)`.
     - The 250 ms poll is replaced by a wait on a "changes" flow, the burst-pending flow or the next due time.
     - Pending jobs come from an indexed query (DB v3 adds an index on `(state, next_attempt_at)`). `onStartCommand` reads nothing from the DB.
     - Enqueue after each photo and `resumeIfPending` run on IO.
   - **Capture intent:** the preview decodes on a background thread with `inSampleSize`; the inline result decodes at the size it needs.
   - **LooksRepository:**
     - The descriptor list is cached.
     - The package info and directories are resolved lazily.
     - The look list is warmed on IO when no look is set.
   - **Sensors:** the gyroscope (`GyroSensor`, `MotionMeter`) runs on a shared `sensors` HandlerThread. `TripodDetector` and `SweepGuide` are synchronized.
   - **Smaller fixes:** the vendor-tag crash marker `commit()` runs on IO. The ColorMatch `.cube` text is built on IO.
3. **Compose.**
   - Zoom ratio and recording time moved out of `CameraUiState` into `LiveUiValues` (snapshot state via `LocalLiveUi`).
     - The zoom dial reads the ratio in the draw phase.
     - Only `ZoomLabel` and `RecordingPill` recompose.
   - `CameraUiState` is `@Immutable`.
   - Not done:
     - Recomposition counts were not checked with Layout Inspector (no interactive session). The frame numbers above are the evidence.
     - The rest of the overlay still takes the whole state.
4. **Memory** (branch `feat/perf-editor`, merged in `56acc67`).
   - **MlRuntime:** models are released on `onTrimMemory`, when the editor is left, and after 30 s idle. ORT runs without the CPU arena or memory patterns; the model buffer is passed without a copy. LiteRT/ORT reuse their buffers.
   - **Retouch raster cache:** keyed by SHA-256 of the source, proxy size and steps; LRU, 200 MB.
   - **Recycling:** the comparison grid recycles unpicked results.
   - **RAW:** develops at half size when it is ≥4× `MAX_PIXELS`, and is rotated during conversion.
   - **LookSurfaceProcessor:** `eglTerminate` is replaced by `eglReleaseThread`.
5. **Editor sliders.**
   - Draft frames render at ≤1440 px while dragging, with no extra `glFinish`; the full proxy renders on release.
   - p95 went from 69 to 32 ms. The 16.6–20 ms target is **not** met.
   - The latency audit puts the rest in UI recomposition and draw (`draw-VRI`), not GL.
6. **Photo ↔ Video.**
   - CameraX must still be configured on main. The bind is 20–30 ms on main (`OcPerf`), with one bind per switch instead of two.
   - The freeze frame is transparent until the copy lands, and then cross-fades into the live preview (180 ms).
   - Use cases were not pre-created. With `CameraController`, every setter restarts the session, so unbind → configure → bind remains the cheapest order.
7. **StrictMode and watchdog** (`DebugDiagnostics.kt`, debuggable builds only).
   - `detectAll` on thread and VM policies, log penalty only. A main-thread watchdog logs the stack under `MainWatchdog` when main is blocked for more than 500 ms.
   - Findings in camera → mode switches → More → shot:
     - Disk reads in the `CameraViewModel` constructor: LooksRepository dirs (fixed), `CameraSoundsUtils`, `ProSettingsStore` prefs.
     - The watchdog caught the debug-build VM construction (685 ms, class loading under the interpreter).
     - Leaked closables are in platform code (`SurfaceControl`).
     - The other violations come from other apps' processes.

### Latency audit items

- **C1, idle redraw:** the shutter's `rememberInfiniteTransition` now runs only while busy. It is an `Animatable` read in the draw phase.
  - On this build the idle camera already showed only 15–16 frames in 10 s before the fix. The 47 fps that the audit measured on the `.dev` debug build did not reproduce in the non-debuggable variant.
- **C2, AI getBitmap on main:** removed (item 2).
- **C3, MotionPhoto copy:** bulk row reads into a reused array instead of `ByteBuffer.get(index)` per pixel. It still runs only while motion photo or pre-shot is on.
- **Night/Astro via RAW:**
  - RAW burst frames above 250 ms are capped at 250 ms, and ISO is raised up to the sensor maximum. Control waits went from 3 s to 1 s.
  - Night (6 frames, 1 s): capture 126 s → 15.2 s.
  - Astro from the snackbar is now one shot: the previous setting comes back after the next capture.
  - Back in a creative mode turns the mode off instead of closing the camera (which had cold-started it again).
- **C4, thread pools:** checked. The VM and multi-frame executors are shut down in `onCleared`/`release`. The `pool-N` threads that keep running belong to a destroyed activity finishing queued work, not a leak. Unchanged.

## Tests and gates

- `.\gradlew.bat assembleDebug test lint` was green after each batch (4 runs, the last after `b6d03a1`).
- New unit tests:
  - `RawExposureCapTest`.
  - `RetouchCacheTest` (on the editor branch).
- `logcat -b crash`: nothing from `dev.opencamera.app*` during the sessions.

## Shared files touched (merge notes)

`CameraActivity.kt`, `CameraViewModel.kt`, `ui/overlay/{CameraUiState,CameraOverlay}.kt`, `processing/{ProcessingService,LookController,LooksRepository}.kt`, `pipeline/queue/*` (DB version 3), `video/VideoModesActivity.kt`, `multiframe/MultiFrameCaptureController.kt`, `modes/MotionPhoto.kt`, `ApertureApplication.kt`, plus the editor/ML files listed in `56acc67`.

## Concerns

1. **Night RAW is darker when ISO is already at its maximum.** In this shot ISO was 6400 → 6400, so a 250 ms frame gets a quarter of the light. The merge and finish recover some of it, but the saved photo was not checked. A real fix is a Camera2 `captureBurst` with the long exposure only on the still requests, with the preview kept at 30 fps. That needs a Camera2 path next to CameraX and a user decision. The audit asks the same question.
2. **MI-GAN takes about 0.8 s longer** (2.8 → 3.5 s) with the ORT arena off. In exchange, memory during removal drops from 860 to 409 MB. Models also reload after 30 s idle or after the app goes to the background.
3. **Targets not met:**
   - Slider p95 is 32 ms (target 16.6–20).
   - Mode switches still have 7–11 frames ≥100 ms per run, from the CameraX reconfigure and the HAL session.
   - Cold start is unchanged.
4. Recomposition was not checked with Layout Inspector or composition tracing. Only the deeper overlay slicing (per-section state) remains; it was not done.
5. Not done from the audits:
   - Pro panel cost (2.6 s main).
   - Skin switch recreate.
   - Lens 0.6↔1 rebind.
   - More sheet lazy grid.
   - Export main-busy after save.
   - A preset-save failure only logs (from the editor branch).
6. The worktree `D:\Projects\open-camera-wt\perf-editor` and branch `feat/perf-editor` remain (merged).

## Unresolved questions

- Should Night/Astro RAW move to a Camera2 `captureBurst`, or should Night use the YUV stream when the frame time is above 250 ms?
- Is a 0.8 s slower MI-GAN acceptable for about 450 MB less memory, or should the arena stay on with release on exit only?
