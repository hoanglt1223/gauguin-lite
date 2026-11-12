# Open Camera: merge wave 3 (UI skins, photo editor, retouch) and editor UI redesign

Date 2026-11-11 (Asia/Saigon). Repo `D:\Projects\open-camera`, branch `main`. Nothing pushed.
Debug APK: `C:\Users\nguye\Downloads\camera-test-apks\open-camera-wave3-debug.apk` (package `dev.opencamera.app.dev`).

## Commits on main (oldest first)

| Commit | What |
|---|---|
| `ff87a4e` | merge `feat/ui-skins` (--no-ff) |
| `b201b58` | merge `feat/phase12-editor`; NOTICE conflict, kept both sections |
| `7bc2a45` | merge `feat/phase11-retouch`; conflicts in `app/Android.bp`, `build.gradle.kts`, manifest |
| `cd54cbc` | camera: queued mode change, frame-deferred bind, async small snapshot, rotated label fit |
| `7317017` | Vietnamese strings for camera, editor, retouch |
| `a02f2fc` | Compose editor, retouch tools in the editor, one edit stack |
| `c6eb6d8` | Soong: Compose BOM as an empty local module |
| `52cae93` | gear opens full Settings, quick sheet on long press, skin/settings tiles in More; editor back closes sheets |
| `92e7f22` | editor fixes found on the device |

`.\gradlew.bat assembleDebug test lint` was green after each merge and after the last commit.

## Part A: merge and integration

- **Build flag.** Only `-PopenCamera.debugSuffix=.xyz` is left; ui-skins' `openCamera.debugIdSuffix` was removed. The default debug package is still `dev.opencamera.app.dev`.
- **Retouch in the editor.** `develop/tools/RetouchTools.kt` registers the 9 phase-11 tools in `ToolRegistry` as `RetouchDevelopTool`. Each step is a `ToolStep` whose params are the tool's resolved `RetouchParams` JSON. The same stack is replayed on the proxy and at export (`Exporter` → `ToolRegistry.applyAll`).
  - Replay runs off the main thread. When a step is added, only that step runs; undo replays the list.
  - Results from the comparison grid are committed without running the tool again.
- **Stack format.** Phase 12 assumed `{"steps":[…]}`. The real phase-11 format is `{"version":1,"applied":n,"ops":[{tool,params}]}`. `StackCodec.migrateV1` now reads `ops`, keeps only the applied ops, and keeps them all as ToolSteps. `whitebalance` and `geometry` used to be mapped wrongly onto sliders. Tests: `migratesRetouchStackKeepingOnlyAppliedOpsAsToolSteps`, `historyListsFutureStepsNextFirst`.
- **Metadata.** Retouch disclosure (`RetouchExif`) is written on export even when metadata is stripped. Checked on a device export: `Software = Open Camera (retouch: generated,reshape)`.
- **RetouchActivity.** It is no longer exported and has no intent filters. It is only a fallback route ("Classic retouch screen") when the toolbox cannot load.
- **Mode change dropped during a rebind.** Cause: `setCameraMode` holds `rebindMutex` across the suspending `getSuitableCamera`, so a second `tryLock` failed silently. Now the latest request is queued and runs after unlock. On the device, the first swipe after a cold start switched to Video.
- **Rebind cost** (`dumpsys gfxinfo`, 20 Photo↔Video swipes, debug build, gauguin):

  | | p50 | p90 | p95 | janky |
  |---|---|---|---|---|
  | before | 31 ms | 105 ms | 200 ms | 33.5 % |
  | after | 31 ms | 150 ms | 200 ms | 33.0 % |

  - What changed: the bind now runs in its own frame (`awaitFrame`), and the freeze snapshot is a quarter-size async `PixelCopy` (or `TextureView.getBitmap(w,h)`).
  - **No measurable gain.** CameraX `CameraController` must be configured on the main thread, so the bind itself still blocks a frame. The 16.6 ms p95 target is not met.
- **Landscape labels.** Rotated top-bar text is scaled to fit the 44 dp bar ("1080p", "BẬT MIC").
- **Translations.** About 560 strings were added in `values-vi` (camera, ai, pro, creative, looks, video modes, develop, retouch, editor UI). "Creative", "Portrait off" and "More" are now translated (seen on the device).
- **Android.bp.**
  - `app:generateBp` was re-run.
  - Kept: `kotlin_plugins: ["androidx.compose.compiler_compiler-hosted-plugin"]`; the generator keeps it.
  - BOM fix: `availableInAOSP` now returns false for `*-bom`. The BOM then becomes an empty `java_library_static` (`OpenCamera_androidx.compose_compose-bom`) in `app/libs/Android.bp` instead of a reference to a module that AOSP does not have.
  - The ROM build was not run.
- **Settings button (user report).**
  - The settings glyph is now a real gear in both skins. Tap opens the full Settings screen; Appearance (Glass/Origin, blur) is its first category.
  - Long press opens the quick sheet, which has the Glass/Origin switch and blur.
  - The More sheet has a "Glass/Origin" switch tile and an "All settings" tile.
  - Verified on gauguin (`camera-glass-settings-sheet`, `camera-settings-screen`, `camera-origin-photo`, `camera-origin-more`).

## Part B: editor UI (Compose, `develop/ui/compose/`)

- **Theme.**
  - The editor uses the camera's `Skin`/`LocalSkin`, which wraps `SkinTokens` from `SkinRepository`. Skins switch live.
  - `DevelopTheme.current` is derived from the tokens, so the View parts (dialogs, overlay) match.
  - The plan's guessed names (`EditorViewModel`, `SkinSheet`) were not used. The activity stays the owner of the stack, and `EditorUiState` is the observable bridge.
- **Hosting.**
  - `OverlayHost` was generalized: it takes a content lambda and an optional crash guard.
  - Fallback chain: a skin error moves to the other skin (in-session only, so the camera's choice is not changed). If both fail, the plain Material editor is used. The plain editor is also available with `--ez develop_plain_ui true`.
  - Checked with `--es debug_skin_fail all`: the plain editor appeared and nothing crashed (`fallback-plain-editor`).
- **Layout.**
  - Glass: full-bleed photo, floating capsule buttons, gradient dock, capsule category bar.
  - Origin: framed photo with 6 dp corners, solid `#121214` dock, orange accent.
  - Landscape or ≥600 dp: an 80 dp scrollable left column for the top bar, the photo, and a 292 dp dock on the right.
- **Top bar:** close, undo, redo, history, compare (tap = split view, hold = original), more (histogram, clipping, snapshots, copy/paste, batch, XMP, revert), Done (export sheet). The RAW badge sits on the photo.
- **8 categories:**
  - **Auto:** auto, tone, WB, straighten, undo auto.
  - **Adjust:** 18 parameters with a dirty dot and a ruler dial.
  - **Looks:** grid of real 256 px proxy thumbnails, intensity/strength dial, save/import `.cube`, copy/paste, batch.
  - **Crop:** aspect presets, straighten/vertical/horizontal on the dial, rotate, flip, auto, reset.
  - **Retouch:** see below.
  - **Masks:** AI subject/person/sky/background (greyed out when no model), brush, linear, radial, luminance, colour; add/subtract/intersect/invert, overlay, on/off, delete; local adjustments on the dial.
  - **Color:** Compose curve editor (RGB/R/G/B, drag, long press to delete, numeric entry), HSL (8 colour dots × hue/sat/lum), grading (3 wheels + global/blending/balance + numeric entry).
  - **Export:** sheet.
- **Ruler dial:** drawn on a Canvas, 2 dp per step, snaps to the default, double tap resets (recorded in history). Haptics: tick every 10 steps, confirm at the default. TalkBack sees a slider (range info + setProgress).
- **Retouch panel:**
  - remove with brush/unbrush/tap-select and size; "Remove ▸" opens a grid of 2–4 results with a draggable before/after divider;
  - spot (tap), skin/teeth/eyes (strength + apply), red-eye (auto/tap), straighten/perspective/lens (dials, lens profile, auto grid, apply), WB (tap, or a grid of the estimators);
  - reshape is hidden behind "Show reshape" and shows its disclosure notice;
  - strokes are drawn in Compose over the photo.
- **Sheets:**
  - History: newest first; redo steps dimmed at 40 %; tap jumps to a step. Labels are localized from their keys.
  - Export: JPEG/HEIF/PNG (+AVIF when available), size, quality, metadata (default: remove location), keep original (off means overwrite with a confirmation), save, share, XMP export/import. If a HEIF/PNG/AVIF encode fails, the export retries as JPEG with a toast.
- **Gestures:** pinch/pan; one-finger pan when zoomed; double tap 1×↔2.5×; long press 280 ms shows the original with a label and haptic; swipe across the dock changes category; back closes sheets and the grid first.
- **Accessibility:** touch targets ≥ 48 dp; content/state descriptions; live regions for status and "Original". Animations follow the system scale through the skin's motion.

### Not done or deviating (Part B)

- **60 fps dial drag is not met** on gauguin:
  - debug build: p50 34 ms, p95 65 ms;
  - non-debuggable, speed-compiled build: p50 28 ms, p95 57 ms, 22 % janky.
  - gfxinfo shows "Slow issue draw commands" on every janky frame, so the GPU is shared with the develop draft render (14–23 ms per draft at view size).
  - Recomposition during drags was removed (no revision bump while dragging).
  - A smaller draft proxy (≤1440 px, as the plan says) is the next step.
- **Not supported:** DNG export (no DNG writer), Kelvin WB for RAW (the engine is relative), brush "hardness" for retouch (the tools have no such parameter), Sky mask (no model).
- **Plain fallback editor:** its top bar draws under the status bar on Android 17 (edge-to-edge). Cosmetic.
- **Not run:** Compose UI tests and a TalkBack pass on the device.

## Part C: device verification on gauguin (c28004a8)

Screenshots are in `plans/reports/open-camera-shots/editor-ui/`.

- **Glass.**
  - Screens: adjust, adjust-exposure, auto, auto-applied, looks, crop, curves, hsl, grade, grade-wheel, masks, masks-brush, history, export, share (Android chooser), xmp-export.
  - Exports: JPEG 1.26 s, HEIF 1.30 s, PNG 5.37 s (3840×2560). All saved to `Pictures/OpenCamera/Edited`.
  - XMP sidecar saved (725 B). XMP import: the picker was not driven to the end, because another session sent the phone home.
- **Origin, retouch on a portrait (all 9 tools once).**

  | Tool | Result |
  |---|---|
  | remove | grid: migan 3.35 s, patchmatch 1.10 s, telea 0.46 s; split view; "Use migan" |
  | spot | telea 81 ms |
  | skin | 5.76 s (debug, full proxy) |
  | red eye | 39 ms |
  | teeth | 48 ms |
  | eyes | 23 ms |
  | straighten | manual +1.3°, 62 ms |
  | WB | estimator grid |
  | reshape | slim 50 %, 342 ms |

  - The history sheet shows all 9 steps.
  - Reopening replayed the stack from `EditStore`.
  - The first export skipped erase and blemish: they edit in place, and the decoded export bitmap is immutable. Fixed in `92e7f22`. After the fix, all 9 replayed at full resolution: export 1965×2740 in 3.9 s.
- **RAW.** DNG (Pixel 3a), NEF (D3400), ARW (A6000) and CR3 (M50) all opened, with the RAW badge:

  | File | First frame |
  |---|---|
  | DNG | 3.9 s |
  | NEF | 3.5 s |
  | ARW | 4.0 s |
  | CR3 | 4.1 s |

  These are debug build numbers. The CR3 was copied into the app's private files with `run-as`, because MediaStore lists it as octet-stream.
- **Landscape:** `origin-landscape`.
- **Camera smoke (Origin):**
  - photo taken; video recorded (thumbnails updated);
  - More sheet; quick settings sheet; full Settings screen; Glass→Origin switch.
  - The Pro and looks screenshots failed because the phone was being driven by other sessions. Pro was verified in the ui-skins report, not again here.
- `logcat -b crash`: no entries from `dev.opencamera.app.dev` in any session. The app was force-stopped and the phone sent home after each session.
- **iQOO:** not reachable over wireless adb at the end of the session (`adb devices` did not list it). Not installed or tested.

## Test data

`D:\Projects\open-camera-testdata`, commit `6115ffa` (not pushed): `manifest.json` gains `raw-nikon-d3400`, `raw-sony-ilce-6000` and `raw-canon-eos-m50-craw`. For each: raw.pixls.us URL, CC0 1.0 (checked in the site's `repo.json`), sha256, size, mime.

## Concerns

1. LibRaw (from phase 12) is LGPL-2.1. The agent brief forbids LGPL. Phase 12 isolated it as a replaceable `.so` with source, but this needs a decision.
2. Mode-switch frame p95 (200 ms) and dial drag (57 ms p95 release-like) are far from 16.6 ms. Both are GPU/main-thread bound, as above.
3. The shared phone was interrupted several times by other sessions (activity closed, sent home). Some screenshots were retaken; XMP import and the Pro/looks smoke tests were not completed.
4. The ROM (Soong) build is untested.
