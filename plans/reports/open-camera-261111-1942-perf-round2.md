# Open Camera: performance round 2

Date: 2026-11-11 (Asia/Saigon). Worktree `D:\Projects\open-camera-wt\perf-round2`, branch `feat/perf-round2`, from `b6d03a1`. Four commits (`daea461`, `aaed4ea`, `2312678`, `c181137`). Nothing pushed.
Debug APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-perf2-debug.apk` (package `dev.opencamera.app.p2`).

## How it was measured

- Device: gauguin `c28004a8`, dark room. The iQOO was not used.
- Timing builds use a temporary `isDebuggable = false` toggle, which is never committed. They are built by `.tools\perf\build-p2.ps1` into `p2-before.apk` (from `b6d03a1`) and `p2-after*.apk`.
- Scripts are outside the repo, in `D:\Projects\gauguin\.tools\perf\`:
  - `measure2.ps1` covers cold start, Pro, skin, lens, look, More and modes.
  - `editor2.ps1` covers the slider and export.
  - `recompose.ps1` counts recompositions (debug build only).
  - `tp_main.py` reads Perfetto traces.
  - Raw results are in `r2-before*.txt`, `r2-after1*.txt`, `r2-after2.txt`, `ed2-*.txt`, `ab-*.txt` and `rc-*.txt`.
- What each metric means:
  - **main cpu**: utime+stime of the main thread, from `/proc/<pid>/task/<pid>/stat`, with 10 ms resolution.
  - **frames**: `dumpsys gfxinfo`.
  - **bind→active**: from the OcPerf bind start to CameraX `CaptureSessionState Active`. This is the preview stall per rebind.
  - **SF gap**: the longest gap between SurfaceView presents. It is only valid while the same layer stays alive.
- A freshly installed APK runs in `verify` mode, mostly in the interpreter. Cold start was therefore measured both as installed and after `cmd package compile -m speed-profile`.
- After each session the app was force-stopped and the phone sent home. `dev.opencamera.app.p2` was uninstalled at the end.

## Before → after (non-debuggable, gauguin)

| Scenario | Before | After |
|---|---|---|
| Pro: ISO dial drags, 8 swipes | **8 rebinds**, main 2510–2630 ms, p95 48–53 ms, 8–13 % janky | **0 rebinds**, main 1830 ms, p95 30–32 ms, 4.5 % janky |
| Pro: ISO + shutter dials | main 1400–1830 ms, p95 24–57 ms, up to 3 frames ≥100 ms | main 1220–1240 ms, p95 21–22 ms, 0 frames ≥100 ms |
| Pro open (4 s window) | main 430–880 ms | main 380–440 ms (one 150 ms frame is left, see Concerns) |
| Skin switch in camera (More → skin tile) | main 220–350 ms, up to 3 frames ≥100 ms, a `bind config` was seen | main 140–200 ms, 0–1 frame ≥100 ms, no rebind, preview gap 50 ms |
| Lens 0.6↔1, bind→active | 398–447 ms | 359–408 ms (HAL-bound). The frozen frame is now sharp at the new field of view instead of blurred |
| Lens 1→2→1 | 34–50 ms gap | unchanged (zoom crop) |
| Look Original↔Vivid | rebind each time, 368–419 ms bind→active, about 730 ms SF gap | still a rebind on gauguin (see Concerns), 340–434 ms |
| More sheet, 5 open/close | main 2030 ms, p99 113 ms, 3 frames ≥100 ms | main 1710–1760 ms, p99 97 ms, 2 frames ≥100 ms |
| More → Slow motion activity | Displayed 91–97 ms; back: main 240–270 ms, gap 42 ms | 79–93 ms; back: 160–260 ms, gap 34–42 ms |
| Photo↔Video, 20 swipes | 765 frames, 17 frames ≥100 ms (previous round, same script) | 782–786 frames, 17–21 frames ≥100 ms (**unchanged**) |
| Photo↔Portrait, 4 cycles | 8 frames ≥100 ms, p95 57 ms | 8–10 frames ≥100 ms, p95 61–65 ms (unchanged) |
| Overlay recompositions (fixed session: 6 mode swipes, 4 lens taps, 3 flash taps, 2 More) | BottomRow 26, LensRow 26, TopBar 26, ModeCarousel 122, Sheets 34 | BottomRow 6, LensRow 4, TopBar 12, **ModeCarousel 17**, Sheets 16 |
| Cold start, as installed (verify) | TotalTime 578 ms, START→session active 1263 ms | 575 ms, 1273 ms (equal; the run-to-run spread is about ±80 ms) |
| Cold start, compiled | 415 / 916 ms (runtime profile, after use) | **444 / 932 ms from the first launch** (baseline profile); first preview about 1310 ms after process start |
| Cold start, debug build | watchdog: main blocked **728 ms** in `onCreate` (QR sheet inflate) | no watchdog hit |
| Editor slider, 8 drags | p50 24 / p95 32 ms, 1051 UI frames, main 4.6 s | p50 17–18 / p95 **27–28 ms**, 700 UI frames, main 4.8 s |
| Export, 1920×2560 JPEG | render 529 ms, main **10 ms** in the 12 s after | 516 ms, main 10 ms |

## What changed, per item

1. **Pro panel**
   - Manual exposure no longer changes the session layout (`StreamPolicy` drops `manualExposure`). A single full-resolution frame carries the Pro request options, so dials never rebind.
   - Pro options are written with one `addCaptureRequestOptions`. `set()` runs first only when the key set changes (manual exposure, manual focus or Kelvin switched). Changes that only affect the view (peaking, zebra, histogram) skip Camera2 entirely.
   - Settings are saved 400 ms after the dial stops. The hidden View panel and toggle are not updated while the skinned UI is shown.
   - The dial's `Paint` is remembered. Only the selected dial was composed already.
2. **Skin switch:** there was no activity recreate. The `Crossfade` composed two whole overlays, and now the tokens switch in place. Skin changes made in Settings still go through onStop/onStart, as with any Settings visit.
3. **Lens 0.6↔1**
   - New `LensPlan.logicalZoom`, with a unit test. The view model zooms when the chip's lens is a physical camera of the open logical camera and the ratio is inside its range.
   - That path is not used on gauguin: the ultra-wide (id 3) is not part of logical camera 5 (0+4), whose zoom range is 1–10.
   - The fallback is a sharp frozen frame shown at the new field of view: zooming in crops it, zooming out shrinks the view. It cross-fades into the live preview. Pre-warming a second camera is not possible with one `CameraController`.
   - 2× stays a crop zoom.
   - The lens chips are no longer re-inflated on each mode switch.
4. **More grid and More modes:** the sheet scrim fade is read in the draw phase (`derivedStateOf`). The More-mode activity opens in under 100 ms in a non-debuggable build. The 5.8 s / 1 s numbers in the audit came from the debug build.
5. **Export**
   - In a non-debuggable build, main is idle during and after export (10 ms in 12 s).
   - The 3.2 s in the audit was traced in `dev-export.pftrace`: 1111 Compose `animation` frames with no draw, on the debug build. It did not reproduce.
   - The export codec scan (`MediaCodecList`) now runs once per process, off main. The progress status text was already there.
6. **Editor slider**
   - The preview is a `SurfaceView`, detached with a bounded wait, so GL frames no longer redraw the window. Draft frames skip the overlay invalidate.
   - p95 went from 32 to 27–28 ms. The ≤20 ms target is **not** met.
   - simpleperf shows that the main thread runs mostly in the interpreter (`nterp`) during the drag, which inflates every UI cost on a freshly installed APK. See Concerns.
7. **Mode switches:** carousel recompositions went from 122 to 17. Redundant preview relayouts are skipped. The QR sheet is lazy. Frames ≥100 ms per run did not improve (17–21). What is left is the CameraX reconfigure on main (20–35 ms) plus the first frames after the session change.
8. **Cold start**
   - `androidx.profileinstaller` was added, with a generated `app/src/main/baseline-prof.txt`.
     - It holds 21.8k rules, recorded on gauguin with `dump-profiles` + `profman`. Compose is left out because it ships its own profile.
     - The non-debuggable APK carries `assets/dexopt/baseline.prof`, and Soong `Android.bp` was regenerated.
   - The AI runtime and its tasks are lazy.
   - The thumbnail comes from `loadThumbnail` (MediaStore). The hidden View thumbnail is no longer decoded.
   - The QR bottom sheet is no longer inflated in `onCreate`. This was 728 ms of blocked main in the debug build.
   - Camera sounds load off main. The settings files are opened on IO at process start.
   - A `first preview … ms after process start` OcPerf line was added.
   - A/B test: attaching the look pass-through effect at the first bind does not change cold start (434–452 vs 448–451 ms).
9. **Compose state slicing:** each overlay section receives only the fields it reads. A debuggable-build counter logs to `OcRecompose` when the camera pauses. The counts are in the table above.
10. **Look Original↔look:** the effect is now attached as a pass-through from the first bind, so Original↔look only swaps the LUT when the session can carry the effect. On gauguin the rebind remains (see Concerns).
11. **StrictMode / watchdog**
    - Fixed:
      - the QR sheet inflate (watchdog);
      - `CameraSoundsUtils` disk reads;
      - `ProSettingsStore` prefs open;
      - default prefs open.
    - Remaining, editor only:
      - `NativeRetouch.<clinit>` (native library load) and `ModelRegistry.state` on main when the editor opens;
      - the default-prefs read in `DevelopActivity.onCreate:153` on a cold editor start. This one is now warmed on IO, but it can still race.

## Gates

`.\gradlew.bat assembleDebug test lint` was green after each batch. New test: `LensCatalogTest.logicalZoomOnlyForPhysicalsInRange`; `StreamPolicyTest` was updated. No `dev.opencamera.app*` crash during the sessions.

## Shared files touched (merge notes)

`CameraActivity.kt`, `CameraViewModel.kt` (stream inputs, `selectLensChip`), `ApertureApplication.kt`, `capture/StreamPolicy.kt` + test, `profiles/ProfileResolver.kt` + test, `ui/overlay/{CameraOverlay,CameraUiState,OverlayHost,ProDials,Sheets}.kt`, `ui/views/{PreviewBlurView,LensSelectorLayout}.kt`, `pro/{ProModeUi,ProSettingsStore}.kt`, `processing/LookController.kt`, `ai/AiController.kt`, `utils/CameraSoundsUtils.kt`, `DebugDiagnostics.kt`, `develop/{DevelopActivity,DevelopEngine,export/Exporter}.kt`, `app/build.gradle.kts`, `gradle/libs.versions.toml`, `app/Android.bp`, new `app/src/main/baseline-prof.txt`.

The night-burst files were not touched: `MultiFrameCaptureController`, the burst path and the native merge. `manualExposureActive` is still set as before and only guards burst plans.

## Concerns

1. **Look rebind on gauguin is a design choice.**
   - RAW is larger than YUV here, so with Original the HDR session is RAW. CameraX rejects effects next to RAW, and picking a look must move the session to YUV.
   - Options:
     - (a) keep it as it is;
     - (b) never use the RAW-larger session, which costs resolution;
     - (c) keep RAW and show looks on saved photos only, without a live preview.
   - This needs a user decision.
2. **Pro manual exposure in a full-resolution session:** a shot is now a single YUV or RAW frame with the Pro request options, instead of a JPEG session. It is worth a check on photos in daylight. The night-burst agent owns the capture path.
3. **Targets not met:**
   - slider p95 is 27–28 ms (target ≤20);
   - mode switches still have 17–21 frames ≥100 ms per 20 swipes;
   - Pro open still has one 150 ms frame;
   - the lens stall is HAL-bound at about 0.4 s and is only hidden visually.
   - Most measured UI time on a fresh install is interpreter time. The baseline profile helps after the first launch plus a background dexopt. A Perfetto trace of a mode switch was not done in this round.
4. The baseline profile is a 2.2 MB text file. Regenerate it after large changes to the startup path; the method is in its header.
5. The skin switch made from Settings still pays the normal stop/start rebind of a Settings visit.
