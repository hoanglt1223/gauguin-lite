# Open Camera phase 11: retouch tools

Date 2026-11-11 (Asia/Saigon). Worktree `D:\Projects\open-camera-wt\phase11-retouch`, branch `feat/phase11-retouch`, commit `1f146d3` (not pushed).
Gates: `gradlew assembleDebug test lint` green. `app:generateBp` shows no diff beyond the hand-added `libopencamera_retouch` jni lib. 22 new unit tests pass.

## What was built

The tools are an editor-tool API in `pipeline/.../pipeline/retouch/`. The host UI is in its own package, `app/.../app/retouch/`.

| Piece | File(s) |
|---|---|
| API: `RetouchTool` (mask/tap/slider input → `RetouchResult` with bitmap, `UndoPatch`, method, tags, resolved params), `RetouchParams` (normalized, JSON) | `RetouchTool.kt` |
| `RetouchStack` (JSON ops, undo/redo, versioned) and `RetouchSession` (working bitmap, undo patches with a memory budget, rebuild by replay) | `RetouchStack.kt` |
| `RetouchToolbox`: registry, `replay()` (a failing op is skipped, never crashes), big-lama download, `LensProfiles`, `RetouchExif` | `RetouchToolbox.kt` |
| Object/person removal: `EraseTool` (brush + unbrush + tap-select), `SelectionMasker` (person via selfie segmenter → salient object via U2-Net-p if downloaded → colour region grow), `Inpainter` (square crop, 512 for the models, feathered composite inside the grown mask only). Chain: MI-GAN → PatchMatch → Telea; big-lama → MI-GAN → …; spots < 1 % → Telea | `EraseTools.kt`, `Inpainter.kt` |
| Blemish: DoG spot detection at the tap, Telea for small spots, PatchMatch + Poisson membrane seam fix (healing) for larger ones | `EraseTools.kt`, `cpp/retouch/patchmatch.cpp`, `poisson_blend.cpp` |
| Skin smoothing: guided filter base + 2-band frequency separation inside the face-mesh skin mask (oval minus eyes/brows/lips, × YCrCb skin likelihood) | `FaceRegions.kt`, `FaceTools.kt`, `freq_sep.cpp` |
| Red eye (auto from iris landmarks or tap), teeth (inner lip polygon, Lab b*↓ L*↑, capped), eyes (iris L* + local contrast, hue unchanged) | `FaceTools.kt`, `face_color.cpp` |
| Reshape (off by default, never automatic): slim face ≤ 8 %, eyes ≤ 10 %, nose ≤ 8 %, liquify push/bloat/pinch. Landmark Gaussian-MLS displacement field on a coarse grid, native warp, background-line bend check (Hough) that shrinks the radius. Tag `reshape` → EXIF Software/ImageDescription/UserComment | `ReshapeTool.kt`, `mls_warp.cpp` |
| Geometry: auto level (weighted-median tilt that must agree), auto perspective (vanishing point → keystone), manual angle/keystone, crop to the largest upright rectangle, lens distortion from Camera2 `LENS_DISTORTION` + intrinsics (looked up by EXIF focal length; skipped when the HAL already corrects distortion) or a manual k1 | `GeometryTool.kt` (OpenCV) |
| White balance: tap neutral, gray world, white patch, shades of gray, gray edge. Gains are stored in params | `WhiteBalanceTool.kt` |
| Comparison grid (2–4 cells, failures removed, tap → before/after divider, double tap 2x zoom, "Use …") | `app/retouch/CompareGrid.kt`, `RetouchViews.kt` |
| Host screen `RetouchActivity` (EDIT/SEND image/jpeg; `@bool/retouch_enabled` rollback flag): tools, sliders with live preview, hold for original, undo/redo, save. Asks before the big-lama download (size, URL, licence); declining uses MI-GAN | `app/retouch/RetouchActivity.kt`, `strings_retouch.xml` |
| Export: MediaStore photos go through the processing queue (`AiOps.retouch` = stack JSON, replayed upright at full resolution, new copy kept next to the source). Other URIs use the same stage inline | `AiOps.kt`, `ProcessingService.kt` |

## Models and licences

| Model | Delivery | Licence (checked) | SHA-256 |
|---|---|---|---|
| MI-GAN `migan_pipeline_v2.onnx` 28,079,181 B (HF andraniksargsyan/migan) | bundled `ml/assets/models/migan` | MIT (LICENSE file read; it does not name the weights explicitly, recheck per release) | `6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b` |
| big-lama `lama_fp32.onnx` 208,044,816 B (HF Carve/LaMa-ONNX, from advimman/lama) | optional download, `models-v1` | Apache-2.0 (model card + upstream) | `1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6` |

- **For the controller:** upload `C:\Users\nguye\Downloads\camera-test-apks\models-v1\lama_fp32.onnx` to release `models-v1`. The URL in `model.json` is `.../releases/download/models-v1/lama_fp32.onnx`.
- NOTICE, `docs/models.md` and REUSE.toml are updated.
- **Face restoration:** skipped. No clean-licence model exists (CodeFormer is non-commercial; the GFPGAN/RestoreFormer weights come from FFHQ/StyleGAN2). This is recorded under Excluded.
- **FFCC and HDRNet:** not ported. There are no openly licensed trained parameters or data. White balance uses the four statistical estimators plus tap, all shown in the grid.

## Device evidence (gauguin c28004a8)

The build was installed as `dev.opencamera.app.p11`. Another agent kept reinstalling `.dev` and running its camera app (`.skins`) at the same time, with load average about 4. Timings are therefore noisy.

Runs used a debug build and are the median of 10 for preview / 3 for full. They were started with `am start ... --es retouch_benchmark all`. The results are also written to `files/bench/results.txt`.

Images:
- portrait 1469x2048 preview / 2934x4090 (12 MP upscale) full
- architecture 1172x2048 / 2816x4920 (13.9 MP)
- inpainting 1536x2048 / 1920x2560

| Op | Preview | Full | Target |
|---|---|---|---|
| Skin smoothing | 143–151 ms | 464 ms | <150 ms / <1.5 s ✓ (borderline) |
| Blemish (one tap) | 16–47 ms | 112–378 ms (heal path at full) | <50 / <200 ms: preview ✓, full partly |
| Red eye / teeth / eyes | 1–2 / 2 / 9–10 ms | 2 / 2 / 28 ms | ✓ |
| Reshape (CPU warp) | 96–114 ms | 146 ms | GPU ≥30 fps: **not met** (about 10 fps on CPU); <1 s ✓ |
| MI-GAN (512 crop, ORT CPU 4 threads) | 2.09–2.23 s | 2.8–3.2 s (6.4 s under load) | <1.5 / <2.5 s: **not met** |
| PatchMatch (512) | 1.15–1.28 s | 1.9–3.2 s | fallback only |
| Telea (large hole) | 0.36–0.41 s (the 2 s outliers were measured before the 512 cap) | was 1.8–7.3 s; cap to 512 added after the run (not re-measured) | fallback only |
| White balance gray world | 96–122 ms | 137–683 ms | ✓ / ✓ |
| Auto level + perspective | 107–160 ms | 114–607 ms | <200 ms / <1 s ✓ |
| big-lama | not measured: the release file does not exist yet | — | <8 s |

Other checks:
- **Texture:** skin smoothing at the default strength keeps 85 % of the high-frequency energy inside the skin mask (criterion ≥ 50 %).
- **Replay:** reopening the JSON stack and replaying it gives PSNR 99 dB, i.e. identical (criterion > 45).
- **Non-destructive:** the source SHA-256 is unchanged after a full export (skin + slim + erase).
- **Metadata:** the exported JPEG carries `Software … (retouch: reshape)`, `ImageDescription` and `UserComment`. The test file was deleted afterwards.
- **Fallbacks:**
  - Injected MI-GAN `OutOfMemoryError` plus a PatchMatch exception ends in Telea, with no crash.
  - A corrupt big-lama file (right size, wrong hash) is detected and deleted, and removal falls back.
  - With big-lama not downloaded the tool reports "lama unavailable".
- **Crashes found and fixed during the run:**
  1. PatchMatch SIGSEGV (dangling reference after the pyramid vector reallocated).
  2. MI-GAN "MISSING": the APK compressed `.onnx`. Fixed with `noCompress` in the app, plus a copy-out fallback in `ModelRegistry` for builds that compress (Soong).
- **Skin close-ups:** the three skin close-up images have no detectable face (extreme crops). The face tools report "no face found"; blemish and erase still work.
- **Geometry:** on the portrait, auto level picked a false 5–6° tilt. An agreement check was added afterwards (≥ 50 % of line length within 1.5°) but was not re-measured on the device.
- **iQOO:** not tested.

## Shared files touched (merge notes)

- `ml/OrtBackend.kt`: uint8 tensor in/out (MI-GAN).
- `ml/ModelRegistry.kt`: copy-out fallback for compressed bundled models.
- `pipeline/ai/AiOps.kt`: new `retouch` field; `AiStage` replays it first and exposes `retouchTags`.
- `ProcessingService.kt`: writes the retouch EXIF tags after render.
- `app/build.gradle.kts`:
  - `noCompress onnx/tflite`
  - optional `-PopenCamera.debugSuffix=.p11`, so test builds do not overwrite other branches' `.dev`
- `AndroidManifest.xml`: `RetouchActivity`.
- `CMakeLists.txt`, `pipeline/Android.bp`, `app/Android.bp`: new `libopencamera_retouch` (16 KB pages, static libc++).
- NOTICE, REUSE.toml, `docs/models.md`.

## Integration points for phase 12 (editor shell)

- **Host:** keep a `RetouchSession(previewBitmap, RetouchToolbox(ctx))`, or call `tool.apply(bitmap, params)` directly. Undo uses `RetouchResult.undo`.
- **Edit list:**
  - Store `RetouchStack.toJson()` inside the EditStack; persist `result.resolved` params, not the user's raw ones.
  - Export with `RetouchToolbox.replay(uprightFull, ops)` or `AiOps(retouch = json)`.
- **Tools and grid:**
  - Tool ids: `erase, blemish, skin, redeye, teeth, eyes, whitebalance, geometry, reshape`.
  - `methods()` drives the grid.
  - `CompareGrid` is generic and can be reused for denoise, upscale and auto-enhance.
- **XMP:** `RetouchTags` (`reshape`, `generated`) should map to XMP history; only EXIF is written today.
- **Not done here (phase 12 or later):** markup, sky, relight, background blur and auto-enhance in the editor.

## Remaining

1. MI-GAN misses the 1.5 s preview target (2.1 s on CPU). Ideas: ORT thread count tuned to the 2 big cores, or an fp16/XNNPACK build.
2. Reshape runs on the CPU at about 10 fps; a GLES warp is needed for 30 fps.
3. big-lama timing needs the release upload, then a re-run.
4. Re-measure Telea and geometry after the late fixes, on an idle phone with a release build.
5. Measure the quality set (30 removal images vs Telea).
6. The UI was not exercised by touch; only the benchmark entry point ran on the device.

Status: DONE_WITH_CONCERNS
