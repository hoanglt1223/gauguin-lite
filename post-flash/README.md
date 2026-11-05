# Post-flash setup

Things to do after flashing gauguin Lite. These are user-side steps, not part of the build.

## 1. Camera apps

GCam ports (BSG 9.8, Urnyx05 7.3) are ordinary apps — the APKs are in `../miui-ports/GCam/`.
Copy them to the phone and install. Aperture and MIUI Camera are already in the ROM.

## 2. Google Wallet tap-to-pay (Play Integrity)

Google Wallet contactless payment needs Play Integrity "device" verification, which an
unlocked-bootloader custom ROM fails by default. To pass:

1. Flash `PlayIntegrityFix_v4.9-inject-s.zip` in Magisk (Modules > Install from storage), reboot.
2. In Magisk > Settings, enable **Zygisk** (PIF needs it).
3. Add Google Wallet, Play Store and Play Services to the Magisk **DenyList** (hide root).
4. Clear data of Play Services + Play Store, reboot, then re-check in Play Integrity test apps.

Caveats, no promises: this passes *device* integrity, never hardware (*strong*) integrity. Google
tightens the checks periodically; when that happens tap-to-pay stops until the PIF module updates.
Keep the module current from its project page. We do NOT use leaked keyboxes.

## 3. Self-signed OTA updates

If the ROM was built and signed with your own keys (see `docs/signing-and-ota.md`), the in-ROM
Updater (Settings > System > Updater) pulls new builds from your server. For each new build:

```bash
python scripts/make-ota-json.py <build.zip> https://your-ota-host/gauguin > gauguin.json
# host gauguin.json and the zip at that URL; the phone offers the update in Settings.
```

The OTA URL is set by `lineage.updater.uri` in `lite/lite-props.prop` — change it to your host
before building.

## 4. LSPosed (Xposed framework), optional

`Vector-v2.2-3080-Release.zip` is the actively-maintained LSPosed fork (JingMatrix), Zygisk variant.
Flash it in Magisk (Zygisk must be on — it already is for the hide stack), reboot, then open the
LSPosed manager (notification or the hidden app entry) to install Xposed modules. Only add it if you
actually want per-app tweaking; it is powerful but one more thing that root-detectors look for, so
keep it on the DenyList-hidden side if you also care about banking apps.
