# MIUI / HyperOS Camera — camera2 API port to Android 17 (API 37)

Date: 2026-11-06
Device: Xiaomi gauguin, LineageOS 24 (Android 17 / API 37), Magisk 31.1, Vector (LSPosed fork).
Scope: map the camera2 framework APIs the camera app resolves by signature across Android 13/14 → 17, and ship (A) a runtime LSPosed shim and (B) permanent framework source patches.

---

## 0. Executive summary

Two candidate port bases were analysed. The wall differs sharply between them:

| Base | Package | targetSdk | StreamConfigurationMap wall on A17 | Shim required? |
|------|---------|-----------|------------------------------------|----------------|
| MiuiCamera 4.5.002030.1 (A13 build) | `com.android.camera` | 29 | YES — direct bytecode call to the removed 15-arg constructor → `NoSuchMethodError` | YES (deliverable A or B) |
| Leica Port 8.9 ("8.0.0" mod) | `com.kobbin.leica.wmrebuild` | 36 | NO — builds the map by **version-aware reflection**, already resolves the A17 21-arg constructor | NO |

Recommendation for least shimming: the **8.9 port already contains a universal 13→17 StreamConfigurationMap builder** and has **no removed-signature camera2 walls**. If the product goal is simply "camera2 resolves on A17", the 8.9 base needs nothing from this work. The 4.5 base needs exactly one fix, which both deliverables provide.

Everything else (Xiaomi HAL binding, MIVI pipeline, Leica tuning) is a separate product concern noted at the end.

---

## 1. New base confirmation (aapt dump badging — Leica Port 8.9.apk)

- File: `D:\Downloads\Telegram Desktop\Leica Port 8.9.apk`, 532,087,561 bytes, SHA1 `06189417240482d1cb3096a39554e4b1c5545dc3` (verified identical on the build VM).
- **package name: `com.kobbin.leica.wmrebuild`** (NOT `com.android.camera` — this is a repackaged/renamed mod so it can install side-by-side).
- versionCode `680020067`, versionName `8.0.0` (app label 徕卡一瞬 / "Leica Instant"; the "8.9" is the distributor's label, not the manifest version).
- `sdkVersion` (min) 29, **`targetSdkVersion` 36**, `compileSdkVersion` 36 / codename "16" (HyperOS on Android 16).
- launchable-activity: `com.android.camera.Camera` and `com.xiaomi.camera.CameraActivity` (original class names kept; only the application id was rewritten).
- 32 dex files; bundles its own Leica native libs (see §6).

Implication: if this base is chosen, the installed package is `com.kobbin.leica.wmrebuild`; any scoping/SELinux/HAL rule keyed to `com.android.camera` must be re-pointed at the new id.

---

## 2. camera2 API enumeration — method used, A17 status, mapping

Enumeration method: full smali decode of both APKs on the VM (apktool 3.0.3, `-r`), then grep of every `android.hardware.camera2.*` direct reference and every reflective `getConstructor/getDeclaredConstructor/getMethod/getDeclaredMethod/getField/getDeclaredField/forName`. A17 signatures verified against `/srv/lineage/frameworks/base/core/java/android/hardware/camera2/`.

### 2a. MiuiCamera 4.5 compat layer (`com/xiaomi/compat/camera2/*`)

| Class.member the app resolves | Exact signature expected | In A17? | A17 mapping |
|---|---|---|---|
| `params.StreamConfigurationMap.<init>` | **15 args**: `(SC[], SCD[], SCD[], SC[], SCD[], SCD[], SC[], SCD[], SCD[], SC[], SCD[], SCD[], HighSpeedVideoConfiguration[], ReprocessFormatsMap, boolean)` — direct `invoke-direct` in `CameraConstructCompat.getStreamConfigurationMap` | **NO** (removed after A13) | 21-arg or 22-arg ctor; insert jpegR×3 + heicUltraHDR×3 as `null` (framework → empty arrays) between heic×3 and highSpeed; keep `listHighResolution`; 22-arg adds trailing `enforceImplementationDefined=true`. **This is the only wall.** |
| `CaptureRequest$Builder.<init>` | `(CameraMetadataNative, boolean, int, String, Set)` | YES (`CaptureRequest.java:868`) | unchanged |
| `CameraDevice.createCustomCaptureSession` | `(InputConfiguration, List, int, CameraCaptureSession$StateCallback, Handler)` | YES (`CameraDevice.java:517`) | unchanged |
| `CameraCharacteristics.getNativeCopy()` | `()CameraMetadataNative` | YES (`:242`) | unchanged |
| `CaptureRequest.getNativeCopy()` / `containsTarget(Surface)` / `getTargets()` / `getLogicalCameraId()` | as named | YES (`CaptureRequest.java:526/710/718/726`) | unchanged |
| `CaptureRequest$Builder.setPartOfCHSRequestList(boolean)` | as named | YES (`:1022`) | unchanged |
| `CameraCharacteristics.Key` fields: `CONTROL_AVAILABLE_HIGH_SPEED_VIDEO_CONFIGURATIONS`, `SCALER_AVAILABLE_MIN_FRAME_DURATIONS`, `SCALER_AVAILABLE_STALL_DURATIONS`, `DEPTH_AVAILABLE_DEPTH_*` (×3), `DEPTH_AVAILABLE_DYNAMIC_DEPTH_*` (×3), `HEIC_AVAILABLE_HEIC_*` (×3), `SCALER_AVAILABLE_INPUT_OUTPUT_FORMATS_MAP` | static `Key` fields | YES (all present) | unchanged |
| other direct param ctors used app-wide: `OutputConfiguration(Surface)`, `OutputConfiguration(int,Surface)`, `OutputConfiguration(Size,Class)`, `InputConfiguration(int,int,int)`, `MeteringRectangle(int×5)`, `MeteringRectangle(Rect,int)`, `SessionConfiguration(int,List,Executor,StateCallback)`, `CameraMetadataNative(CameraMetadataNative)` | as named | YES | unchanged |

Net: **exactly one removed signature** (15-arg SCM ctor), reached through one call site: `com.android.camera.lib.compatibility.related.v29.V29Utils.createStreamConfigMap` → `CameraConstructCompat.getStreamConfigurationMap`. Confirmed sole direct SCM-ctor caller in the whole APK.

### 2b. Leica Port 8.9 (`com.kobbin.leica.wmrebuild`, obfuscated)

The compat builder is obfuscated to `LTp/c;->a(...)` (`smali_classes10/Tp/c.smali`), signature 14 args (no trailing boolean). It does **not** hardcode a constructor; it branches on `Build.VERSION.SDK_INT` (+ `PREVIEW_SDK_INT`) and builds the correct `Class[]` then `getDeclaredConstructor(...).newInstance(...)`:

- `SDK_INT > 35` (A16/A17…): builds the **21-element** type array (18 stream arrays incl. jpegR+heicUltraHDR, HighSpeedVideoConfiguration[], ReprocessFormatsMap, boolean), resolves the real A17 **21-arg** constructor, and passes the 12 real arrays + **6 nulls** (jpegR×3, heicUltraHDR×3) + highSpeed + reprocessMap + `Boolean.TRUE`. This is byte-for-byte the mapping deliverable A implements.
- lower branches build the 20-/15-element variants for A13–A15.

Result for 8.9: **no removed-signature camera2 wall.** Every other hidden member it touches exists in A17:

| Member (8.9) | In A17? |
|---|---|
| `StreamConfigurationMap.<init>` via reflection (version-aware) | YES (21-arg resolved) |
| `CaptureRequest.getNativeCopy/containsTarget/getTargets/getLogicalCameraId` (direct **and** reflective by name) | YES |
| `CaptureRequest$Builder.setPartOfCHSRequestList`, `CameraCharacteristics.getNativeCopy` | YES |
| `impl.CameraMetadataNative(copy ctor)`, `impl.CameraCaptureSessionImpl`, `impl.CameraConstrainedHighSpeedCaptureSessionImpl` | YES (all present in A17 tree) |
| `params.ExtensionSessionConfiguration(int,List,Executor,CameraExtensionSession$StateCallback)`, `SessionConfiguration(…)`, `OutputConfiguration/InputConfiguration/MeteringRectangle/ReprocessFormatsMap/DngCreator` ctors | YES |

Other reflective `const-class` targets in 8.9 are stable vendor-tag surfaces (`CaptureRequest$Key`, `CaptureResult`, `CameraCharacteristics`, `CameraManager`) — none point at a removed signature.

---

## 3. Deliverable A — runtime LSPosed shim

Fixes the 4.5 base without rebuilding the ROM. No-op on bases that lack the compat class (it logs and returns), so it is safe to leave installed under either base.

- Source tree: `D:\Projects\gauguin\miui-ports\compat-port\xposed\`
  - `src\com\gauguin\camcompat\CameraApiCompat.java` — hook (package `com.gauguin.camcompat`).
  - `xposed-api\de\robv\android\xposed\*` — compile-only Xposed API stubs (NOT bundled in the dex).
  - `AndroidManifest.xml`, `assets\xposed_init`, `res\values\arrays.xml` (auto-scope), `build-module.sh`.
- Built + testkey-signed APK: `D:\Projects\gauguin\post-flash\MiuiCameraApiCompat.apk`
  - package `com.gauguin.camcompat`, 12,753 bytes, SHA256 `8bf0e36d096e78a822a3f6b6492f5cc11f72dd53a882cd7c06ba21f3852d7d6e`.
  - Signed with AOSP `testkey` (CN=Android). v1+v2 verified.

Behaviour: on `com.android.camera` (or `com.kobbin.leica.wmrebuild`), hooks `com.xiaomi.compat.camera2.CameraConstructCompat.getStreamConfigurationMap` with `XposedBridge.hookAllMethods` and replaces it: reflect `StreamConfigurationMap`, pick the 22-arg (preferred) or 21-arg constructor, remap the 15 legacy args into the current order with `null` for jpegR/heicUltraHDR and `enforceImplementationDefined=true`, return `newInstance`. Hidden-API access is allowed because LSPosed disables the hidden-API blocklist in hooked processes.

Build command used on the VM (reproducible): `bash /tmp/camcompat/build-module.sh /tmp/camcompat /tmp/camcompat-build` (javac `--release 8` → d8 `--min-sdk-version 29`, only module classes dexed → aapt2 link + `aapt add classes.dex` → zipalign → `apksigner` via `tools/linux/lib/apksigner.jar` with `.../security/testkey.pk8|.x509.pem`).

---

## 4. Deliverable B — permanent framework source patch

Adds the legacy 15-arg `StreamConfigurationMap` constructor back as an additive overload that delegates to the current 22-arg constructor. Makes the 4.5 base resolve with no Magisk/Xposed. Harmless for the 8.9 base (it reflects the 21-arg form regardless).

- Patch: `D:\Projects\gauguin\miui-ports\compat-port\framework\streamconfigurationmap-legacy-ctor.patch`
  (target: `frameworks/base/core/java/android/hardware/camera2/params/StreamConfigurationMap.java`, +38 lines, additive only).
- Edited full file copy: `D:\Projects\gauguin\miui-ports\compat-port\framework\StreamConfigurationMap.java`.
- Why only this file: §2a shows the 15-arg ctor is the single removed signature the camera app resolves; every other member it uses already exists in A17, so no other framework file needs touching.

The added constructor:
```
StreamConfigurationMap(configs, minDur, stallDur, depth×3, dynamicDepth×3, heic×3,
                       highSpeed, reprocessMap, listHighResolution)
  -> this(... heic×3, /*jpegR*/null,null,null, /*heicUltraHDR*/null,null,null,
          highSpeed, reprocessMap, listHighResolution, /*enforceImplementationDefined*/true);
```

---

## 5. On-device install / test (controller runs these; do NOT let the researcher touch the phone)

### A) LSPosed shim (fast path, 4.5 base)
1. Copy `D:\Projects\gauguin\post-flash\MiuiCameraApiCompat.apk` to the phone and install: `adb install -r MiuiCameraApiCompat.apk` (or install from Files). It is testkey-signed; no Play Protect dependency.
2. Open LSPosed/Vector manager → Modules → enable **MIUI Camera API Compat**.
3. In its scope, tick the camera app you are testing (`com.android.camera` for the 4.5 base; the module auto-requests both scopes).
4. Force-stop the camera app (Settings → Apps → … → Force stop), then relaunch. First launch after enabling may need a second cold start.
5. Verify the fix: `adb logcat | grep -E "camcompat|StreamConfigurationMap|NoSuchMethodError"`. Expect `[camcompat] StreamConfigurationMap constructor compat hook installed` and no `NoSuchMethodError` in `CameraConstructCompat.getStreamConfigurationMap`.
6. To revert: disable the module and force-stop the app. (Uninstall: `adb uninstall com.gauguin.camcompat`.)

### B) Framework patch (permanent, next ROM build)
1. On the build VM, apply from the lineage tree root: `cd /srv/lineage && git -C frameworks/base apply /path/to/streamconfigurationmap-legacy-ctor.patch` — or drop in the edited `StreamConfigurationMap.java` copy.
2. Build framework: `source build/envsetup.sh && lunch <gauguin lineage target> && mka framework` (or a full `mka bacon`).
3. Flash the resulting ROM/`framework` artifact as usual; no Magisk module needed for this wall.
4. Same logcat verification as A, step 5. With B in place the shim (A) is redundant but still harmless.

Note: A and B fix the *same* wall by different means — use A for iteration now, bake B for the shipping ROM. Do not expect either to change anything on the 8.9 base (it has no such wall).

---

## 6. Leica unlock (post-run, cosmetic — do NOT block on it)

System props to enable the Leica UI/branding (as supplied by the controller):
- `ro.theme_leica=true`
- `ro.theme_customize=LCC`
- `camera.debug.safe.check.disable=true`

Observed in the 8.9 port smali/assets: `camera.debug.safe.check.disable` and `ro.theme_customize` are read by the app; `ro.theme_leica` was not referenced by name (the repackage appears to self-enable Leica, so it may not need that prop). Set props via a Magisk `resetprop`/`system.prop` or `build.prop` overlay; they are read at camera process start, so force-stop after changing.

Mode feasibility on this SD750G (SM7225) + IMX682 device — the 8.9 port bundles its own Leica native libs (`libleicadenoise`, `libleicaq51base`, `libleicaquality`, `libleicashading`, `libleicamodelembed`, `libmialgo_monopan/saliency/saliency_jni/styletrans`, `libMiVideoSDK`, plus arcsoft/morpho/mivi refs):
- Likely functional (CPU/GPU, sensor-agnostic): Leica watermark/branding, Leica color "Authentic/Vibrant" look (`libleicaq51base/quality/shading` are post-process grading), basic photo/video.
- Likely degraded or non-functional (tuned for flagship Snapdragon 8 ISP + large sensors, heavy compute): style transfer (`styletrans`), monochrome panorama (`monopan`), saliency-based portrait/bokeh (`saliency`), `libMiVideoSDK` movie modes, and any mode that expects MIVI features the gauguin HAL/sensor does not expose. These should be validated one by one on-device; several may crash or fall back.

This is advisory from the smali/lib inventory; exact behaviour needs the controller's on-device run.

---

## 7. Walls not resolved here / open items

1. **8.9 base is a renamed package (`com.kobbin.leica.wmrebuild`).** The MIVI SELinux rule and any config keyed to `com.android.camera` must be re-pointed if this base is used. (The existing SELinux module at `post-flash/miui-cam-sepolicy/` targets `priv_app`→`vendor_file`; confirm the new package runs as `priv_app` / is placed in `priv-app`.)
2. **Only build-time/static resolution was verified.** Runtime may surface non-camera2 gaps (other framework classes, vendor-tag mismatches, MIVI feature negotiation) that cannot be seen in smali. The enumerated camera2 surface is complete and mapped; anything beyond camera2 is out of this task's scope.
3. **8.9 Leica compute modes** (see §6) are a product/perf risk on this chipset, not an API wall.
4. No change was made to the phone, and no secrets/infra were written to any repo file. The AOSP `testkey` used for the module is the public AOSP signing key; the private `~/android-certs` on the VM were not used.

---

## Appendix — key source locations (VM)

- A17 framework camera2: `/srv/lineage/frameworks/base/core/java/android/hardware/camera2/` (SCM ctors at `params/StreamConfigurationMap.java:~121` 21-arg, `~201` 22-arg).
- 4.5 decoded smali: `/tmp/mc_out` (compat at `smali_classes2/com/xiaomi/compat/camera2/`).
- 8.9 decoded smali: `/tmp/l89` (compat builder at `smali_classes10/Tp/c.smali`).
- Toolchain: jdk21, android.jar (SDK 34), `tools/lib/d8.jar`, `tools/linux/{bin,lib}` aapt/aapt2/zipalign/apksigner, testkey at `build/make/target/product/security/testkey.{pk8,x509.pem}`.
