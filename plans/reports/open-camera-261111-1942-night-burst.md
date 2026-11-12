# Open Camera: Night/Astro as one Camera2 burst (feat/night-burst)

Worktree `D:\Projects\open-camera-wt\night-burst`, branch `feat/night-burst`, commit `a344341` (from main `b6d03a1`). Not pushed.
APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-night-burst-debug.apk` (package `dev.opencamera.app.nb`).

## What changed

- **Option (a) chosen.** CameraX 1.7.0-rc01 has no public burst API, and `Camera2CameraControl` cannot call `captureBurst`. Interop session callbacks do not expose CameraX's output surfaces either.
- **How a RAW-session burst runs now** (Night, Astro, and HDR/Super Res when the RAW session is bound):
  1. The viewfinder is frozen with the existing blurred snapshot (`PreviewBlurView`).
  2. CameraX is unbound.
  3. The app waits until the camera is reported available, opens it through Camera2, and configures one still output (RAW_SENSOR at full size, 4624x3472).
  4. All frames go out in one `captureBurst`. There is no repeating request, so nothing queues behind long preview frames.
  5. The device is closed (the app waits for `onClosed`, bounded), and CameraX is bound again. The live preview fades back in.
- **Per-frame exposure.** The new `capture/BurstSequence` takes exposure time and ISO from the planner, clamped to the sensor range. There is no 250 ms cap (`capRawExposure` and `RawExposureCapTest` are removed). AE plans (HDR, Super Res) get the metered time scaled by their EV. White balance, color matrix and focus distance are copied from the last preview result, so 3A never has to converge in the new session.
- **No 3 s waits.** Each step has a short bound: availability 1.5 s, open 2.5 s, session 2.5 s. The whole sequence is bounded by `BurstSequence.timeoutMs`: frame times plus max(250 ms, 1/8 of each frame) plus 2.5 s.
- **Progress and cancel.** The existing progress ring shows capture progress (frames done / total), then merge progress. While the burst runs the shutter stays enabled, and a tap cancels it. Leaving the app (`onStop`) also cancels. In both cases the camera is closed and CameraX is bound again.
- **Fallback chain** (no path crashes):
  1. Camera2 RAW burst.
  2. Camera2 full-size YUV burst, using the same open device.
  3. The existing single RAW frame through CameraX.
  4. The existing session demotion with a toast.
  - The CameraX per-still RAW *burst* is no longer used in the RAW session.

## Device evidence (gauguin c28004a8, dark room)

Brightness and quality were not judged. Logs are in `plans/reports/perf-traces/night-burst-*.txt`.

| Run | Frames (from capture results) | Capture | Merge | Tap → saved | UI during shot (gfxinfo) |
|---|---|---|---|---|---|
| Night #2 | 6 × t=1.000 s, ISO 6400, fd 1.0005 s | 8.76 s (first frame done at 3.24 s) | 5.57 s | 15.6 s | p50 16 ms, p90 30 ms, 2.0 % janky |
| Night #3 (final build) | 6 × 1 s, ISO 6400 | 8.59 s | 5.05 s | 14.9 s | p50 19 ms, p90 29 ms, 2.1 % janky |
| Astro #2 | 4 × t=16 s, ISO 576 | 68.8 s (frames every ~16.7 s) | 3.34 s | 73.6 s | p50 31 ms, 0.95 % janky |
| Cancel | tapped after frame 0 | cancelled 1.4 s after the tap; live preview back | – | – | – |

- **Before:** Night took 126 s (one still at a time, 1 s frames), then 15.2 s with frames capped at 250 ms. Now the shot keeps the full 1 s at ISO 6400.
- **Overhead:** about 2.2 s of unbind, open and session setup before the first frame.
- **Astro #1 (handover check):** the parallel agent's app (`.p2`) took the foreground mid-shot. `onStop` cancelled the burst cleanly, with no crash.
- **Timeout fix:** that run showed the 16 s frames come every 16.7 s, so the timeout slack was raised (see Concerns).
- The app was force-stopped and the device sent to home after every session.

## Tests

- `BurstSequenceTest` (8 tests): long Night frames are not capped, Astro is limited by the sensor maximum, EV is applied to the metered time, the minimum frame duration is respected, ISO is clamped, unknown exposure gives no sequence (this sends the shot down the fallback chain), and the Night and Astro timeouts are checked.
- `assembleDebug`, `testDebugUnitTest` and `lintDebug` pass.

## Shared files touched (merge notes)

- `CameraActivity.kt` (+19): installs `multiFrame.burstHost` after `previewBlurView.previewView = viewFinder` (pause = freeze + `unbind()`, resume = `bindToLifecycle`). Adds an `onStop` observer that calls `viewModel.cancelBurst()`, and clears the host in `onDestroy`.
- `CameraViewModel.kt`:
  - `isShutterButtonEnabled` also combines `multiFrame.cancellable`.
  - `takePhoto()` cancels a running burst.
  - New `cancelBurst()` and `burstJob`.
  - `takeFullResPhoto()` branches to `captureCamera2`.
- `MultiFrameCaptureController.progress` is now a `Flow` (it was a `StateFlow`); its only caller uses `collectLatest`.

## Concerns / remaining

- **Merge time misses the ~12 s target.** Tap → saved is about 15 s: capture is about 8.6 s and the merge is about 5 s (align about 2.9 s). Capture alone meets the "frame time × count" target.
- **Main-thread stall on rebind.** Binding CameraX again blocks the main thread for up to ~750 ms (`MainWatchdog`). This is the same cost as any rebind in the app.
- **Frozen preview.** The preview is a frozen blurred frame, not a live preview, while the burst runs (the user chose this option).
- **Handheld Night untested.** The device lay still, so the planner chose 1 s (tripod) frames. Handheld Night uses 333 ms or less.
- **Paths not exercised on device:** the YUV fallback and HDR in the RAW session. They are covered only by code paths and unit tests.
- **The device is shared.** The parallel agent's app (`.p2`) evicted the camera twice during these tests.

## Checklist for the user (normal light, later)

1. Night on a tripod and handheld: is brightness close to the preview, and are colors and white balance natural (WB is copied from the preview)?
2. Night handheld: are the frames sharp (exposure 333 ms or less), with no ghosting after the merge?
3. Astro on a tripod at night: are the stars sharp, and is the 70 s wait acceptable?
4. Does the preview come back after each shot, and does tapping the shutter during a shot cancel it?
5. Zoom 2x in Night: is the framing the same as the preview (the crop is applied after the merge)?
6. Orientation: shoot portrait and landscape and check that the saved photos are upright.
