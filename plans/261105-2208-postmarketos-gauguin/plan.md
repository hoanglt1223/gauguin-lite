# Plan: postmarketOS port for gauguin

Status: research / not started. This is a port-from-scratch effort — no gauguin port exists in
postmarketOS pmaports today (confirmed 2026-11-05: 0 results in postmarketOS/pmaports).

## Outcome

A booting postmarketOS image for the Xiaomi Mi 10T Lite 5G (gauguin, SM7225 Snapdragon 750G), good
enough for a Linux desktop/CLI on the phone, flashed to a spare partition or booted via fastboot.
Not a daily driver at first; a working console + display + touch is the milestone that makes it real.

## Current mainline reality (discovered 2026-11-05 — much further along than "from scratch")

gauguin mainline is NOT a blank slate. Because it shares the SM7225 SoC with the **Fairphone 4**
(a first-class mainline/pmOS device), most of the hard SoC bring-up already exists:

- **Kernel:** [sm6350-mainline/linux](https://github.com/sm6350-mainline/linux) (SM6350/SM7225
  platform) is the source of postmarketOS's official package `linux-postmarketos-qcom-sm6350`.
  Branches run from `sm6350-6.12.y` (6.12 LTS, our target) up to `sm6350-7.2.y` (active Oct 2026).
- **Device tree already upstream-ish:** `arch/arm64/boot/dts/qcom/sm7225-xiaomi-gauguin.dts` exists;
  pmOS carries it with the package (`deviceinfo_dtb=qcom/sm7225-xiaomi-gauguin`).
- **Active ports:** [TigerShota/gauguin-mainline](https://github.com/TigerShota/gauguin-mainline)
  (6.12 LTS + Android 17 effort) and [UsrBinLuna/linux-sm6350](https://github.com/UsrBinLuna/linux-sm6350).
- **Hardware status (Nura Wiki, tested 2026-10-14):**

| Part | Chip | Mainline status |
|---|---|---|
| Display (IPS LCD) | Novatek NT36672C | ✅ works |
| GPU 3D accel | Adreno 619 (freedreno) | ✅ works |
| UFS storage | SK hynix | ✅ works |
| USB | device mode | ✅ partial (device-only) |
| Touch | NT36672C (SPI) | ❌ half-done (porting from sm7150-mainline) |
| Wi-Fi / BT | WCN3991 | ❌ no driver yet |
| Audio | WCD9375 + Cirrus CS35L41 | ❌ no driver yet |

So display + GPU + storage already run on mainline 6.12. The real remaining work is **touch
(finish it), Wi-Fi (WCN3991 — a very common chip, driver exists for siblings), and audio**. This
reframes the plan from "bring-up from scratch" to "start from the sm6350-mainline kernel + pmOS
package, then finish touch/Wi-Fi/audio."

## Why it's feasible (and where it hurts)

- **Kernel:** reuse the downstream 4.19 Android kernel we already have (`kernel/xiaomi/gauguin`),
  packaged the postmarketOS "downstream" way. Mainlining SM7225 is out of scope — far too much work.
- **GPU: the bright spot.** Adreno 619 is supported by Mesa's **freedreno/Turnip**, so hardware
  acceleration (and a real desktop) is achievable, unlike older blobs-only GPUs.
- **Modem/calls: the hard part.** QRTR + rmtfs + the proprietary modem stack on Qualcomm is the
  usual wall. Expect no cellular for a long time; Wi-Fi first.
- **A/B + dynamic partitions:** gauguin uses a `super` dynamic partition. Cleanest is to NOT dual
  boot; instead flash pmOS to a dedicated image and `fastboot boot` or flash a boot image, keeping
  LineageOS as the installed OS. True side-by-side dual boot is not planned (fragile).

## Phases

### Phase 0 — Decide the boot model
- Keep LineageOS installed. Boot pmOS via a separate boot image (`fastboot boot pmos-boot.img`) or a
  dedicated slot. No repartitioning of `super`. Acceptance: a plan for where the rootfs lives
  (userdata image, SD card, or a shrunk partition) that does not risk the LineageOS install.

### Phase 1 — start from the existing mainline package (not the 4.19 downstream)
- Use `pmbootstrap`, select gauguin, and build against `linux-postmarketos-qcom-sm6350` (which
  already carries the `sm7225-xiaomi-gauguin` DTS), or TigerShota/UsrBinLuna's 6.12 fork. Skip the
  4.19 downstream route entirely — mainline already boots display + GPU + storage here.
- Acceptance: `pmbootstrap build` produces a mainline 6.12 kernel + initramfs for gauguin.

### Phase 2 — First boot to console
- Boot the pmOS initramfs over `fastboot boot`. Get a serial/USB console and an SSH-over-USB
  (`usb0`) shell. Acceptance: shell on the device, `dmesg` readable, no bootloop.

### Phase 3 — Display + touch
- Bring up the panel via the downstream MSM DRM driver (framebuffer first, then DRM/KMS), then the
  touchscreen input. Acceptance: a graphical greeter (Phosh or Plasma Mobile) draws and responds to
  touch, even if slow.

### Phase 4 — GPU acceleration (freedreno/Turnip on Adreno 619)
- Enable Mesa Turnip. Acceptance: `glmark2-es2` runs with GPU, the UI is smooth.

### Phase 5 — Connectivity and the rest
- Wi-Fi (the downstream `qca` driver + firmware), then audio, then sensors. Modem/cellular is a
  stretch goal, not a milestone. Acceptance: Wi-Fi associates and gets an IP.

## Effort / risk

- **Effort:** weeks for phases 1–3, more for 4–5. This is real kernel/driver bring-up, not config.
- **Risk to the phone:** low if we never repartition and only `fastboot boot` test images — the
  LineageOS install and our partition backups stay intact. Flashing a wrong boot image bootloops;
  recovery is `fastboot flash boot` of the good image.
- **Honest verdict:** a booting pmOS with display + touch + Wi-Fi + GPU is realistic given Adreno 619
  has Turnip. Cellular likely never. This is a side project, independent of the LineageOS Lite build.

## Not in scope

- Dual boot with a boot menu, mainline kernel, cellular as a milestone, and running it as a daily
  phone.

## iOS-on-gauguin (hackiosx) — separate note

The hackiosx projects (ios-sweet, UniXNU, HackiOS) port XNU/iOS to specific Android phones as
research benches. No gauguin target exists; adapting them to SM7225 would be a from-scratch XNU
bring-up — far harder than postmarketOS and not daily-usable (the furthest ports still lack cellular,
boot in minutes, and run timed sessions). The one encouraging factor is the same as pmOS: Adreno 619
is Turnip-supported, so their Metal→Vulkan→Turnip GPU path could in principle work. Treat it as a
curiosity, not a goal; if ever attempted, it comes AFTER a working postmarketOS port proves the
kernel/display/GPU bring-up.
