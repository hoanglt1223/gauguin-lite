# gauguin-lite

A lean **LineageOS 24 (Android 17)** build for the Xiaomi **Mi 10T Lite 5G / Redmi Note 9 Pro 5G /
Mi 10i** (codename `gauguin`, Snapdragon 750G / SM7225), plus the tooling to reproduce it: MIUI app
ports (Camera), Google apps built in, debloat, privacy/UX defaults, self-signing, and a self-hosted
OTA flow.

This repo holds **configuration, scripts and docs only**. It contains no proprietary blobs, no APKs,
no ROM images, and no signing keys — those are produced locally during the build (see the guides).

## What it does

- **Base:** official LineageOS `gauguin` device tree + kernel (fetched by `breakfast`), built as a
  Lite product via `lite/`.
- **Apps:** MindTheGapps built in (Play Services, Store, sync); LineageOS apps that Google apps
  replace are removed. MIUI Camera is integrated as a privileged app; GCam ports install post-flash.
- **Defaults baked in** (`lite/features.mk`, `lite/lite-props.prop`, `scripts/apply-lite-patches.sh`):
  camera/mic privacy indicator off, zram 75% (lz4), call recording enabled, battery percentage,
  advanced restart, double-tap-to-sleep, and bootloader-locked spoof properties.
- **Self-signing + OTA:** build signed with your own keys; a tiny JSON + static host feeds the in-ROM
  Updater (`scripts/make-ota-json.py`, `scripts/deploy-ota.sh`).
- **Post-flash** (`post-flash/`): deep root hiding (Magisk + Shamiko + Play Integrity Fix), a
  bootloader-lock-spoof Magisk module, RAM tuning, and optional LSPosed.

## Layout

| Path | Purpose |
|------|---------|
| `lite/` | Lite product makefiles and feature toggles |
| `scripts/` | Pull MIUI deps, compute camera deps, back up partitions, source patches, OTA, module packer |
| `miui-ports/` | Per-app port skeletons (`Android.bp`/`.mk`); the actual APKs/libs are gitignored |
| `local_manifests/` | Extra repos (MindTheGapps) for the LineageOS tree |
| `post-flash/` | Setup done after flashing: root hiding, modules, RAM tuning (docs; binaries gitignored) |
| `docs/` | Build guide, signing + OTA, kernel options |
| `plans/` | Research notes, including a postmarketOS (mainline Linux) porting plan |

## Build

See [docs/build-guide.md](docs/build-guide.md). In short, on an Ubuntu machine:

```bash
repo init -u https://github.com/LineageOS/android.git -b lineage-24.0 --git-lfs --no-clone-bundle
cp -r local_manifests/* .repo/local_manifests/ && repo sync -c --no-tags
# place this repo at vendor/gauguin-lite, inherit lite/lite.mk from lineage_gauguin.mk,
# run scripts/apply-lite-patches.sh on the synced tree, then:
source build/envsetup.sh && breakfast gauguin && m bacon
```

## Status

Work in progress. The base ROM builds; MIUI Camera and the tuning on Android 17 need on-device
testing. Issues and PRs welcome — especially from other `gauguin` / SM7225 owners.

## Contributing

- Keep proprietary blobs, APKs, keys and large binaries out of the repo (see `.gitignore`).
- `scripts/apply-lite-patches.sh` edits are idempotent and fail loudly when an upstream anchor moves;
  keep that style so builds break clearly instead of silently dropping a feature.
- Don't commit personal infrastructure (hosts, IPs, tokens). OTA/build host settings are env vars.

## Legal

MIUI apps and Xiaomi blobs are Xiaomi's property and are not distributed here; you extract them from
your own device or firmware. GCam, Magisk, Shamiko, Play Integrity Fix and LSPosed belong to their
authors — download them from their official sources. Licensed under Apache-2.0 (see `LICENSE`).
