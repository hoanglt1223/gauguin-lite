# Open Camera phase 5: AI features

Date 2026-11-11 (Asia/Saigon). Worktree `D:\Projects\open-camera-wt\phase5-ai`, branch `feat/phase5-ai`. Commits `bbf7812` and `3c76856`, not pushed. `gradlew assembleDebug test lint` passes: 0 test failures, 0 lint errors.

## What was built

### `:ml` module (reusable by phase 11)

- **Backends** (`InferenceBackend`):
  - LiteRT 1.4.2: CPU with XNNPACK, GPU delegate, NNAPI below API 35.
  - ONNX Runtime 1.22: CPU, NNAPI below API 35.
  - No QNN, as decided for the project.
- **`ModelRegistry`**: reads `assets/models/<id>/model.json`, which holds source, license, size, SHA-256, accelerators, input shape and timeout.
  - Any license outside Apache, MIT, BSD or CC0 is rejected.
  - Bundled models are memory-mapped from the APK.
  - Downloaded models are hash-checked once per process; a file that fails the check is deleted.
- **`ModelDownloader`**: HTTPS only, writes a `.part` file, hashes while streaming, enforces the declared size and moves the file into place atomically.
- **`BackendSelector`**: on first use it benchmarks every candidate accelerator against the CPU output and rejects any with cosine below 0.99.
  - The winner is cached per build fingerprint and model hash.
  - Settings can override it (Auto, CPU, GPU, NNAPI).
  - CPU is always the last fallback.
- **`MlRuntime`**:
  - One thread per model, because GPU delegates are bound to their thread.
  - A 30 s open timeout, separate from the per-inference timeout.
  - Two timeouts, or one out-of-memory error, disable the model for the session.
  - Every failure surfaces as `MlException(reason)`.
  - `benchmark()` is included.
- **`Tiling`**: windows with overlap; the cores tile the image exactly (unit tested). The output can be written at a lower scale to bound memory. The run stops after the first tile when the estimated total exceeds the budget.
- **Task wrappers**: `Segmenter` (selfie, multiclass with hair and skin layers), `FaceMesh` (face detector, 478-point mesh and region index sets), `SceneDetector` with `SceneRules`, `AestheticScorer` (NIMA), `SaliencyDetector` (U²-Net-p, adaptive), `Composition` (thirds and crop), `ImageRestorer` (NAFNet, Real-ESRGAN) and the `Classical` fallbacks.

### `:pipeline`

- **`libopencamera_ai`** (native, 16 KB aligned, static libc++, returns error codes, no exception escapes a worker thread). Operations:
  - guided-filter mask refinement
  - normalized disc-kernel lens blur in linear light with highlight bloom, so the subject never bleeds into the background
  - composite
  - frequency-separation skin smoothing
  - strip-based classical denoise
  - unsharp mask
- **Processors**: `BokehProcessor` (prepare once, re-render for any aperture or focus; a tap on the background swaps focus; a depth-map path is supported), `BeautyProcessor`, `EnhanceProcessor` (model, then classical) and `AiStage`.
- **Processing jobs**: carry ML steps as `AiOps` JSON in a new `ops` column (DB v2 with migration). `StillProcessor` gained a `preStage` hook.

### App

- **Portrait toggle** in the top bar. It is not a new `CameraMode`, to avoid conflicts with phases 6 and 10.
  - Live portrait preview at 480 px, drawn as an overlay.
  - Portrait is rendered in the background on saved photos.
  - The unblurred originals of the last 30 portraits are kept privately.
- **Scene chip** for food, sky, night, document, portrait, plant and text. It needs 2 agreeing detections in a row before it changes. Tapping it applies a preset: Night mode, Portrait, the Vivid look or the Natural look.
- **Composition overlay**: subject, nearest thirds point and a suggested crop.
- **Best shot**: a burst of N in-memory JPEGs; only the best is saved. If the burst fails, a normal capture is taken.
- **Beauty**: a slider, 0 (off) by default.
- **Editor `AiEditActivity`**: opened from a gallery's Edit action.
  - Portrait with an aperture slider and tap to set focus. It reuses the kept original.
  - Beauty, denoise and 2x upscale. Denoise and upscale run as background jobs for MediaStore photos; the result is a copy and the source is kept.
- **Settings "Smart features"**: switches, the accelerator choice, a model list with download and delete, and an on-device benchmark.
- Every feature is either done off the camera streams (on `PreviewView.bitmap`), so it adds no stream and cannot break binding, or guarded: on failure it turns itself off for the session and shows one toast.
- `INTERNET` permission added; it is used only for optional model downloads.

### Soong

- `ml/Android.bp`: `OpenCamera_ml` android_library, pulled into the app through `OpenCamera_ml_defaults`, because the app's `static_libs` list is generated.
- `libopencamera_ai` in `pipeline/Android.bp`.
- `aaptflags -0 tflite/onnx`.
- The LiteRT and ORT AARs are vendored by `generateBp`, about 39 MB under `app/libs/com/...`.
- **Not built with Soong** in this session.

## Models and licenses

All model cards and LICENSE files were checked on 2026-11-11. Hashes are in `docs/models.md`.

| Model | Delivery | License |
|---|---|---|
| MediaPipe selfie segmenter, BlazeFace short range, Face Mesh V2 | bundled | Apache-2.0 (model cards) |
| MobileNetV3-Small (Keras Applications ImageNet weights) | bundled | Apache-2.0 |
| MediaPipe selfie multiclass | download, 16 MB | Apache-2.0 |
| NIMA MobileNet (idealo) | download, 6.4 MB | Apache-2.0 |
| U²-Net-p | download, 4.6 MB | Apache-2.0 |
| Real-ESRGAN general-x4v3 | download, 4.9 MB | BSD-3-Clause |
| NAFNet SIDD width-32 | download, 117 MB | MIT |

- Export scripts are in `tools/model-export/`. Every converted model matches its source model with cosine ≥ 0.99999.
- NOTICE, REUSE.toml and `LICENSES/MIT.txt` were updated.
- The model doc is `docs/models.md` rather than `licenses/models.md`, because on Windows `licenses/` would collide with the REUSE `LICENSES/` folder.
- **The download URL points to `github.com/hoanglt1223/open-camera/releases/download/models-v1/<file>`, which does not exist yet.** The coordinator must publish those 5 files under that release, with exactly the bytes listed in `docs/models.md`.

## Device evidence: gauguin (c28004a8)

Full table: `docs/benchmarks/gauguin-ml.md`.

- **Backends:**
  - GPU matches CPU for every model (cosine ≥ 0.9965; 0.9999 or more for all except the int8 classifier).
  - Multiclass segmenter: 92 ms on GPU vs 461 ms on CPU.
  - The selfie model cannot use the GPU delegate (MediaPipe custom op) and runs on CPU at 14 ms.
- **Portrait:**
  - The 12 MP render (blur + composite) took 275 ms when idle.
  - The full 12 MP process took 0.6–1.5 s, measured while the phone was heavily loaded. Target < 2 s: **met**.
  - First use adds a one-time accelerator benchmark of 10–17 s; the result is cached.
  - The mask covers 38% of the test portrait, and the output was checked visually.
- **Live portrait:** about 10 fps when idle, 2.6–4.7 fps under load. Target ≥ 15 fps: **not met**. The model takes 14 ms; the rest is Kotlin pre- and post-processing.
- **Scene detection:** 57–105 ms per frame. Target < 30 ms: **not met**. It runs once per second in the background, so it does not hold up capture.
- **NAFNet:** about 2.5 s per 256 px tile, 50 s for 1 MP, about 600 s estimated for 12 MP. Target < 10 s: **not met**.
  - With a budget, NAFNet falls back to the classical filter with reason TIMEOUT, as designed.
  - Classical denoise takes 2 s at 12 MP and raises PSNR from 23.6 to 28.5 dB on synthetic noise.
- **Real-ESRGAN:** 25 s for 512 → 1024; classical takes about 0.15 s.
- **Best shot:** NIMA picked the sharp frame over blurred copies.
- **Missing model:** reports `MISSING` instead of crashing.
- **App on the new ROM:**
  - It installed and launched.
  - The live portrait overlay and composition hint appeared (screenshot).
  - The models opened (face detector on GPU, the rest on CPU).
  - The phone was left with portrait and composition off.
- **Bug found and fixed:** the ONNX Runtime XNNPACK provider aborted the process with an uncaught native exception on U²-Net-p. ORT now uses its default CPU provider.

## Shared files changed (merge notes)

- **Build files:** `gradle/libs.versions.toml` (litert, onnxruntime), `app/build.gradle.kts` (`:ml`, plus the runtimes so `generateBp` sees them), `pipeline/build.gradle.kts` (`:ml`).
- **Pipeline:**
  - `pipeline/.../StillProcessor.kt`: `preStage`.
  - `queue/ProcessingQueue.kt`: `Job.ops`, and `enqueue(..., ops)` may replace a finished job with an edit.
  - `SqliteJobStore.kt`: DB version 2, `ALTER TABLE ADD COLUMN ops`.
  - `CMakeLists.txt`: `opencamera_ai`.
- **App:**
  - `ProcessingService.kt`: `AiStage`, `keepSource` (`_edit` copies), portrait originals.
  - `LookController.kt`: `captureOps` provider.
  - `CameraActivity.kt`: `setupAi()`, `takeBestShot()`, the shutter branch.
  - `activity_camera.xml`: 3 overlay views and the portrait button.
  - `root_preferences.xml`, `AndroidManifest.xml` (INTERNET permission, the editor activity).
- **Soong:** `app/Android.bp`, `app/libs/Android.bp`, `pipeline/Android.bp`.
- **Licensing:** NOTICE, REUSE.toml.

## Remaining work and concerns

1. **Live portrait at ≥ 15 fps:** move the resample and pre-processing into native code and reuse buffers.
2. **Scene detection < 30 ms:** run face detection less often and reuse buffers.
3. **NAFNet and Real-ESRGAN:** usable only on crops of about 1 MP or smaller on SM7225. The 12 MP < 10 s target needs a much smaller model, which would have to be trained (out of scope, since no new datasets are accepted).
4. **Depth camera:** gauguin has none, and CameraX cannot stream DEPTH16. The processor accepts a depth map, but no capture path feeds one.
5. **Native aborts:** a native abort inside a model runtime cannot be caught in-process. Mitigations so far: the XNNPACK provider is removed, and every model was benchmarked on the device. Running models in an isolated process would be the complete fix.
6. **Debug APK size:** about 140 MB, because of 4 ABIs and ORT at 18 MB per ABI. ABI splits or filters should be considered.
7. **Test devices:**
   - The iQOO was not tested, per the brief: installing needs the user to confirm on the phone.
   - gauguin is shared. Another session's install killed one benchmark run, and the "Camera configuration is null" crash seen at 12:50 came from someone else tapping the mode selector. It is in existing `CameraViewModel.setCameraMode` code, not in phase 5 code.
8. **Untested:** the editor UI and the scene chip tap were not exercised by hand on the device.
9. **Not done:** `reuse lint` was not run because the tool is not installed.
