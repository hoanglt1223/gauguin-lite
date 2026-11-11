# Open Camera: camera UI skins (Glass, Origin)

Date 2026-11-11 (Asia/Saigon). Worktree `D:\Projects\open-camera-wt\ui-skins`, branch `feat/ui-skins`, commit `add7c02` on top of `main` `aec7d31`. Not pushed.
Gates: `gradlew assembleDebug test lint` green; `app:generateBp` run (see Android.bp note).

## What was built

- **Skins**: `ui/skin/SkinTokens.kt` holds toolkit-free tokens (ARGB colors, radii dp, type sp, motion ms + easing, shape). This is the interface for the editor/retouch phases: `Skins.byId(SkinRepository.get(ctx).skin.value.id)` or read `SkinRepository.skin` (StateFlow). Two skins: **Glass** (default) and **Origin**. `validate()` rejects transparent colors, controls < 48 dp, bad durations; unknown, empty or null ids give Glass.
- **Overlay** (`ui/overlay/`): one `ComposeView` above the `PreviewView`. The View controls of `activity_camera.xml` stay in the layout, hidden, and keep all their logic. The overlay mirrors their state (labels, enabled, visible) and clicks them, so no feature path was rewritten:
  - Carousel More, Night, Portrait, Photo, Video, Pro, Scan. Night, Portrait and Pro are Photo with multi-frame NIGHT, AI portrait or Pro switched on. Leaving them switches the feature off. Swipe works on the carousel and on the preview (RTL aware).
  - More sheet: the More-activity modes (probed with the same `VideoCapsProbe`, so only supported ones show), creative modes, Astro, HDR on, Color match, and Google Lens when available. An active creative mode shows a chip with an X under the top bar.
  - Top bar: flash (long press = force torch), HDR/Night/Astro cycle, motion photo, timer, looks, settings. In Video it shows quality, fps, mic, timer and settings. Only flash remains while recording.
  - Lens chips (from `LensSelectorLayout`, so profile chips and the logical-zoom logic are unchanged). Long press and drag opens the zoom dial, with a tick every 0.5×.
  - Pro: tabs ISO / Shutter / EV / WB / Focus / Meter with ruler dials, plus JPEG/RAW, AE-L, AF-L, peaking, zebra, histogram and reset. It drives `ProModeUi`, whose View toggle and panel are hidden in this mode.
  - Looks strip, settings sheet (skin picker, Glass blur, aspect, effect, HDR, creative, portrait, motion, pre-shot, timer, grid, video rows, All settings), recording pill with pause/resume, shutter press/busy/record animations, thumbnail pop.
- **Settings → Appearance**: `ui_skin` (Glass/Origin) and `ui_blur`. Switching takes effect immediately with a 240 ms crossfade, with no rebind and no activity restart. Verified both from the in-camera sheet and from the system Settings screen.
- **Preview box per skin**: it sits below the top bar and is shaped to the stream ratio (3:4, or 9:16 for video and 16:9). Origin insets it 8 dp with 20 dp corners. The corners are masks drawn by Compose, because a SurfaceView ignores outlines. The scene chip moved to the top of the preview. The Pro meter text moved next to the histogram. The focus ring now uses an offset fix so it lands under the finger.
- **Blur**: Glass sheets blur one preview snapshot. FULL uses `Modifier.blur`/RenderEffect and needs API 31+ with a media performance class of 31 or more. STATIC is a CPU downscale blur. NONE is a solid 92% surface. The level steps down for low-RAM devices and when the measured CPU blur exceeds 8 ms; the user switch turns it off. The live preview is never blurred. gauguin uses STATIC (performance class 0). Origin is solid.
- **Never crash**:
  1. The Compose layer runs on its own Recomposer with an exception handler.
  2. `SafeHost` catches measure, layout, draw and touch exceptions.
  3. The first composition is attached inside a try, with a private LifecycleRegistry. Without that, an exception corrupted the activity's registry and the next skin never composed; this was found on the device.
  4. A runtime failure moves to the other skin, then to the classic View layout with a toast.
  5. `skin_crash_pending` handles process death: the first relaunch uses the other skin, the second uses the classic layout until the user picks a skin again.
  6. Every overlay action goes through `FeatureGuard.attempt`.
- **Haptics** (`Haptics`): tick for dial and zoom steps, segment for mode/chip/toggle, confirm for the shutter, long press when recording starts or AE/AF locks, confirm when recording stops.
- **Accessibility**: every target is 48 dp or larger. Content and state descriptions are set; the shutter label follows its state; the carousel is a `selectableGroup` of tabs; chips are radio buttons; dials have range info plus `setProgress`; the recording timer is a polite live region. Labels have a shadow, and Glass has a bottom scrim for contrast over bright frames. Durations scale with the animator scale (0 = no animation).
- **Landscape**: the activity stays portrait; glyphs rotate the short way. A debug-only `--es debug_glyph_rotation 90|270` pins the angle for screenshots, because the phone sits on a stand. The real sensor path was seen working on the iQOO.
- **Strings**: English plus Vietnamese (`values-vi/strings_skins.xml`).
- **Fonts**: system font; nothing bundled. NOTICE now lists Compose (Apache-2.0) and states that no fonts or brand assets are included.
- **Tests**: `SkinFallbackTest` (9) covers ids, validate, reduce motion, the crash-flag chain, runtime fallback and blur policy. `OverlayModelTest` (7) covers mode derivation, swipe and the Pro dial mappings.

## Evidence on gauguin (c28004a8)

I installed the build as `dev.opencamera.app.skins` (`-PopenCamera.debugIdSuffix=.skins`) so it does not overwrite the other phases' `.dev`. Screenshots are in `plans/reports/open-camera-shots/ui-skins/`:

| Screen | Glass | Origin |
|---|---|---|
| Photo | glass-photo | origin-photo |
| Looks strip | glass-looks | origin-looks |
| Pro (ISO dial moved to 80, applied per `ProModeUi` log) | glass-pro, glass-pro-iso | origin-pro |
| Video, recording, paused | glass-video, glass-video-recording, glass-video-paused | origin-video-recording |
| More sheet | glass-more | origin-more |
| Settings sheet (blurred backdrop on Glass) | glass-settings | origin-settings |
| Landscape glyphs | glass-landscape | origin-landscape, origin-landscape-settings |
| Other | fallback-legacy (both skins failed, View layout), settings-appearance, origin-after-settings-switch, origin-zoom-ring | |

Functional checks:
- Photo capture works; the HDR-auto night burst saved after about 50 s, a known gap from wave 2.
- Video recording: start, pause, resume and stop all work, and the thumbnail updates.
- Pro dial sets manual ISO; swipe and carousel switch modes; the zoom dial reaches 1.5×; the creative tile turns Moon on.
- The skin switch is instant in both directions.
- Injected failure (`--es debug_skin_fail all`) gives glass fail → origin fail → classic layout plus toast, with preview kept and no crash. Before the fix this crashed; that was the bug that led to the private lifecycle.
- `logcat -b crash` shows no entries from `.skins`. The SIGSEGV in the crash log belongs to another phase's `.dev` retouch (`libopencamera_retouch.so`).

Performance:
- **Preview fps** (SurfaceFlinger present times of the camera SurfaceView, 5 × 3 s): Glass overlay 29.9–30.2, mean **30.0**; classic layout **30.0**. No drop.
- **Idle recomposition**: 0 in 5 s with the preview running. Idle UI frames: 0 in 10 s.
- **20 Photo↔Video switches by swipe (Origin)**: p50 23 ms, p90 40 ms, p95 65 ms, 11% janky. These frames include the camera rebind on the UI thread (`bindCameraUseCases`, `PreviewView.getBitmap` freeze), not only Compose. I could not finish the classic-layout run for comparison: the other phases took over the phone (DevelopActivity, RetouchActivity), and the first attempt measured their app. The ≤16.6 ms p95 target is **not met** as measured.

## iQOO Neo 11 (V2520A, wireless adb)

- Installed `dev.opencamera.app.skins` with `install -r -g` and no on-phone prompt. Launched with `am start`: TotalTime 852 ms, Glass overlay drawn, glyphs rotated by the real orientation sensor, lens chips 1×/2, no crash. No taps were made.
- Screenshot: `iqoo-glass-photo.png`, with the right edge cropped to remove the user's chat bubbles.
- Not measured on the iQOO (fps/jank need interaction): the user can switch the skin in Settings → Appearance by hand.

## Shared files touched (merge notes)

- `CameraActivity.kt`: about 400 added lines, mostly one new section at the end, plus small hooks (insets, fling, shutter counter, gallery, recording pause, portrait, looks, zoom slider, focus ring offset).
- `ProModeUi.kt`: `externalUi`, `uiState`, public `setEnabled`.
- `ProOverlayView.kt`: meter text position.
- `LensSelectorLayout.kt`: `snapshot`/`clickAt`/`onButtonsChanged`.
- `SettingsActivity.kt` and `root_preferences.xml`: Appearance section.
- Build files: Compose BOM 2025.06.01 and the `kotlin.plugin.compose` plugin. `debugIdSuffix` is a Gradle property; the default is still `.dev`.
- `NOTICE`.
- `app/Android.bp`: regenerated (Compose libs). I added `kotlin_plugins: ["androidx.compose.compiler_compiler-hosted-plugin"]` by hand. `androidx.compose_compose-bom` in the generated list may need a filter in `availableInAOSP`. **The ROM build is untested.**
- `activity_camera.xml` is unchanged and remains the last fallback. Phase 11/12 areas were not touched.

## Remaining / concerns

1. The mode-switch frame budget is not met (p95 65 ms) and has no classic-layout baseline. Likely cause: the synchronous rebind on the UI thread. It needs a clean run when the phone is free.
2. Pre-existing: the first mode change after launch is often ignored, because `updateConfiguration` uses `rebindMutex.tryLock()` and drops it silently. This affects the classic layout too.
3. Rotated top-bar text labels in Video (`1080p`, `BẬT MIC`) overflow the capsule height in landscape.
4. Some value labels come from existing untranslated strings (`Creative`, `Portrait off`, `More`).
5. TalkBack and Accessibility Scanner were not run on the device. I did not want to change accessibility services on a shared phone. Semantics exist in code only.
6. No Compose UI or screenshot tests (Roborazzi); only JVM tests.
7. **Shared phone incident**: at 15:31 another phase's RetouchActivity came to the front during my input sequence, so up to two taps (around 707,1922 and 540,2160) may have landed in that app. After that, all taps went through a guard that checks the top activity.
8. Cold-start delta (target ≤ 80 ms) not measured. Launch-to-displayed in this session was about 3.7 s for the debug build, consistent with wave 2.

Status: DONE_WITH_CONCERNS
