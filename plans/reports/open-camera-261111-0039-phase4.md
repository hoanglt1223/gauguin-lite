# Open Camera phase 4: multi-frame HDR, Night, Astro, Super Res Zoom

Worktree `D:\Projects\open-camera-wt\phase4-multiframe`, branch `feat/phase4-multiframe` (not pushed).

| Commit | Content |
|---|---|
| `dfbc5b3` | `:pipeline` native align/merge/finish/super-res, JNI facade, test executable |
| `0893245` | `:capture` `ExposurePlanner`, `TripodDetector`, `MotionMeter` + JVM tests |
| `19d28f4` | `:app` burst capture, background merge, MediaStore/EXIF save, UI |
| `a02d2d8` | aperiodic synthetic test scene, host build of the test, super-res tuning |
| `cb6cb1c` | no burst when the analysis stream is below 6 MP |

Status: code complete and verified on synthetic bursts (host). **Not verified on gauguin**: the phone was not on adb for the whole session (`adb devices` empty; the only tailnet Android, `v2520a`, refuses 5555 and is not gauguin). Device timings and HDR/Night photo comparisons are still open.

## Architecture

- Capture (`app/.../multiframe/`): when the HDR/Night/Astro setting is not OFF, Photo mode binds `IMAGE_CAPTURE | IMAGE_ANALYSIS` with the analysis stream at the highest YUV_420_888 resolution (same aspect ratio). `BurstAnalyzer` meters the scene every 8th frame (mean luma, clipped fraction, plus `SENSOR_EXPOSURE_TIME`/`SENSOR_SENSITIVITY`/`LENS_APERTURE` read from the frame's `CaptureResult`). On shutter, `MultiFrameCaptureController` asks `ExposurePlanner` for a plan, applies exposure through Camera2 interop (AE compensation for HDR/SR; `AE_MODE_OFF` + manual time/ISO/frame duration for Night/Astro), skips frames until the result reports the new exposure, then copies N frames into native memory. Exposure options are restored afterwards; the shutter returns as soon as the frames are in.
- Merge runs on `ProcessingQueue` (interface + local `SerialProcessingQueue`, one job at a time, max 2 pending, so phase 3's queue can replace it). Output: NV21 -> `YuvImage` JPEG q95 -> temp file -> `ExifInterface` (orientation, date, make/model, exposure, ISO, f-number, focal length, GPS when location is on, description such as `HDR 8 frames`) -> MediaStore `DCIM/Camera` with `IS_PENDING`. The VM then emits the existing `ImageSaved` event so the gallery thumbnail updates.
- Fallbacks: merge failure or exception -> first frame saved (`MultiFrameProcessor.processOrFallback`). Burst capture failure or timeout -> regular `takePicture`. Multi-frame is skipped for single-capture intents, the front camera, extension modes, an analysis stream under 6 MP, a busy queue, and when free memory (`ActivityManager.getMemoryInfo`) allows fewer than 2 frames. Free memory also caps the frame count.
- UI: a new button in the secondary top bar cycles HDR off / HDR auto / HDR on / Night / Astro (persisted). A `LinearProgressIndicator` above the bottom bar shows merge progress. A snackbar offers Astro once per session when the gyro says tripod and the estimated scene is below 0.5 lux.
- RAW: not used. Bursts are YUV only; a RAW_SENSOR path (needs demosaic/AWB/CCM in the finish stage) is deferred.

## Algorithms (original code, from published papers)

Native code is in `pipeline/src/main/cpp/mf/`: plain C++17, `std::thread` work-stealing `parallelFor`, `-O3 -ffast-math` auto-vectorised by NDK clang (NEON on arm64). No intrinsics and no third-party code.

1. **Reference**: the sharpest of the first 3 frames (gradient energy at 1/4 resolution).
2. **Alignment** (after Hasinoff et al. 2016): half-resolution luma (2x2 box) -> box pyramid with factors 2, 4, 4. Coarse-to-fine tile search: L2, radius 4 on coarse levels; L1, radius 1 on the finest level (16x16 tiles, stride 8 = 32 px tiles at full resolution). Each tile starts from the best of 3 upsampled coarse candidates. Sub-pixel refinement fits a parabola to the L2 cost. Covers about +/-256 px of motion at full resolution.
3. **Merge**: overlapping 32x32 raised-cosine tiles (stride 16, so the windows sum to 1). Per alternate frame, each half-resolution pixel gets a weight from its 3x3 mean absolute difference to the reference, ramping 1 -> 0 between `low*sigma+2` and `high*sigma+4`. Sigma is a robust noise estimate (MAD of the second difference). Thresholds: HDR 1.5/4, Night 2/5.5, Astro 2.5/7. Luma uses full-pixel displacement; chroma uses the half-resolution displacement. This is the spatial-domain robust variant, not the Fourier-domain Wiener merge.
4. **Finish**:
   - HDR/Night local tone mapping (after Mertens et al. 2007): 3 synthetic exposures (+0, +s, +2s stops in linear light) of a 1/8-resolution luma, fused with a Laplacian pyramid using well-exposedness x contrast weights. The fused/base ratio becomes a gain map, applied at full resolution with joint-bilateral upsampling (range sigma 0.08) to avoid halos. Chroma is scaled by sqrt(gain).
   - Chroma denoise: 5x5 cross-bilateral, strength by mode.
   - Night/Astro hot-pixel suppression: a pixel above max(8 neighbours)+threshold and above 1.5x their mean is set to that max. Stars span several pixels, so they survive.
5. **Super Res Zoom** (after Wronski et al. 2019, simplified, isotropic kernel): used when HDR auto/on and zoom >= 1.8x. HAL frames at 2x zoom are a 2x upscale of the native crop, so the half-resolution luma of each frame is used as native samples. Sub-pixel-displaced samples from all frames are gathered with a Gaussian (sigma 0.3 native px) onto the full grid. A robustness map compares each sample with the bilinear reference. Then an unsharp mask (amount 1.2).

Planner rules (`capture/.../ExposurePlanner.kt`):
- Lux: E = pi * (12.5 N^2 / (t S)) * (meanLuma/118)^2.2 / 0.18.
- HDR auto: Night below 10 lux; Super Res at zoom >= 1.8x; single frame above 4000 lux with no clipping; otherwise HDR.
- HDR: 6 / 8 / 10 frames at >= 400 / >= 50 / < 50 lux, capped at 6 when gyro RMS > 0.2 rad/s. AE compensation -0.7 / -1 / -1.5 EV depending on clipped fraction; the tone-map step equals the underexposure.
- Night: per-frame exposure is blur-limited, `4 px / (gyro RMS x focal px)`, between 33 and 333 ms handheld, 1 s on a tripod. ISO reaches the target brightness (luma 100) up to max(analog max, 6400). Frames = 4 s budget (6 s tripod) / t, clamped to 6..15.
- Astro (tripod only, otherwise Night): t = min(HAL max, 16 s), at least 4 s when the HAL allows. ISO <= 1600. Frames = 64 s / t, clamped to 4..16.
- Tripod: gyro RMS < 0.008 rad/s held for 1.5 s (1 s window).

## Tests and results

- `:capture` JVM tests: 12 tests (`ExposurePlannerTest`, `TripodDetectorTest`), all pass. `gradlew :app:assembleDebug test lint`: green, no lint findings in new files.
- Native `pipeline_test` (`pipeline/src/test/cpp`). It builds for arm64 with the NDK (`-DOPENCAMERA_PIPELINE_TESTS=ON`, `-Wall` clean) and for the host with MSVC. Host results:

| Test | Result |
|---|---|
| Sub-pixel global shift (3.65, -2.3 half-res px), noise sigma 4 | median error 0.088 px, p90 0.160 px |
| Large shift (-61, 38 px full-res) | 475/475 interior tiles within 0.75 px |
| 8 frames, random +/-12 px shifts, noise sigma 8 | PSNR 30.06 -> 37.65 dB (+7.6 dB; ideal for 8 frames is +9.0) |
| Moving bright square in 7 alternates | mean abs error on its path 2.7 (no ghost) |
| SR, 8 frames of a 2x-upscaled native capture | 36.28 dB single bilinear upscale -> 36.55 dB multi-frame |
| Tone map on an underexposed frame with sky at 235 | shadows 70 -> 107, sky 235 -> 245 (not clipped) |

- Timings, host x86-64 (desktop CPU, 8 threads), 4000x3000:
  - HDR x8: 984 ms (align 545, merge 276, finish 158)
  - Night x12: 1362 ms
  - SuperRes x8: 1853 ms

  SM7225 numbers are still needed. Expect roughly 3-4x slower, which would put HDR x8 near the 3 s target; alignment is the first thing to optimise (NEON SAD intrinsics, coarse levels on fewer threads).
- Device (not done): the plan below is ready to run as soon as gauguin is on adb.

```powershell
# native timings on the phone
adb push D:\Projects\open-camera-wt\phase4-multiframe\pipeline\build\native-test\pipeline_test /data/local/tmp/
adb shell "chmod 755 /data/local/tmp/pipeline_test && /data/local/tmp/pipeline_test --perf"
# app: build/install, then shoot HDR on/off and Night in normal light and a dark room
.\gradlew.bat :app:installDebug
adb logcat -s MultiFrame OpenCameraPipeline MultiFrameProcessor   # one line per shot with capture/align/merge/finish/jpeg/save ms
```

Then compare each merged JPEG against an HDR-off shot of the same scene: noise in flat shadows and highlight clipping.

## Licenses

- No third-party code. All pipeline code is new, Apache-2.0 (`Open Camera contributors`). `ic_astro.xml` is drawn from scratch.
- Algorithms are from papers: Hasinoff et al. 2016 (HDR+ burst align/merge), Mertens et al. 2007 (exposure fusion), Wronski et al. 2019 (handheld multi-frame SR), Liba et al. 2019 (Night Sight motion-metered exposure, used only as the idea behind the blur-limited exposure rule).
- Halide (MIT) was not adopted. A Soong + AOT generator toolchain was not worth it for loops that NDK clang already vectorises; the phase plan's `pipeline/src/main/halide/*` layout was therefore not created.
- timothybrooks `hdr-plus` and the IPOL HDR+ code were not consulted or used, so their licenses were not verified.

## Merge notes (for phases 2/3/7)

Shared files touched, kept small:
- `CameraActivity.kt`: 2 view lookups, 1 click listener + lifecycle observer, 3 collectors, Photo branch of `bindCameraUseCases`.
- `CameraViewModel.kt`: `multiFrame` field, a `takePhoto(allowMultiFrame)` guard + `takeMultiFramePhoto()`, release in `onCleared`.
- `activity_camera.xml`: `multiFrameButton` after `timerButton`, `multiFrameProgress` at the end.
- `app/build.gradle.kts`: `:capture`, `:pipeline` inside the generateBp guard.
- `app/Android.bp`: capture/pipeline filegroups + `jni_libs: ["libopencamera_pipeline"]`.

New resources: `values/strings_multi_frame.xml`, `drawable/ic_astro.xml`.

Integration points:
- Phase 3 queue: implement `dev.opencamera.app.multiframe.ProcessingQueue` (`pending: StateFlow<Int>`, `submit(suspend () -> Unit)`) on the shared queue and pass it to `MultiFrameCaptureController(context, queue)`. Phase 3 looks/LUT/watermark should be applied to `MergedImage.nv21` (or to the JPEG) before `MultiFrameSaver.save`.
- Phase 7 (pro/RAW): manual exposure in pro mode should switch the multi-frame setting OFF, or the planner should take the user's ISO/shutter. The RAW burst path would add a `Burst.addRawFrame` and a demosaic finish stage.
- Phase 2 (profiles): `ExposureCaps` comes from Camera2 characteristics; profile quirks (no long exposure, no full-res YUV) should feed `ExposurePlanner`/`plan()`.
- `pipeline/Android.bp` now uses `-fexceptions` (`std::bad_alloc` -> fallback) and `-Werror`.

## Concerns / open questions

1. On-device run still owed: performance on SM7225 (3 s target), whether the MIUI-derived HAL streams 4000x3000 YUV next to JPEG (the 6 MP guard will otherwise disable bursts), AE compensation and manual-exposure latency, and the max exposure the HAL really accepts for Astro.
2. Super Res gain is small (+0.3 dB synthetic) because CameraX applies the zoom crop to the analysis stream, so the input is already HAL-upscaled. A real fix needs an unzoomed full-FOV stream (separate Camera2 session) or a RAW burst.
3. Merge is spatial-domain robust averaging, not Fourier-domain Wiener. Fine for 8-bit YUV; revisit with RAW.
4. `CameraCaptureResults.retrieveCameraCaptureResult` is a restricted CameraX API (`@SuppressLint("RestrictedApi")`); metering falls back to no plan (single frame) if it ever returns null.
