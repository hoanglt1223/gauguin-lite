# Open Camera: Phase 7 (Pro and RAW)

Plan: `plans/261109-2101-open-camera-app/phase-07-pro-raw.md`. Date 2026-11-11.
Worktree `D:\Projects\open-camera-wt\phase7-pro-raw`, branch `feat/phase7-pro-raw` (base `49176b8`), not pushed.

| Commit | Content |
|---|---|
| `6df060b` | feat(pro): manual controls, RAW format switch and viewfinder assists |
| `d5b6fd3` | test(pro): device script for manual exposure EXIF and DNG checks |

## Features

All new code is in `app/src/main/java/dev/opencamera/app/pro/` and `res/values/pro_strings.xml`.

- **Pro toggle**: a "Manual" pill at the top end of the viewfinder, shown only in PHOTO mode. Off means the stock Aperture behaviour, which also acts as the rollback flag. On/off is stored globally.
- **Manual exposure** (`ProRequestOptions.kt`): ISO and shutter in third stops built from `SENSOR_INFO_SENSITIVITY_RANGE` / `SENSOR_INFO_EXPOSURE_TIME_RANGE`. Both ends of the device range are always included, so long exposure goes up to the device maximum. Settings: `CONTROL_AE_MODE_OFF`, `SENSOR_SENSITIVITY`, `SENSOR_EXPOSURE_TIME`, `SENSOR_FRAME_DURATION = max(exposure, 1/30 s)`. Camera2 turns AE off for ISO and shutter together, so moving one slider while auto fills the other with a default (ISO 400 or 1/60).
- **Auto exposure aids**: EV compensation (`CONTROL_AE_EXPOSURE_COMPENSATION`, disabled while manual), AE lock (`CONTROL_AE_LOCK`), and metering through `CONTROL_AE_REGIONS` (centre 40 %, spot 8 %, matrix full array; hidden when `CONTROL_MAX_REGIONS_AE` is 0).
- **White balance**: Auto plus the presets Incandescent, Fluorescent, Daylight, Cloudy and Shade (`CONTROL_AWB_MODE`, filtered by `CONTROL_AWB_AVAILABLE_MODES`). Kelvin runs from 2000 to 10000 K in steps of 100, in this order of preference:
  1. API 36 `COLOR_CORRECTION_MODE_CCT` when the HAL lists it.
  2. With `MANUAL_POST_PROCESSING` and forward matrices: AWB off, `COLOR_CORRECTION_GAINS` and `COLOR_CORRECTION_TRANSFORM` computed with the DNG colour model. The CCT gives a Planckian xy point (Kim et al. fit), the colour and forward matrices are interpolated linearly in mired between the two reference illuminants, gains = neutral G / neutral(R, B), and the transform is XYZ(D50)→sRGB × FM, normalised so camera white maps to white.
  3. Otherwise the nearest AWB preset.
- **Manual focus**: `CONTROL_AF_MODE_OFF` + `LENS_FOCUS_DISTANCE`, slider from 0 (infinity) to `LENS_INFO_MINIMUM_FOCUS_DISTANCE`, shown in metres. **AF lock** is CameraX `startFocusAndMetering` at the centre with auto-cancel disabled.
- **Clamping**: `ProSettings.clampTo(ProRanges)` runs on every load and change. A control is dropped when the device lacks it (no `MANUAL_SENSOR` hides ISO, shutter and focus), and EV is forced to 0 while exposure is manual.
- **Persistence and reset**: settings are stored per Camera2 id in SharedPreferences `pro_mode` as JSON (`ProSettingsStore`). "Reset" restores the defaults for the current lens.
- **Assists** (`ProOverlayView`): every 66 ms, `PreviewView.bitmap` is scaled down to 320 px wide on `Dispatchers.Default`. From it the overlay draws:
  - a 64-bin luma histogram
  - Sobel focus peaking (red)
  - zebra stripes at luma 250 or above
  - a light meter in manual exposure (stops from 18 % grey, sRGB-decoded mean luma)
- **RAW/DNG**: Aperture already had CameraX `OUTPUT_FORMAT_RAW` / `RAW_JPEG`, which writes the DNG through `DngCreator` to `DCIM/Camera/*.dng` via MediaStore, with orientation and location from `ImageCapture.Metadata`. The Pro panel adds a format chip that cycles JPEG → RAW+JPEG → RAW. The chip writes the existing `enable_raw_image_capture` / `disable_jpeg_with_raw` preferences, and the view model then rebinds. The chip is shown only when the camera reports `RAW_JPEG` in `ImageCaptureCapabilities`.
- **Accessibility**: every chip has a content description of the form "Label: value" or "Label: on/off". The slider has a content description, and `stateDescription` on API 30+. The overlay is not important for accessibility. Touch targets are at least 48 dp.
- **Capability log**: on each bind, logcat tag `ProModeUi` prints the manualSensor, manualPost, raw, ISO and exposure ranges, minFocus, cct and kelvin values.

## Evidence

- `gradlew assembleDebug test lint` is green (JDK 21, `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`).
- 14 unit tests pass in `app/src/test/java/dev/opencamera/app/pro/ProMathTest.kt`. They cover:
  - range clamping, including unsupported controls and half-manual exposure
  - ISO and shutter stop tables and range ends
  - log-scale nearest stop
  - shutter and EV formatting
  - EV100 (sunny 16 = 14.64) and the meter offset
  - CCT→xy against D65 and illuminant A
  - gains with an identity calibration, and warmer light giving more blue gain
  - the colour transform mapping white to white
  - the mired interpolation weight
  - the nearest preset
  - histogram, peaking and zebra masks
- **Device test not run.** `adb devices` stayed empty for the whole session, and the only Android node on the tailnet (`v2520a`, <tailnet-ip>) refused port 5555. Ready to run: `python scripts/pro-device-test.py --pin-file D:\Projects\gauguin\.tools\.pin --out <dir>`. It needs a debug build installed and Pillow. It:
  - writes per-lens settings through `run-as`
  - shoots with KEYCODE_CAMERA: ISO 100 at 1/1000 with 6500 K and far focus, then ISO 1600 at 1 s with 3200 K and near focus
  - checks EXIF ISO and ExposureTime (±5 %) and reports mean R/B to compare the two WB settings
  - taps the format chip for RAW+JPEG and checks the DNG header, DNGVersion, Orientation, ISO and exposure
  - cycles the format back to JPEG and deletes the Pro prefs.
- gauguin RAW support was not confirmed live. The phase-2 profile fixture lists `RAW` on the main camera, and the stock Aperture RAW path is unchanged.

## Merge notes

- Shared files touched:
  - `CameraActivity.kt` (+18/−2): the `proModeUi` lazy field, `proModeUi.attach()` in `onCreate`, and the base `CaptureRequestOptions` now passed to `proModeUi.bind(...)` instead of `camera2CameraControl.setCaptureRequestOptions(...)`. Any sibling that adds base Camera2 options should add them to that same builder chain.
  - `app/build.gradle.kts`: `testImplementation(libs.junit)`. It is not in `releaseRuntimeClasspath`, so `Android.bp` does not change.
  - No layout XML changes: the views are added to `mainLayout` in code.
- `ProModeUi` calls `setCaptureRequestOptions(base)` and then `addCaptureRequestOptions(pro)`, so Pro keys override base keys and turning Pro off clears them.
- Phase 2 lens UI: `ProModeUi` keys settings by Camera2 id from the bound `CameraInfo`, so it should work unchanged with `LensPlan` stops. Crop stops share the main lens's settings.
- Phase 4 (native multi-frame): manual settings apply to every request, including still captures. Burst RAW was not built here.

## Deviations and gaps

- Focus peaking and zebra run on the CPU at about 15 fps on a 320 px frame, not on a GPU shader at 30 fps or more as the phase file asks.
- There is no readback from `CaptureResult`: CameraController exposes no session capture callback. Effects:
  - The auto value is not used as the starting point when switching to manual.
  - A HAL that ignores manual values is not detected in the app. The device script catches it through EXIF.
- Not done from the phase file:
  - user presets
  - EV bracketing
  - HEIF and Ultra HDR additions (stock Ultra HDR is unchanged)
  - Pro video
  - the `RAW_BLACK_LEVEL_WRONG` quirk
  - burst RAW
  - a separate `DngWriter` (CameraX DngCreator is used)
- The rough sRGB-like matrix in the "warmer light" test is synthetic. Kelvin colour accuracy on gauguin still needs a check: compare a grey card at 3200 K and 6500 K in tungsten and daylight.

## Unresolved questions

1. Re-run the device script when gauguin is back on adb (USB or `adb connect <ip>:5555`). Is a scheduled slot needed because the phone is shared?
2. Is a CPU assist overlay acceptable for now, or is the GPU peaking shader needed before merge?
