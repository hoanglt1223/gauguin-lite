# Open Camera: fix full-resolution limits (multi-frame, Super Res, metering, moon, sports, look start, crash-safe merges)

Worktree `D:\Projects\open-camera-wt\fix-fullres-limits`, branch `feat/fix-fullres-limits` (on `feat/phase10-creative`). Not pushed.

| Commit | Content |
|---|---|
| `7d2940b` | native: Super Res on an unzoomed crop, RAW development, luma export, NV21 restore |
| `c7e9b4b` | `:capture` StreamPolicy + measured metering; `:pipeline` SportsPicker, BurstArchive |
| `ae9232b` | app: full-res session, RAW bursts, capture callback, moon tele/crop, crash-safe merges, look before first bind |
| `bd39c08` | auto flash keeps the full-res session; "first look frame" log |

Status: code complete, `gradlew assembleDebug test lint` green, native tests pass on host and on gauguin. **Device verification is partial** (see the end): gauguin came back from reflashing mid-session and was in use by the phase 6 agent (load average ~20, dex2oat running).

## What each fix changed

1. **Dedicated multi-frame session** (`StreamPolicy`, `CameraActivity.fullResUseCases`, `MultiFrameCaptureController`, `CameraViewModel.takeFullResPhoto`).
   - HDR auto/on, Night, Astro and every creative mode bind preview + maximum YUV **without** the JPEG ImageCapture (`FULL_RES_YUV`).
   - Night/Astro with source AUTO (pref `multi_frame_source`: AUTO/YUV/RAW) bind preview + RAW_SENSOR + a 1280x960 metering YUV stream (`FULL_RES_RAW`) when the camera lists RAW.
   - Every shot in these sessions comes from the stream: a burst when planned, otherwise one frame. The app encodes it (YuvImage JPEG q95) and writes full EXIF: exposure, ISO, f-number, focal length, orientation, GPS, flash, white balance and colour space.
   - RAW development (`mf/raw.cpp`) takes black/white levels (dynamic, else pattern), the lens-shading map (map mode set ON during the burst), COLOR_CORRECTION_GAINS and the COLOR_CORRECTION_TRANSFORM matrix. It then does bilinear demosaic, sRGB, and BT.601 full range. Each frame is developed into the burst, then merged as usual.
   - Fallback chain, each step with a toast:
     - RAW → full-res YUV → regular JPEG session.
     - Triggers: a failed bind, a YUV stream under 6 MP after the bind, a missing RAW size, or a failed capture (it first retries a single frame).
     - The regular session keeps the existing bind chain, ending at preview + JPEG.
   - Forced flash, front camera, RAW/Ultra HDR output, extensions, capture intents and Pro manual exposure stay on the regular session. Auto flash is allowed, because bursts never fired the flash.
2. **True Super Res** (`superResolveCrop`, `Params.crop*`, `Burst.process(crop=)`).
   - In the YUV session, Super Res sets zoom to 1x for the burst, merges the unzoomed frames, and applies the zoom crop after alignment.
   - Native samples are gathered onto the finer grid, with a Gaussian kernel of sigma 0.35 px and robustness weights.
   - RAW frames are always cropped afterwards.
   - The native test now measures the realistic path and passes legitimately. The bar was **raised** from +0.25 to +1.0 dB:

     | Test | Single upscale | Multi-frame | Gain | Required |
     |---|---|---|---|---|
     | Unzoomed burst, 2x crop | 36.44 dB | 38.71 dB (host), 38.82 dB (gauguin) | **+2.3 / +2.4 dB** | > +1.0 dB |
     | Old HAL-zoomed fallback path | — | — | +0.2 dB | not worse than single |

3. **Per-frame exposure** (`androidx/camera/view/CameraControllerInterop.kt`, `CaptureResultTracker`).
   - CameraController has no interop hook, so the controller's package-private analysis use case is swapped for an equivalent one built with `Camera2Interop.Extender.setSessionCaptureCallback`.
   - Results are matched to frames by SENSOR_TIMESTAMP.
   - `SceneMeter.measured` marks real data. HDR auto picks Night only when:
     - with real data: lux < 10, or AE is already at ≥ 50 ms and ISO ≥ 1600;
     - with assumed data: the frame is still dark (luma < 40).
   - The Astro suggestion needs measured data.
   - **On gauguin the log still said "No CaptureResult on analysis frames"**, so the callback did not take effect there yet (open item 1).
4. **Moon**: on entering Moon mode, the VM switches to the longest telephoto chip (a different lens from 1x, ≥ 2x) in the device profile. Without one (gauguin), Moon captures unzoomed full-res frames and runs Super Res on a crop of at least 2x, centred on the detected moon. If that fails it falls back to the moon stack.
5. **Sports tracking** (`pipeline/creative/SportsPicker.kt`, original code).
   - Finds the subject as the largest moving region against the per-pixel median background (low-passed), or a box around `subjectHint`.
   - Tracks it with a SAD template tracker whose template is refreshed every frame.
   - Keeps the 3 frames with the highest Laplacian energy inside the subject box.
   - `SubjectLocator` is the interface for a phase 5 segmentation model.
   - Fallbacks: whole-frame ranking, then frame 0.
6. **Look on first bind** (`LookController.preload/awaitPreload/attachIfReady`, binary LUT cache in `LooksRepository`).
   - The VM starts loading the LUT and GL at init.
   - The bind waits up to 1.2 s and sets the effect before `bindToLifecycle`, so there is no second bind.
   - The parsed `.cube` is cached as binary in `cache/luts`.
7. **Crash-safe merges** (`BurstArchive`, `BurstRecovery`, `ProcessingService.processBurst`).
   - While a burst merges, its frames are written in parallel to `cache/bursts/<id>/` as lossless deflate NV21. `meta.properties`, written last, holds the MergeJob and the owning process token.
   - The archive is deleted once the photo is saved.
   - On the next launch, `resumeIfPending` puts archives owned by another (dead) process into the persistent SQLite queue as `burst:<dir>` jobs. The service merges them, saves the result, queues the look/frame step, and deletes the archive.
   - Failed jobs and stale partial archives are cleaned up.

## Before / after (gauguin)

| Mode | Before | After (expected / measured) |
|---|---|---|
| HDR auto/on | single JPEG (YUV next to JPEG = 1600x1200 < 6 MP guard) | full-res YUV session bound; **stream is 3264x2448 (8 MP)**, not 4000x3000, measured |
| Night / Astro | single JPEG | RAW session (developed RAW frames); not shot on device |
| Long exposure / creative | 1600x1200 (phase 10) | full-res YUV stream (3264x2448); not shot on device |
| Super Res 2x | HAL-zoomed, +0.3 dB synthetic | unzoomed crop, +2.4 dB synthetic |
| Cold-start look | ~12 s, rebind | first look frame **10.4 s** after "Displayed" (measured once, phone heavily loaded); target < 1.5 s **not met yet** |

Native timings on gauguin (`pipeline_test --perf`, 4000x3000) were measured while the phone ran dex2oat for GMS and another agent's app (load ~20). They are not representative:

| Burst | Total | Align | Merge |
|---|---|---|---|
| HDR x8 | 8.3 s | 5.3 s | — |
| Night x12 | 13.1 s | — | — |
| SuperRes x8 | 10.1 s | — | — |
| SuperRes 2x crop | 6.8 s | — | — |

Host x86 for comparison: HDR 0.96 s, SR crop 1.34 s. Re-measure on an idle phone.

## Tests

- `:capture` StreamPolicyTest (6): layouts, fallback chain, measured Night/Astro rules. ExposurePlanner/Tripod tests are unchanged and pass.
- `:pipeline` tests:
  - SportsPickerTest (6): locator, static scene, tracker, picks the subject-sharp frames where whole-frame ranking does not, hint, and a broken-locator fallback.
  - BurstArchiveTest (4): lossless round trip, incomplete or missing frame ignored, zoom crop.
- Native: SR crop, RAW grey card (neutral, Y 118), RAW red patch. All old tests pass (host + arm64 on gauguin).

## Shared files touched (merge notes for phases 5/6)

`CameraActivity.kt` (Photo branch of bind, rebind key, 3 collectors, look await), `CameraViewModel.kt` (`desiredStreamConfig`, `takeFullResPhoto`, `takeRawImage`, moon tele collector, look preload), `MultiFrameCaptureController.kt` (rewritten capture/process), `BurstAnalyzer.kt`, `MultiFrameSaver.kt`, `CreativeCaptureController.kt`, `LookController.kt`, `LooksRepository.kt`, `ProcessingService.kt` (burst jobs + orphan scan), `BurstJobQueue.kt` (comment), `NativePipeline.kt` / `pipeline_jni.cpp` (new functions only; `nativeProcess` kept), `MultiFrameProcessor.kt`, `ExposurePlanner.kt` (`SceneMeter.measured` defaulting to true), `pipeline/Android.bp` + `CMakeLists.txt` (`mf/raw.cpp`), `LookSurfaceProcessor.kt` (one log line), `strings_multi_frame.xml`. New file under `app/src/main/java/androidx/camera/view/` (package-private access; Soong already globs `**/*.kt`).

Device builds used a temporary `applicationIdSuffix ".fr"` (`dev.opencamera.app.fr`, not committed) so the `.dev`/`.p6` installs of other phases were not replaced. The package is still installed on gauguin.

## Open items

1. The capture callback is not reaching frames on gauguin (log still warns). Check whether `mImageAnalysis` is recreated after the swap, or timestamps differ, and log tracker hits.
2. The YUV maximum next to preview is 3264x2448 on this HAL, not 4000x3000. 12 MP output needs the RAW session (or a YUV size from `getOutputSizes` larger than CameraX's pick). HDR is therefore 8 MP; outputs were not verified as files.
3. Not tested on device:
   - an actual HDR/Night/long-exposure shot (one shutter tap produced no log, and the session was cut short);
   - the RAW burst path;
   - the zoom reset flicker during Super Res (the preview jumps to 1x for about 0.5 s);
   - recovery after killing the process;
   - Moon and Sports.
4. Look cold start is still ~10 s. Pre-bind attach is in, but the time is likely spent before the bind (startup on a loaded phone). Profile it on an idle phone.
5. Merge is ~8x slower on the loaded SM7225 than the phase 4 target; alignment (NEON) needs optimising if idle numbers confirm.
6. Pro manual-exposure toggling does not trigger a rebind by itself (applies on the next bind).
