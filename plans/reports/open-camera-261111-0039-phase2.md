# Open Camera: Phase 2 (device profiles) report

Plan: `plans/261109-2101-open-camera-app/phase-02-device-profiles.md`. Date 2026-11-11.

## Commits (local, not pushed)

| Repo | Commit |
|---|---|
| `D:\Projects\open-camera-profiles` (`main`, tag `v2026.11.11`) | `65be5e9` feat: import 263 spec catalog profiles with provenance |
| `D:\Projects\open-camera-wt\phase2-profiles` (`feat/phase2-profiles`) | `8adc04c` feat(profiles): zoom chips from merged device profile, bundled profile database |

## 1. Profile import

- `tools/import_leica_profiles.py CATALOG [EXTRA ...]` converts the Leica port catalog
  (`miui-ports/leica/extract/assets/device-profiles.json`, 261 records) plus the iQOO Neo 11,
  iQOO 13 and gauguin records (`.json` or the first ```json block of a `.md`). Extras replace
  catalog records by id or shared model code. Result: 264 files in `data/<brand>/<slug>.json`
  (oppo 94, vivo 90, redmi 47, xiaomi 33). The repo already used `data/` (validator, CI, id =
  path), so files went there instead of `profiles/`.
- Kept: brand, English name, aliases, year, model codes (`match.model`; lower-case codenames to
  `match.device`; records without codes match by marketing name), lens roles, 35 mm focal
  lengths, ratios with origin (`derived` / `official_*`), per-lens and record source URLs,
  audit date, ambiguous codes. Unpublished values are listed per lens in `runtimeFields`.
- Chinese text translated (fixed dictionary; the script fails on any leftover CJK). 10 names had
  no English alias (e.g. "OPPO A5 活力版" -> "OPPO A5 Energy Edition").
- gauguin: catalog facts merged into the existing measured `verified` profile (codes
  M2007J17C/M2007J17I, device `gauguinpro`, quirk `HIDDEN_PHYSICAL_IDS`); measurements unchanged.
- Schema: catalog profiles (`lenses` instead of `cameras` + `zoomStops`), `name`, `aliases`,
  `year`, `notes`, `provenance`, ids may contain `-`, quirks documented in the schema.
- Validator: lens checks (one main, ultra < main < tele ratios, distinct ratios, ratio not both
  set and runtime) and stop checks only for measured profiles. `264/264 profiles valid`
  (with `jsonschema` 4.26). CI also byte-compiles both tools.
- README: two kinds of profile, runtime merge, quirk table, Provenance section.

Data note: vivo X200/X300 Ultra publish a 35 mm main labelled 1.5x; the validator accepts an
official main ratio other than 1 and the app shows "1.5" on the main chip.

## 2. Zoom selector wired to the profile

- `ProfileResolver.resolve`: override file > profile pinned in Settings > best bundled match
  (verified > community, device codename > model code, measured > catalog) > auto. Brand
  families: Xiaomi/Redmi/POCO, vivo/iQOO.
- `ProfileMerger`: measured profile used as is; catalog profile keeps the scanned cameras and
  quirks, limits stops to the published roles (main always), uses official labels, turns a
  published tele the scan cannot find into a crop stop at the published ratio, else 2x crop.
- `LensPlan.chips(openableIds)`: maps each stop to a camera CameraX can open: the id, else a
  duplicate id (3 -> 6), else a listed logical camera containing it (zoom = stop ratio); a stop
  with no openable camera is dropped; no 1x chip -> empty list -> Aperture's camera list.
- App: `CameraViewModel.lensChips` + `selectLensChip` (switch camera, then apply crop zoom once
  the new camera is bound, 3 s timeout); `LensSelectorLayout.setChips`; front camera keeps the
  old list. Settings > Device profile: best match / scanned only / off (= rollback to the plain
  camera list) / any bundled profile, stored in shared preferences.

## 3. Bundling

`gradle/bundle-profiles.gradle` (Groovy: lint crashes on applied Kotlin script plugins) runs
before `preBuild` and writes `assets/profiles.bundle.json` (drops provenance, notes, aliases,
year, testedBuilds). Source: `openCamera.profiles.dir` (`-P` or `local.properties`; this
worktree uses `../../open-camera-profiles`), else the tag `openCamera.profiles.version=v2026.11.11`
downloaded from `openCamera.profiles.url` into `build/profiles-cache`. If neither works it warns
and bundles `[]`. Build log: `Bundled 264 device profiles`.

## 4. Quirks

New `HIDDEN_PHYSICAL_IDS` (stop lenses found only by probing 0-15; detected automatically) and
`USE_LOGICAL_ZOOM` (all stops become zoom ratios on the listed logical camera; set by a profile
or detected when a listed logical camera holds the main plus a hidden ultra/tele). Unknown quirk
keys from newer profiles are ignored. Documented in schema description and README table.

## 5. Tests

`:profiles` 20 tests green: `LensCatalogTest` 8, `ProfileMergeTest` 10 (gauguin hidden ids and
duplicate fallback, gauguin verified wins, iQOO 13-like 3 lenses with published "2" label for a
1.9x tele, OPPO A6-like single lens -> 1x + 2 crop, unpublished role dropped, unfound tele ->
crop, 1.5x main labels, logical zoom, pinning, brand family, catalog JSON round trip),
`BundledProfilesTest` 2 (parses all 264 real profiles; gauguin resolves to verified 0.6/1x/2 on
3/0/0; V2408A resolves to `vivo/iqoo13`). `gradlew assembleDebug test lint` green.

## 6. Device check

Not done: no device was attached to adb during the session (`adb devices` empty, waited about 10 minutes). Debug APK ready: `D:\Projects\open-camera-wt\phase2-profiles\app\build\outputs\apk\debug\app-debug.apk`.

Expected risk on gauguin: only ids 0 and 1 are listed for this package, so CameraX cannot open ultrawide id 3 (or its duplicate 6). The 0.6 chip is then left out (1/2 shown) unless the ROM puts `dev.opencamera.app(.dev)` into `vendor.camera.aux.packagelist` (ROM prop, outside this worktree). Still to check on device: chips, 20 switches with no ANR, and a photo at each stop.

## Files touched outside `:profiles`

`app/build.gradle.kts` (apply script + assets dir, 4 lines), `gradle.properties` (pinned version),
`gradle/bundle-profiles.gradle` (new), `app/.../CameraActivity.kt` (chip callback + combine),
`viewmodels/CameraViewModel.kt` (lensChips, selectLensChip), `ui/views/LensSelectorLayout.kt`
(setChips), `repositories/DeviceProfileRepository.kt`, `SettingsActivity.kt` (picker),
`res/values/strings.xml`, `res/xml/root_preferences.xml`, `README.md`.

## Unresolved

1. Soong builds do not run the Gradle bundle task, so a ROM build has no
   `profiles.bundle.json` (the app falls back to the scan). Needs a genrule or a checked-in
   snapshot.
2. The pinned-tag URL uses the placeholder org `open-camera`; CI bundles `[]` until the repo is
   published.
