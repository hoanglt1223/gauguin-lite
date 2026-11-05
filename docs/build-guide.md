# Build guide (gauguin, lineage-24.0)

Source: [LineageOS wiki, Build for gauguin](https://wiki.lineageos.org/devices/gauguin/build/variant1/), generated 2026-11-02.

## Device

- Xiaomi Mi 10T Lite 5G (`M2007J17G`), SM7225 Snapdragon 750G, Adreno 619, 6 GB RAM.
- Official branches: 18.1 through 24.0. Current branch: **lineage-24.0**.
- Device tree `LineageOS/android_device_xiaomi_gauguin`, kernel `LineageOS/android_kernel_xiaomi_gauguin` (4.19). `breakfast` pulls both, so `local_manifests/` only needs extra repos (blobs, MIUI ports).
- Fastboot: power off, hold Volume Down + Power. Recovery: Volume Up + Power.
- Install method `fastboot_xiaomi`; the stock firmware must be Android 12 based before installing.

## Host

- Ubuntu LTS (x86_64). LineageOS 21+ needs about **64 GB RAM** (enable ZRAM if less) and **400 GB** of disk, plus ccache.
- Packages:

```bash
sudo apt install bc bison build-essential ccache curl erofs-utils flex g++-multilib gcc-multilib git git-lfs gnupg gperf imagemagick kmod protobuf-compiler python3-protobuf lib32readline-dev lib32z1-dev libdw-dev libelf-dev libgnutls28-dev lz4 libsdl1.2-dev libssl-dev libxml2 libxml2-utils lzop pngcrush rsync schedtool squashfs-tools xsltproc xxd zip zlib1g-dev python-is-python3
```

On Ubuntu 26.04 or newer, replace `libxml2` with `libxml2-16`.

## Steps

```bash
mkdir -p ~/bin ~/android/lineage
curl https://storage.googleapis.com/git-repo-downloads/repo > ~/bin/repo && chmod a+x ~/bin/repo
git lfs install
git config --global trailer.changeid.key "Change-Id"
export USE_CCACHE=1 CCACHE_EXEC=/usr/bin/ccache && ccache -M 50G

cd ~/android/lineage
repo init -u https://github.com/LineageOS/android.git -b lineage-24.0 --git-lfs --no-clone-bundle
cp -r /path/to/gauguin/local_manifests .repo/
repo sync
source build/envsetup.sh
breakfast gauguin
```

If `breakfast` fails on missing proprietary makefiles, extract the blobs and rerun it:

- From a phone running current lineage-24.0 with ADB root: `cd device/xiaomi/gauguin && ./extract-files.py` (or `extract-files.sh`).
- Without a phone: extract them from the official zip in `stock/` (see the wiki page "Extracting proprietary blobs from installable zip").

Then build:

```bash
croot
brunch gauguin
```

The output in `$OUT` is `lineage-24.0-<date>-UNOFFICIAL-gauguin.zip` and `recovery.img`.

## Build host

Build on any Ubuntu 24.04 machine (bare metal, VM, or WSL2) with ~24 cores, 32 GB+ RAM (ZRAM/swap helps), and ~300 GB free: a shallow source tree is ~100-130 GB and `out/` is ~130-150 GB, so keep them on separate large disks if you can. Point `out/` at your biggest disk (`ln -s /path/to/out out`). Everything else follows the Steps below.

## Official reference build

`stock/20261104/` (gitignored) holds the 2026-11-04 nightly: the signed zip, `boot.img`, `dtbo.img`, `recovery.img`, `super_empty.img`, `vbmeta.img` and `build-manifest.xml`, with hashes in `SHA256SUMS`. Security patch level 2026-10-01, SDK 37. `build-manifest.xml` pins the exact repo revisions of that build.
