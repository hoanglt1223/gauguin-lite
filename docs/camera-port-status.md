# Camera port status (gauguin, LineageOS 24 / Android 17)

Snapshot of what works on-device and what to bake into the next ROM build.

## Working now (no rebuild needed)

- **Leica Port 8.9** (`com.kobbin.leica.wmrebuild`, HyperOS/Android 16 base, targetSdk 36): launches and runs on A17 with **no shim**. Its compat builder is version-aware and resolves the A17 21-arg `StreamConfigurationMap` constructor itself. It bundles its own Leica native libs, so it does **not** depend on the `/vendor` MIVI engine and is unaffected by the Zygisk namespace issue below. This is the recommended advanced camera.
- **GCam Urnyx / GCam BSG** (relabelled): work as plain camera2 apps.
- **Aperture**: stock LineageOS camera.

## MIUI Camera 4.5 (`com.android.camera`) — blocked by a Zygisk↔MIVI conflict

Both walls are individually solved, but they conflict at runtime:

1. **StreamConfigurationMap 15-arg ctor removed on A17** → fixed by either the LSPosed shim
   (`post-flash/MiuiCameraApiCompat.apk`, module `com.gauguin.camcompat`) or the framework patch
   (`miui-ports/compat-port/framework/streamconfigurationmap-legacy-ctor.patch`). Verified: with the
   shim active the app builds the map (`addStreamConfigurationToList size=192`).
2. **MIVI engine** `dlopen /vendor/lib64/libmialgoengine.so` → needs the SELinux rule in
   `post-flash/miui-cam-sepolicy/` (allow `priv_app` read/execute `vendor_file`). Verified working
   **before** Zygisk was enabled (MIVI loaded, crash moved to wall 1).

**Conflict:** the LSPosed shim for wall 1 requires Zygisk, and Zygisk injection into the camera
process breaks the sphal linker namespace so `/vendor` MIVI libs become "not found" even once SELinux
allows them. So: shim (Zygisk) ⇒ MIVI dies; no Zygisk ⇒ MIVI works but wall 1 returns.

## To bake into the next ROM rebuild (makes MIUI 4.5 work with no Magisk/LSPosed)

- Apply `miui-ports/compat-port/framework/streamconfigurationmap-legacy-ctor.patch` to
  `frameworks/base/.../params/StreamConfigurationMap.java` (adds the legacy 15-arg ctor overload).
  With this in the framework, MIUI 4.5 needs **no LSPosed**, so Zygisk never injects the camera and
  the MIVI namespace stays intact.
- Bake the MIVI SELinux rule into device sepolicy (same rule as `post-flash/miui-cam-sepolicy/sepolicy.rule`).
- Ship the `/vendor` MIVI libs as the ROM already does (they are present on-device).

With both baked, MIUI 4.5 should clear wall 1 (framework) and wall 2 (sepolicy) without Magisk.

## Notes

- The LSPosed module's runtime SELinux rule must be applied via `magiskpolicy --live` (the module's
  `sepolicy.rule` did not apply at boot — Magisk could not resolve a preinit partition on this device).
- Leica unlock props (cosmetic): `ro.theme_customize=LCC`, `camera.debug.safe.check.disable=true`
  (`ro.theme_leica` not referenced by the 8.9 repackage).
- Full API diff and deliverables: `plans/reports/researcher-261106-2012-miui-camera-api-port.md`.
