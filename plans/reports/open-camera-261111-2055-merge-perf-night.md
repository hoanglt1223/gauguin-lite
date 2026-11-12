# Open Camera: merge perf-round2 + night-burst, own look preview, image quality

Date: 2026-11-11 (Asia/Saigon). Repo `D:\Projects\open-camera`, branch `main`. Not pushed.
APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-alpha6-debug.apk` (package `dev.opencamera.app.dev`, built from `2f74523`).

## Merges

| Commit | What |
|---|---|
| `788e2d1` | `--no-ff` merge of `feat/perf-round2` |
| `8da0930` | `--no-ff` merge of `feat/night-burst` |
| `2f74523` | Own look preview renderer and Image quality setting (asked by the coordinator after the merges) |

- Both merges were textually clean. `CameraViewModel.kt` auto-merged.
- Integration points checked by reading the merged code:
  - `takeFullResPhoto` sends RAW-session bursts to `captureCamera2` and keeps the single-frame path that carries Pro options. Pro manual exposure plans `SINGLE`, so `usesCamera2Burst` is false and the shot goes through the single full-resolution frame.
  - Burst hand-off: `BurstHost.pause` freezes `PreviewBlurView` and unbinds. `resume` calls `bindToLifecycle`.
  - Config changes during a burst are deferred while `cameraState` is `TAKING_PHOTO`. This uses perf-round2's `deferUntilIdle` and coalesced rebind.
  - Progress: `multiFrame.progress` drives the View progress bar. The Compose shutter ring reads `cameraState` and `shutterEnabled` from the split overlay state (`forBottom`). Both were seen during a burst (screenshot `perf-traces/m6-night-glass.png`).
- Gates after each merge: `.\gradlew.bat assembleDebug test lint` passed. `app:generateBp` produced no `Android.bp` change.

## Device verification (gauguin c28004a8, room lit)

The crash buffer was empty after every session. The app was force-stopped and the phone sent home after each session.

| Check | Result |
|---|---|
| Night, phone lying still | 6 × 1.000 s at ISO 63/65/81 (fd 1.0005 s). Capture 8.56–8.64 s, first frame 3.06–3.13 s after the tap. Merge (process) 4.08–4.40 s: align 2.3–2.6 s, merge 0.8–1.0 s. Tap → saved about 13 s. Output 4624×3472 RAW. |
| Night per frame | Frame times from the tap: 3129 / 4115 / 5102 / 6071 / 7113 / 8106 ms. Every frame t = 1 000 000 000 ns. |
| Night cancel | Shutter tapped after frame 1. Logged `Burst cancelled` 1.4 s after the tap. CameraX session Active again 0.14 s later. No crash. |
| Night in a YUV session (look selected, before the new renderer) | 6 × 1 s, 3264×2448 YUV. Capture 6.4 s, process 1.9 s. |
| Handheld Night | **Not done.** The phone cannot be held by an agent, and the planner saw it as still. |
| Photo (HDR auto) | In this dim lit room the planner chose Night 1 s (`wantsNight`; this logic predates both branches). The output was correctly exposed. |
| Video | 4 s recording saved (`.mp4`). Recorder went to IDLING cleanly. |
| Pro manual | ISO 400, 1.6 s → EXIF ISO 400, ExposureTime 1.6, 4624×3472. 0 rebinds while moving the dials. The capture took 12.8 s for a 1.6 s exposure (see Concerns). |
| Lens 0.6 / 1 / 2 | 0.6 and back to 1 each rebind (`bind config` 38–41 ms). 2× is a crop zoom with no bind. |
| Look switching | Vivid and Classic CCD applied. A saved photo was rendered with `look=classic-ccd`. |
| Skin switch | Origin → Glass → Origin from the More sheet, with no rebind. A Night burst under Glass showed the frozen frame, the progress bar and the ring. |
| Editor | Opened through `ACTION_EDIT`. Exposure slider set to +0.78. Export: `3472x4624 JPEG render=1569 ms total=1849 ms` to `Pictures/OpenCamera/Edited`. |

- At 21:08:43 the camera was sent to Home while no test step was running. There was no crash or ANR. It was probably the user, so the agent waited 90 s before continuing.
- Logs and screenshots are in `plans/reports/perf-traces/m6-*`.

## Own look preview (coordinator request)

**Design.** PreviewView's surface provider is wrapped (`LookPreviewSurfaceProvider`):
1. For each camera `SurfaceRequest`, a twin request is created with the same size, camera, dynamic range and transformation info. The twin goes to PreviewView.
2. PreviewView's surface becomes a GL output of the existing `LookSurfaceProcessor`.
3. The camera writes into the processor's OES texture. The draw uses the identity LUT for Original.

No CameraX `CameraEffect` is used, so:
- RAW and the look coexist;
- picking a look only swaps the LUT;
- the RAW-vs-look rule in `desiredStreamConfig` no longer applies while the renderer is active.

PreviewView offers no hook for this. Its final `mSurfaceProvider` field is replaced by reflection in `CameraActivity.installLookPreview`, and a ProGuard keep rule covers it.

**Fallbacks.** If reflection fails, the stock provider stays and the CameraX effect path is used. If the renderer fails (EGL window surface, or an exception in the bridge), the request goes to PreviewView unchanged, a toast is shown, later binds use the effect path, and the look is applied again. HDR (10-bit) preview bypasses the renderer. A lost output surface is dropped without throwing on the GL thread.

**Bug fixed on the way.** With no look selected, `GlLookProgram` left the 3D LUT and tone samplers on texture unit 0, the same unit as the OES input. Every draw then failed with `GL_INVALID_OPERATION` and the preview was black. This also affected perf-round2's "pass-through effect from the first bind" in YUV sessions. The renderer also no longer stamps sensor timestamps on the view output.

**Measured on gauguin:**

| Check | Result |
|---|---|
| Preview rate (Auto, RAW session) | 30.0 fps steady with the look on or off. The GL output is 1600×1200. |
| Original → Vivid → CCD → Original → Vivid, Auto (RAW) | 0 `bind` lines, no CameraX session change, 30.0 fps every 2 s window. |
| Same in Fast (YUV) | 0 binds, 30 fps. |
| Same in Maximum (RAW) | 0 binds. The only bind (`bind streams 75 ms`) came from changing the quality setting itself. |
| Output, Auto + Vivid | Night RAW 4624×3472, look `vivid` rendered on the saved photo. |
| Output, Maximum | 4624×3472. |
| Output, Fast | 3264×2448 (YUV, process 2.0 s instead of 4.2 s). |
| After a Camera2 burst | The live look preview comes back (`Look preview 1600x1200` logged on rebind). |
| Overlays | Pro peaking, zebra and histogram draw over the GL preview. |

Latency was not measured glass-to-glass. The pass adds one GL draw per frame on its own thread and does not wait for presentation.

## Image quality

- **Settings → Ảnh → "Chất lượng ảnh"** offers Auto, Maximum (RAW) and Fast (YUV). It is stored in the existing `multi_frame_source` pref (`BurstSource`), in default prefs on the device.
- **Quick settings sheet:** long-press the gear to open it. A row cycles Auto → Maximum → Fast.
- **Labels:** megapixels come from `SCALER_STREAM_CONFIGURATION_MAP` for the bound camera at the photo aspect ratio. On gauguin they read "Tự động (16 MP)", "Tối đa (RAW 16 MP)" and "Nhanh (YUV 8 MP)".
  - Without the aspect filter, YUV read 9 MP from a non-4:3 size. That has been fixed.
  - Maximum is hidden on cameras without RAW.
- **When it applies:** only to the full-resolution session (HDR, Night and other multi-frame modes). With HDR off, the regular JPEG session is used, as before.
- **Tests:** `ImageQualityTest` (3 tests) and `LookPreviewRoutingTest` (3 tests). `assembleDebug test lint` passed after the change.

## Shared files touched by `2f74523`

- `CameraActivity.kt`: `installLookPreview`, image-quality state and action, rebind on source change.
- `CameraViewModel.kt`: `rawLarger` input.
- `LookController.kt`: `wrapPreview` and `ownsPreview`.
- `MultiFrameCaptureController.kt`: `sourceFlow`.
- `SettingsActivity.kt`.
- `ui/overlay/{CameraUiState,CameraOverlay,Sheets}.kt`.
- `pipeline/looks/{GlLookProgram,LookSurfaceProcessor}.kt`.
- `root_preferences.xml`, `proguard-rules.pro`.
- New files: `ImageQuality.kt`, `LookPreviewSurfaceProvider.kt`, `strings_image_quality.xml` (en, vi).

## Concerns

1. **Pro long exposure in the RAW session.**
   - Problem: a 1.6 s manual shot took 12.8 s. It is a single CameraX RAW still, which queues behind long preview frames, the issue the night-burst branch fixed only for bursts.
   - Suggestion: route Pro single frames longer than about 250 ms through `Camera2Burst` with one frame.
2. **Handheld Night is untested.** Planner exposure ≤ 333 ms is expected; it needs a person holding the phone.
3. **Reflection on PreviewView.** The renderer depends on a private CameraX field. A CameraX upgrade can rename it; the code then falls back to the effect path with no crash, but loses live look + RAW. Re-check after each CameraX bump.
4. **No glass-to-glass latency measurement** for the GL preview. Frame rate stays at 30 fps.
5. **HDR auto picks Night 1 s in a dim but lit room** (ISO about 60). This predates both branches. Whether it is wanted is a tuning question.
