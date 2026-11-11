# Open Camera phase 6: video and extra modes

Date 2026-11-11. Worktree `D:\Projects\open-camera-wt\phase6-video-modes`, branch `feat/phase6-video-modes`.
Commits `ddd1495` (feature) and `42ac912` (performance). Nothing is pushed.

## What was built

The main selector has a new **More** button. It opens `video/VideoModesActivity`, which binds the camera itself through `ProcessCameraProvider`. This lets each mode pick its own session type (regular, high-speed, concurrent, analysis).

Each mode is checked first (`VideoCapsProbe` → `VideoModes.supported`). If the device lacks what a mode needs, the mode is not shown. If a bind fails, the activity first tries simpler setups, and if nothing works it hides the mode and shows a toast. Main Photo, Video and QR behave as before: the only change to `CameraActivity` is the More button.

| Mode | How it works | Fallback / when it is hidden |
|---|---|---|
| Pro video | Quality comes from the recorder's supported qualities. FPS comes from the fixed frame-rate ranges. Also: HEVC/AVC choice (when an HEVC encoder exists), three bitrate levels, HLG 10-bit, stabilization Off/HAL/Gyro, mic source (camcorder/default/unprocessed/voice), stereo/mono, pause/resume, audio meter (`AudioStats` amplitude), a stop when the device gets too hot, and a log profile | Binds step down in this order (`RecordPlan`): as requested → without HDR/log → 30 fps without HAL stabilization and with AVC → default quality. If the chosen mic fails, it switches back to camcorder. |
| Log + look | Our own log tone curve through `TONEMAP_CURVE`. In post, Media3 `SingleColorLut` turns log back to normal and applies the selected look. | The option is shown only if the camera supports `CONTRAST_CURVE`. The original file is always kept. |
| Gyro EIS | Gyro path is recorded while filming. In post, Media3 `MatrixTransformation` applies a centred ±0.4 s smoothing, rotation correction and a 10% crop. Pauses are taken into account. | The option is shown only if the device has a gyroscope. |
| Slow motion | 1. CameraX `HighSpeedVideoSessionConfig`. 2. Camera2 `CameraConstrainedHighSpeedCaptureSession` + `MediaRecorder` (`HighSpeedSession.kt`), then the clip is re-timed so it plays slowly. 3. A 60 fps clip re-timed to 2x. | Hidden if the device has none of these. |
| Time-lapse | Takes one frame every 0.5–10 s from the analysis stream and encodes it with `BitmapVideoEncoder` (MediaCodec, explicit timestamps). | — |
| Hyperlapse | Keeps 1 of every 4/8/16/32 frames, stabilized live with the gyro (low-pass, 10% crop). | Hidden without a gyroscope. |
| Short video | 10/15/30/60 s limit. Music the user picks (SAF) is mixed in by Media3 `Composition` with a looping audio track. Original sound can be on or off. | — |
| Dual video | CameraX concurrent cameras with `CompositionSettings` picture-in-picture. | Hidden unless there is a front+back concurrent pair. On gauguin it is hidden. |
| Slow shutter | Adds up 2–15 s of frames into one JPEG: average (silky) or lighten (light trails). | — |
| Time freeze | A line sweeps across over 4/6/10 s; everything behind it stops moving. Output is a video. | — |
| Bokeh video | `VideoSegmenter` interface only, with an empty registry. | Hidden until phase 5 registers a segmenter. |
| Panorama | A gyro sweep guide takes a frame every 15° and warns on tilt. Frames are warped onto a cylinder, placed using the gyro, refined with OpenCV `phaseCorrelate`, and blended at the seams. | Hidden without gyroscope or OpenCV. |
| Document | OpenCV Canny + contours find the page outline live, then perspective correction and background whitening (colour/grey/B&W). Pages are exported as a multi-page PDF (`PdfDocument`) to `Documents/OpenCamera`. | Hidden without OpenCV. If no outline is found, the whole frame is used. |

**Why not OpenCV's `Stitcher`:** it has no Java binding. Calling it through JNI would mean linking against OpenCV's `libc++_shared`, which breaks the static-libc++ rule. Because the gyro sweep already tells us the rotation between frames, a simpler single-row stitcher is enough.

## Tests

- `gradlew assembleDebug test lint`: green.
- New unit tests:
  - `GyroPathTest` (6)
  - `SweepGuideTest` (2)
  - `FrameMathTest` (7): YUV, accumulator, time freeze, document corners, panorama geometry, retime
  - `VideoModesTest` (8): which modes are shown, slow-motion fallback order, `RecordPlan` steps, log curve inverts exactly, grade LUT, pause timeline
- On-device instrumentation `pipeline/src/androidTest/.../ModesDeviceTest`: 3 of 3 pass on gauguin.
  - Panorama: 5 shifted frames stitched to 2192x882 in 672 ms.
  - Document: page corners found within 25 px, page centre whitened, PDF written.
  - Encoder + retimer: 2 s clip, and 8 s after 4x retime.

## Device results: gauguin (c28004a8)

Tested on the new ROM, built 2026-11-11. The test APK used the package name `dev.opencamera.app.p6`, because other agents were installing and using `dev.opencamera.app.dev` and `.fr` on the same phone at the same time. The `.p6` package has been uninstalled.

What the probe found: UHD/FHD/HD/SD qualities; fixed frame rates only 15 and 30 (so no 60 fps on this phone); no 10-bit HDR; HAL stabilization and tone curve supported; gyroscope present; no concurrent camera pair. CameraX reports no high-speed qualities, even though the HAL lists 1080p120 and 720p240 — the ROM has no high-speed camcorder profiles.

| Test | Result (checked with ffprobe; ffmpeg decode passed) |
|---|---|
| 1080p pro video | h264 1920x1080 30 fps, 205 frames in 6.83 s, AAC stereo |
| 4K pro video | h264 3840x2160, 342 frames in 11.7 s, AAC stereo |
| 4K, 28 s, camera taken over by another app mid-recording | File finalized cleanly: 838 frames in 28.3 s (98.8% of nominal), no crash |
| Slow motion | Camera2 direct path at 120 fps → `SLOWMO_*.mp4`, 1080p, 28.4 s for about 7 s of capture, decodes fine. **Concern:** the timestamps show only about 61 frames per second actually arrived (low light and/or a busy phone), so playback runs at about 15 fps |
| Time-lapse, 33 s at 1 s interval | 34 frames, 1072x1920, 1.13 s at 30 fps |
| Hyperlapse | 22 frames, 1072x1920 at 30 fps |
| Time freeze | 720x1280. Only about 4 fps reached the encoder while the phone was also running dex2oat, another agent's pipeline test at 286% CPU, and `oc_fullres_test`. After fixes, frame conversion dropped from 150–400 ms to about 8 ms. |
| Slow shutter | JPEG saved |
| Panorama | Started and stopped with no crash. The phone lies still on the desk, so there was no sweep, and it showed "Turn further" as designed. Stitching itself is covered by the instrumented test. |
| Document / short video / log + gyro | **Not run through the UI.** Another agent kept bringing its camera app to the front every few seconds, so I stopped tapping to avoid hitting their app. Document detection, rectification and PDF export pass on the device in the instrumented test. |
| Crashes | None. Every exit of the p6 process was a reinstall ("PACKAGE UPDATED"). |

iQOO: not tested (that phone was not part of this phase's test plan).

## Licences

- OpenCV 4.14.0 (Maven `org.opencv:opencv`, Apache-2.0 since 4.5). Its arm64 `libopencv_java4.so` and `libc++_shared.so` are 16 KB aligned (LOAD align 0x4000). Our own libraries still use static libc++. The OpenCV AAR brings in its own `libc++_shared.so`, which is used only by OpenCV.
- Media3 Transformer and Effect 1.10.0 (Apache-2.0).
- Both are listed in `NOTICE`. No models, LUTs or music are bundled.

## Shared files changed (merge notes)

- `gradle/libs.versions.toml`, `app/build.gradle.kts`, `pipeline/build.gradle.kts`: add the media3-transformer, media3-effect and opencv dependencies.
- `app/Android.bp`, `app/libs/Android.bp`: regenerated by `app:generateBp` (3 new static libs). The Media3 AARs are committed.
- **The OpenCV AAR (118 MB) is not committed.** It is in `.gitignore`; run `app:generateBp` to recreate it before a Soong build.
- `AndroidManifest.xml`: `.video.VideoModesActivity` added (not exported).
- `CameraModeSelectorLayout.kt`: the More button and `onMoreModesCallback`.
- `CameraActivity.kt`: 5 lines that wire the callback (behind `dismissKeyguardAndRun`).
- `NOTICE`.

Everything else is new, under `app/.../video/`, `capture/.../video/`, `pipeline/.../{video,document,panorama}/` and `pipeline/.../OpenCv.kt`.

## Concerns and remaining work

1. **Restricted CameraX APIs.** Two calls are marked library-internal in CameraX, so lint flagged them; I suppressed the lint error with a comment:
   - `Recorder.Builder.setAudioSource` — CameraX's only way to choose the mic.
   - `Recorder.getHighSpeedVideoCapabilities(info, source)`.
   Both depend on the pinned CameraX 1.7.0-rc01, and both have a runtime fallback.
2. **Mic, codec and bitrate options exist only in the new Pro video mode.** The main Video mode uses `CameraController`, which gives no access to the recorder settings.
3. **Gyro EIS axis signs and orientation in post are reasoned, not measured.** Two assumptions: Media3 hands effects frames that are already upright, and the axis mapping in `FrameCorrection` is right. This needs a hand-held test, ideally with a shake rig.
4. **Not done:**
   - A look LUT shown live in the preview while recording log (the grade is only applied in post).
   - Wind-noise reduction: there is no public API for it.
   - Lens-plan zoom inside Pro video.
5. **Debug APK size** grew to about 172 MB, because OpenCV ships for 4 ABIs. Consider `abiFilters` or an OpenCV build with only the modules we use.
6. **Re-test on a quiet device:**
   - slow-mo frame rate in good light
   - time freeze and hyperlapse frame rate
   - short video with music
   - log grade and gyro stabilization on a moving shot
   - document mode from the UI
   - a real panorama sweep
   - a 10-minute 4K30 run with the thermal stop
7. **Many agents share the gauguin phone and the `dev.opencamera.app.dev` package.** They reinstall over each other's builds and take the camera from each other. Giving each phase its own applicationId suffix would avoid this.
