# Open Camera phase 10: creative modes

Date 2026-11-11. Worktree `D:\Projects\open-camera-wt\phase10-creative`, branch `feat/phase10-creative`.
Commits: `8f70a87` (feature) and a follow-up fix commit. Nothing is pushed.

## What was built

| Feature | Where | Status |
|---|---|---|
| Colour match (Reinhard in Oklab → per-channel histogram → sliced optimal transport) | `pipeline/.../creative/ColorTransfer.kt`, `ColorSpaces.kt` | Done |
| 33³ LUT bake with skin protection (Oklab hue/chroma/lightness gate) | `ColorTransfer.bake` | Done |
| Fallback chain: SOT → histogram → Reinhard → identity (degenerate, NaN, flat or tiny inputs) | `ColorTransfer.build` | Done, unit tested |
| User looks in `files/looks/user/<id>/look.json + lut.cube` | `looks/UserLookStore.kt`; `LooksRepository` lists them | Done |
| `.cube` export (`CubeWriter`) and import (existing `CubeParser`) | `Lut3d.kt`, `ColorMatchActivity` | Done |
| Colour match UI | `app/.../modes/ColorMatchActivity.kt`, entry "+ Match colours…" in the look strip and the share sheet (ACTION_SEND image/*) | Done |
| UI details: method choice, skin toggle, 0–100% strength (baked into the saved LUT), hold the preview to compare before/after, name, save and select for camera, apply to gallery photos (batch) | same | Done |
| Native stacking: mean (long exposure), max (light trails), median (passer-by removal), focus (focus stack), moon (lucky imaging + average + Richardson–Lucy, ≤15 iterations with a clamped step, + unsharp mask). Uses phase 4 `alignTiles`. | `pipeline/src/main/cpp/stack/` + JNI `nativeStack`, `nativeRankSharpness` | Done |
| Moon detection: bright-blob circle fit with fill, compactness and ring contrast checks (not a Hough transform). Suggestion snackbar at zoom ≥ 2x. | `creative/MoonDetector.kt` | Done |
| Moon capture: spot AE/AF on the disc, −1 EV, 2 s delay, shake warning from the gyro. No texture and no generative model. | `modes/CreativeCaptureController.kt` | Done |
| Creative modes: long exposure, light trails, remove people (frames 10 apart), focus stack (manual focus sweep in diopters), sports burst (3 sharpest frames) | same, plus a "Creative" button in the top bar | Done |
| Motion photo: 1.5 s before / 1 s after, H.264 via MediaCodec, Google Motion Photo XMP (+ MicroVideo keys); the clip is kept when the look queue re-renders the JPEG | `modes/MotionPhoto.kt`, `creative/MotionPhotoFormat.kt`, `ProcessingService.carryOverMotionPhoto` | Done |
| Pre-shot buffer: up to 5 analysis frames from before the shutter, saved as photos | `MotionPhotoController.savePreShot` | Done |
| Star timelapse: `TimelapseFrameSink` interface + `StarTimelapseAdapter` (Astro merge per frame, raw-frame fallback). No UI. Hyperlapse is left to phase 6. | `modes/StarTimelapse.kt` | Interface only |

### Never-crash paths

- Every creative capture failure, including native `Error`s and session rebinds, ends in a toast and a regular photo. A rebind during a burst (`OperationCanceledException`, seen on device when the look effect attaches) is retried once.
- When a stack fails, the sharpest single frame is used.
- A frame-tap exception removes the tap; the camera keeps running. This was seen on device and fixed: the tap read `zoomState` off the main thread.
- Motion photo or pre-shot failures keep the still. A clip that cannot be carried over keeps the rendered still.
- Colour match: decode, learn and render failures show a message. The native renderer falls back to the Kotlin LookMath.

## Bugs fixed in shared code (merge notes)

1. **`NativePipeline` `internal external` functions were name-mangled** (`nativeCreateBurst$pipeline_debug`), so the JNI symbols never resolved. Phase 4 bursts would throw `UnsatisfiedLinkError` the first time they really ran, which crashed the app because only `Exception` was caught. The functions are now public, and burst/creative capture paths catch `Throwable`.
2. `MultiFrameSaver`: `File.createTempFile("mf", …)` throws, because the prefix must be at least 3 characters. Every merged save would have failed. Changed to `"merged"`.

Shared files edited, all additive: `BurstAnalyzer` (`frameTap`, `stride`), `MultiFrameCaptureController` (`frameStride` param, `framesThatFit` public, `Throwable` catch), `MultiFrameProcessor.kt` (`Burst.stack`, `rankBySharpness`, `StackOp`, `stackOrFallback`), `NativePipeline.kt`, `pipeline_jni.cpp`, `CMakeLists.txt`, `pipeline/Android.bp` (stack sources), `LooksRepository`, `Lut3d.kt` (`CubeWriter`), `ProcessingService` (motion clip carry-over), `CameraViewModel`, `CameraActivity` (analysis stream bound when multi-frame, creative or motion needs it; `rebindIfAnalysisChanged`), `activity_camera.xml` (3 buttons), manifest (`ColorMatchActivity`).

## Tests

- `gradlew assembleDebug test lint`: green, no lint errors.
- `ColorTransferTest`, with synthetic scenes and a strong "teal and orange" reference. Reduction in Delta E between the colour histograms:

  | Method | Reduction | Required |
  |---|---|---|
  | Reinhard | 61–64% | ≥ 50% |
  | Histogram | 80% | ≥ 50% |
  | Sliced OT | 83–84% | ≥ 50% |

  Also tested: SOT ≤ Reinhard, skin shift reduced by more than 50% with protection on, degenerate inputs give a valid LUT, identical images give mean Delta E < 2, `.cube` round-trip, user look store (a broken look is skipped).
- `CreativeFormatsTest`: moon detection (disc found; flat, day, streak and short buffer rejected; row stride), motion photo build/extract, old XMP replaced, clip carry-over.
- `CreativePlanTest`: plans, tripod means no alignment, focus sweep, fixed-focus camera means no sweep.
- Native `pipeline_test` on gauguin (arm64):

  | Test | Result |
  |---|---|
  | Median | walker error 3.3 |
  | Mean | +8.4 dB |
  | Max | trail kept |
  | Focus | 32.6 → 42.0 dB |
  | Moon | best single frame 30.3 dB → 30.5 dB, not clipped |

  The moon gain on the synthetic test is honest but small. The pre-existing phase 4 test "SR beats single upscale" fails: 36.50 vs 36.28 + 0.25. It is not touched by this phase.

## Device evidence (gauguin c28004a8)

Screenshots are in `plans/reports/open-camera-shots/phase10/`.

- **Colour match** from gallery images through the photo picker: Best (SOT) match in 956 ms. Saved as look `user-…`, a 33³ `.cube` (`device-match.cube`). The look was selected, and the camera preview shows it (`cam3.png`). Captured photos are re-rendered with it, for example a 4000x3000 job in 1.1–1.3 s.
- **Long exposure**: 30 frames 1600x1200 stacked in 1.3 s.
- **Light trails**: 45 frames in 2.2 s.
- **Remove people**: 9 frames in 1.1 s.
- **Focus stack**: 6 focus steps in 1.0 s, result sharp near and far.
- **Sports**: 3 of 20 frames saved.
- **Moon**: 8 of 20 frames kept, 1.5 s. There was no bright round target, so the run went through the "no moon found, frame metering" path. Detection itself is unit tested only.
- **Motion photo**: an 800x592 clip (8 frames, 159 KB), still re-rendered with the look and the clip kept. Google Photos shows the **"Chuyển động" (Motion)** control (`gp1.png`).
- **Pre-shot**: 4 frames saved before the shutter photo.
- Preferences were restored to their original values after testing.

Not tested on device:

- `.cube` export through the system save dialog. It is only covered by unit tests; the tap landed on "Apply to photos" instead.
- The batch result file.
- The iQOO.
- Opening the exported LUT in DaVinci Resolve.

## Licences

There are no new libraries or models. All algorithms are written from published methods:

- Reinhard 2001
- Pitié iterative distribution transfer / sliced Wasserstein
- Richardson–Lucy
- the Laplacian focus measure

The Motion Photo container follows Google's public format spec. No proprietary LUTs or textures are used.

## Concerns / remaining

- On gauguin, bursts run on the 1600x1200 analysis stream, because the HAL caps YUV next to JPEG (the phase 4 gap). Creative results are therefore 2 MP.
- At the default 15 fps target, the motion photo clip has only about 8 frames: the stream is slow when full-resolution analysis is bound.
- Moon mode does not switch to tele or crop with Super Res. The user picks the 2x chip.
- The sports burst picks the sharpest frames, with no subject tracking.
- Hyperlapse belongs to phase 6. The star timelapse UI waits for phase 6 to adopt the `TimelapseFrameSink` interface.
- On cold start, the preview look effect attaches about 12 s after the camera starts and rebinds the session (phase 3 behaviour). Creative capture now retries on it, but the delay itself should be looked at.
- The shared device was reinstalled by other phases during testing, so some runs had to be repeated.
