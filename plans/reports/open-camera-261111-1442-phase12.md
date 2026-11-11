# Open Camera: phase 12, photo editor (post-processing)

Date: 2026-11-11 (Asia/Saigon).
Worktree: `D:\Projects\open-camera-wt\phase12-editor`, branch `feat/phase12-editor`.
Commit: `0e1def5` on top of `aec7d31`. Nothing is pushed.

Gates:
- `gradlew assembleDebug test lint` is green.
- `app:generateBp` was run on its own. `app/Android.bp` changes by 3 lines: HeifWriter, and the
  2 LibRaw jni libs.

Design notes and the integration points are in `docs/photo-editor.md` in the worktree.

## What was built

The code is in package `dev.opencamera.app.develop` (app module). The entry point is
`DevelopActivity`. It opens from:
- `ACTION_EDIT`, `SEND` and `SEND_MULTIPLE` with `image/*` ("Edit with Open Camera");
- `application/octet-stream`, for camera RAW files.

The `editor_v2` preference is the rollback switch: when it is `false`, the intent goes to
`AiEditActivity`.

| Area | State |
|---|---|
| Edit stack | **Format.** `EditStack` v2 JSON (`StackCodec`). Only non-default values are stored. Unknown keys are kept. **Migration.** v1 (list of `{tool, params}`) is migrated: WB and geometry become sliders, other steps become `ToolStep`. **Storage.** `EditStore` saves to `files/edits/<id>-<sha256/16>.json`, written atomically. **Lookup.** If the id changes, the stack is found by hash. If the hash changes, it is found by id (MediaStore redacts location bytes depending on `ACCESS_MEDIA_LOCATION`, which changes the hash; seen on the device). **History.** Undo/redo merges drags on one slider into one step. Snapshots can be named and compared. Revert clears the stack. |
| GPU pipeline | **Engine.** GLES 3.0 with RGBA16F intermediates, in this fixed order: NR, WB (Bradford), exposure, dehaze (dark channel), tone (edge-aware base for highlights/shadows, contrast), clarity/texture, shoulder + encode, whites/blacks, sat/vibrance/HSL, grading, curve, look LUT, sharpen, vignette, grain. **Shared look GLSL.** The look GLSL now lives in `pipeline/.../LookGlsl.kt`, used by both the camera preview and the editor. **Caching.** The medium/large blur pyramid and the fine blur are computed once per photo. A slider change runs only the develop pass. **Draft frames.** During a drag the preview renders at view resolution, and the full proxy renders on release. **CPU fallback.** The CPU kernel (`DevelopKernel`) is the line-by-line reference. Proxy size depends on RAM (2048/2560/3072). |
| Global adjustments | Exposure ±5 EV, contrast, highlights, shadows, whites, blacks, temperature/tint (relative), vibrance (skin-protected), saturation. Curves: RGB and R/G/B monotone (Fritsch-Carlson), plus a parametric curve. Mixer: HSL with 8 soft bands, and tap-to-pick a band. Colour grading: wheels for shadows/mid/high/global, blending, balance, and numeric entry for TalkBack. Detail: clarity, texture, dehaze, sharpening (amount/radius/detail/masking), NR luma/colour. Effects: vignette (midpoint/roundness/feather/highlight protect), grain (size/roughness; seed and cell size relative to the output). |
| Crop and geometry | Ratios: free, original, 1:1, 4:5, 3:2, 16:9, 9:16 and 65:24. Rotate 90, flip H/V. Straighten ±45 with automatic crop shrink so no border shows. Keystone V/H. Crop handles on the preview. |
| Auto | Auto (all), tone, WB (gray-world, partial, ignores casts under 2%), straighten (gradient orientation histogram). HDRNet does not exist yet, so the UI says the statistics Auto was used. |
| Presets | **Built-in.** All camera looks, plus parametric presets: B&W contrast, Matte, Warm film. **User presets.** Group subsets you choose, rename, reorder, delete. Strength interpolates parameters and scales the LUT. **Files.** `.cube` import (1D and 3D, validated) and `.ocpreset` (JSON, user LUT inline). Sharing via `ACTION_SEND`. **Thumbnails.** Lazy, rendered on a 256 px proxy. **Copy/paste.** By group. **Batch.** `DevelopBatchService` is a foreground service with progress and Cancel; each photo keeps its own stack and gets a new export. **Colour match.** Its results are user looks, so they show up as LUT presets on their own. |
| Local masks | Brush (size/feather/flow/erase, strokes stored as vectors), linear and radial gradients, luminance range, colour range (tap to sample), and AI person/subject/background (through `:ml`, refined with a guided filter, saved as a PNG with the model id). Masks combine with add/subtract/intersect/invert and have 11 local sliders. Up to 4 masks. Sky is hidden with a reason, because there is no sky model. |
| Retouch integration | `tools/DevelopTool` + `ToolRegistry.register()` and `ToolHost`. Steps run on the upright source before tone, at both proxy and export scale. Unknown or failing tools are skipped and the user gets a toast. The integration point is documented. No tools are registered in this branch. |
| Before/after | Hold to show the original. A draggable split compares with the original or with any snapshot. Each panel has a switch to turn its effect off, and each mask has an on switch. Live RGB + luma histogram. Clipping warning uses a hatch pattern, not only colour. |
| RAW | See the RAW section below. |
| Export | **Tiles.** 2048 px tiles with a margin, same shader as the preview. A CPU fallback is used if GL fails. **Formats.** JPEG 50–100. HEIF via androidx `HeifWriter`, offered only on API 28+ with an HEVC encoder. AVIF only if `CompressFormat.AVIF` exists. PNG. **Size.** Original, 4096, 2048, 1080 or custom, with output sharpening for screen or print. **Metadata.** Keep, remove location (the default when sharing), or remove all. Orientation is reset to 1. **XMP.** `CreatorTool`, `History` and `opencamera:EditStack`. Opening an export reopens its original with those edits. **Saving.** MediaStore `IS_PENDING` in `Pictures/OpenCamera/Edited`. Sharing via `FileProvider`. Overwrite uses `createWriteRequest` (30+) or `RecoverableSecurityException` (29), and keeps a 30-day backup. |
| Lightroom XMP | Partial `crs:` import and export. The list of what does not transfer is shown in the UI and in the docs. |
| Accessibility and i18n | Material sliders with announced values (locale decimals, e.g. "2,88" on the vi device). Reset by double-tap on the label or the "Reset" accessibility action. Volume keys and D-pad step the slider. Touch targets are ≥ 48 dp. Strings are in `develop_strings.xml`, with plurals. |

### RAW

- **Own DNG reader** (`raw/DngReader.kt`, `raw/Lj92.kt`), written from the DNG 1.6 and T.81
  specifications. It supports:
  - uncompressed 8/16-bit and bit-packed data, and lossless JPEG (with a lookup table and
    parallel tiles);
  - `LinearizationTable`, `ActiveArea`, `DefaultCrop`;
  - `OpcodeList2` GainMap;
  - Color/ForwardMatrix 1/2, interpolated by CCT.
- **Develop.** Previews use 2x2 binning straight into half floats. Exports use Malvar-He-Cutler.
  The result is a linear `RGBA_F16` bitmap (headroom up to 64) built from a direct buffer, so it
  does not use the Java heap.
- **LibRaw 0.22.3.** Built as `libopencamera_libraw.so` (unmodified source in
  `pipeline/third_party/LibRaw`) and loaded dynamically by `libopencamera_rawjni.so` (C API only).
  Both are 16 KB-aligned with static libc++. It is also used as a fallback for DNG variants outside
  the subset.

## Device evidence: gauguin (c28004a8)

Timing method:
- A non-debuggable build of the debug variant, made with a temporary local `isDebuggable = false`
  that was **not committed**.
- `cmd package compile -m speed` before measuring.
- The in-app benchmark: `--ez develop_benchmark true`, logcat tag `DevelopBench`.

The debuggable build is 2–5x slower on the CPU parts (decode, parsing).

| Operation (target) | Result |
|---|---|
| Slider drag on the 12 MP proxy (< 50 ms) | Draft frames at view size: **exposure 14 ms, full stack 23 ms** (median of 10, JPEG 3840x3522). Release-to-full proxy render at 2560x2348: 60 ms (exposure), 84 ms (mix), 97 ms (full stack). DNG proxy 2008x1504: 33–51 ms full, 13–19 ms draft. |
| Pyramid sliders with cache (< 50 ms) | Draft < 25 ms. Full proxy 62 ms. |
| Pyramid recompute (< 150 ms) | 107–120 ms (linearize + mips + 2 blurs, 6 MP). |
| Open 12 MP to first frame (< 600 ms) | **506 ms** (13.5 MP JPEG, release-like). Debuggable build: 630–760 ms. |
| AI mask on the proxy (< 800 ms) | Person (selfie segmenter): **173 ms** (90 ms on 3 MP). Subject: the `u2netp` model is not on the phone, so it is reported unavailable (no crash). |
| Full-res 12 MP JPEG export, full stack without ML (< 3 s) | **1.39–1.56 s** (3840x3522). 12 MP DNG with demosaic: 3.1 s. 24 MP NEF via LibRaw AHD: 7.5 s. |
| RAW preview 12 MP (< 1.5 s) | DNGs: Pixel 3a 1.35 s, Mi 8 1.09 s, iPhone XS 0.81 s, Pentax K-7 1.18 s, Ricoh GR 1.18 s, Leica M9 (18 MP, 8-bit + linearization) 1.24 s. Maker RAW via LibRaw: NEF D3400 24 MP 1.92 s, ARW A6000 24 MP 1.49 s, CR3 M50 (debug build) 3.1 s. |
| 50 MP export (< 15 s) | Not measured: no 50 MP sample. The decode is capped at 50 MP. |

Functional checks:

- **Never crash.** The first device run hit a real GL bug: a 3D texture name was first bound as 2D.
  The engine fell back to the CPU preview with a toast and the app did not crash. The bug was then
  fixed.
- **RAW unreadable to the app.** A CR3 in MediaStore's files table is unreadable for apps
  (scoped storage). The editor showed "Cannot open" with a message and did not crash.
- **UI tour** (taps on gauguin): Light, Presets (thumbnails), Curve, Colour mixer, Grading wheel,
  Detail, Effects, Crop (4:5 and handles), Masks (radial). There were no `AndroidRuntime` errors.
  Screenshots are in `D:\Projects\open-camera-wt\p12-*.png`.
- **Metadata.** Tested on a JPEG with GPS (made with Pillow, pushed as `synthetic/gps-test.jpg`):
  - "keep all" + `ACCESS_MEDIA_LOCATION`: GPS 21°1'30"N 105°51'E is kept;
  - "remove location": no GPS IFD;
  - in both: Make/Model kept, Orientation=1, `xmp:CreatorTool="Open Camera"`, and the embedded
    stack decodes and carries the source id and hash.

  This was checked with Pillow, because exiftool is not installed on the host.
- **Bug found and fixed.** Without `ACCESS_MEDIA_LOCATION`, MediaStore returns GPS as zeros, and
  the first build copied those zeros into the export. Now GPS comes only from
  `setRequireOriginal`, and the permission is requested when exporting with "keep all".

**iQOO:** not tested. The rules only allow `am start`, and the editor needs a photo URI from the
phone, which can't be created without pushing files or querying MediaStore.

## Licences

| Component | License | Notes |
|---|---|---|
| LibRaw 0.22.3 | LGPL-2.1 (dual LGPL-2.1 / CDDL-1.0; LGPL is used) | Its own `.so`, loaded dynamically and replaceable. Full source is in the repo. Tarball SHA-256 `789f3c33…b227e4`. `NOTICE` and `LICENSES/LGPL-2.1-only.txt` + `CDDL-1.0.txt` were added. The `REUSE.toml` annotation is added. A Soong `license` module is added. |
| androidx.heifwriter 1.0.0 | Apache-2.0 | `NOTICE`. Manifest `tools:overrideLibrary` (HEIF is only offered on API 28+). |
| RAW test samples (not in the repo) | CC0 (raw.pixls.us, checked per file in the repository JSON) | NEF D3400 `eced1907…71a5`, ARW ILCE-6000 `ce8b4957…8d89`, CR3 EOS M50 `15384b77…be4c`. Stored in `D:\Projects\open-camera-wt\_dl\raw` and on the phone in `OpenCameraTest/raw-dng`. They are not yet in `open-camera-testdata/manifest.json`. |

No new ML models. The algorithms (dark channel, guided filter, Malvar-He-Cutler, LJ92) were written
from the papers and specifications. No code from darktable, RawTherapee, Snapseed or Fossify.

## Shared files changed (merge notes)

- `pipeline/.../looks/GlLookProgram.kt`: the LUT/tone/hash GLSL moved to the new `LookGlsl.kt`. The
  preview behaviour is the same.
- `pipeline/src/main/cpp/CMakeLists.txt` and `pipeline/Android.bp`: new targets
  `opencamera_libraw` and `opencamera_rawjni` (append only).
- `app/Android.bp`: 2 jni libs and HeifWriter.
- `app/build.gradle.kts`: `heifwriter`, and test `json`.
- `gradle/libs.versions.toml`: `heifwriter`.
- `AndroidManifest.xml`:
  - `uses-sdk overrideLibrary`;
  - `READ_MEDIA_IMAGES`, `ACCESS_MEDIA_LOCATION`;
  - `DevelopActivity`, `DevelopBatchService`, `FileProvider` (`${applicationId}.develop.files`).
- `NOTICE`, `REUSE.toml`, `LICENSES/`.
- New resources (`develop_*.xml`), so they do not collide with phase 11 or skin strings.

Phase 11 and UI skin:
- The editor is its own activity and package (`develop`), not an `editor/` module. That avoids a
  clash with phase 11's module.
- Retouch tools plug in through `ToolRegistry`. The v1 stack format is assumed to be
  `{"version":1,"steps":[{"tool","params","files"}]}`, so phase 11 should confirm it.
- Skins style the editor through `DevelopTheme.current`.

## Remaining work and concerns

1. **Not built:**
   - golden-image suite (40 images, PSNR/ΔE GPU-vs-CPU);
   - Macrobenchmark (an in-app benchmark was used instead);
   - 30-minute monkey test;
   - TalkBack, 200% font and RTL passes;
   - Vietnamese translation of the editor strings.
2. **Simplified compared with the spec:**
   - Highlights/shadows use an edge-aware base layer, not a bilateral grid or guided filter.
   - Demosaic is in Kotlin, not Halide.
   - Masks are rasterised at half proxy resolution, so hard brush edges are slightly soft at export.
   - Up to 4 active masks.
   - Temperature is relative, with no Kelvin display.
   - The HSL tool picks a band but does not drag on the photo.
3. **Ultra HDR:** the edit is on the SDR base image and the gain map is dropped with a notice. It is
   not recomputed.
4. **Very large images:** over 50 MP they are decoded downscaled, not region-decoded. 50 MP and
   200 MP were not measured.
5. **Full-size render:** the full-proxy render on release is 60–97 ms. It is only the drafts during
   drags that meet 50 ms.
6. **Not tried on the device:**
   - HEIF/AVIF/PNG export through the dialog;
   - share and overwrite (`createWriteRequest`);
   - the batch service;
   - XMP sidecar import/export UI;
   - brush painting.

   The underlying code is covered by unit tests or by bench exports.
7. **AI:**
   - subject mask needs the `u2netp` download;
   - hair/skin need the multiclass model;
   - no sky model;
   - HDRNet Auto (phase 11) is not available, so the UI says so.
8. **RAW look:** there is no default "base curve" for RAW, so RAW previews look flat until the
   user adjusts them.
9. **Unrelated warning:** the `generateBp` warning about OpenCV's license URL is old and not from
   this phase.

Status: DONE_WITH_CONCERNS
