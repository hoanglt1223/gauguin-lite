# Xiaomi gauguin — Mainline Linux / postmarketOS status

Research date: 2026-11-05 (Asia/Saigon). Read-only: GitHub API + web. Phone/VM untouched.

gauguin = Xiaomi Mi 10T Lite 5G / Redmi Note 9 Pro 5G / Mi 10i (M2007J17C). SoC Qualcomm
SM7225 (Snapdragon 750G, Kryo 570 / Adreno 619). Shares SoC with Fairphone 4 (sm7225).

---

## Verdict (read this first)

**You can flash a mainline postmarketOS image on gauguin TODAY and get a booting Linux
console with display, GPU, USB-networking and SSH.** It is NOT a usable phone: no touch,
no Wi-Fi, no audio, no modem, no sensors. It is a developer bring-up, not a daily driver.

Three hard truths that the optimistic project READMEs gloss over:

1. **gauguin is not in mainline Linux, and not even in the canonical sm6350 tree.** The
   gauguin device tree lives only in one developer's personal fork branch
   (`UsrBinLuna/linux-sm6350` @ `sm6350-7.2.y`). The upstream `sm6350-mainline/linux` tree
   (the source of the official pmOS kernel package) has **no gauguin DTS at all** — only
   Fairphone 4 and Sony Xperia. (confirmed below)
2. **The device tree only wires display + GPU + USB + UFS.** Wi-Fi, modem, audio, touch,
   charger and sensors are not even present as disabled nodes. They are greenfield, despite
   Fairphone 4 proving most of them work on this exact SoC.
3. **Display does not work out of the box**, and there are at least two panel variants
   (Tianma vs CSOT NT36672C). The stock pmOS config enables neither panel driver. Which
   physical panel your unit has decides which driver you need.

**Time-to-usable (touch + Wi-Fi + audio):** realistically **2-4 months of one skilled
developer's part-time work**, dominated by the touch port (no mainline driver binds) and
per-peripheral DTS wiring + firmware. This is an estimate, not a confirmed fact.

---

## Hardware status table

Status legend: ✅ works on mainline today · 🟡 partial/needs work · ❌ absent · "inherit?"
= whether Fairphone 4 (same SoC) already proves it works in mainline.

| Part | Chip | Mainline status on gauguin | Where the work is / needs to happen |
|---|---|---|---|
| Display | Novatek NT36672C (Tianma **or** CSOT variant), 1080×2400 DSC video | 🟡 boots **only after** enabling a panel driver matching your variant | DTS present (`tianma,nt36672c`); `panel-tianma-nt36672c.c` exists in fork but **not enabled in stock config**; CSOT needs a brand-new driver (see yuemuz3 repo) |
| GPU | Adreno 619 (freedreno/msm) | ✅ works | mainline `drm/msm`; firmware via `GauguinFirmware` (reuses FP4 a619 GMU/SQE/zap) |
| UFS storage | SK hynix | ✅ works | mainline `ufs-qcom`, wired in DTS |
| USB | dwc3, **peripheral-only** (`dr_mode="peripheral"`) | ✅ device mode (USB-net/SSH) | Host/OTG needs a DTS change — not done; so no USB keyboard yet |
| Touchscreen | Novatek NT36672C TDDI **on SPI** | ❌ no driver binds | mainline `novatek-nvt-ts` is **I2C-only**; vendor driver is 4.19 SPI → needs a real port (~1-2 wk est.) |
| Wi-Fi | WCN3991 | ❌ not wired | ath10k_snoc (wcn399x) exists in mainline; FP4 (WCN3990) runs it 🟡. Needs DTS node + firmware |
| Bluetooth | WCN3991 | ❌ not wired | `hci_qca`/qca639x; FP4 Bluetooth ✅. Needs DTS wiring |
| Audio | WCD9375 codec + Cirrus CS35L41 amp | ❌ not wired | `wcd938x` + `cs35l41` drivers exist in mainline; FP4 audio 🟡 (WCD9380). Needs DTS + UCM |
| Modem / 5G | Snapdragon X52 (MSS/SDR735) | ❌ not wired | FP4 proves it: mobile data ✅, SMS ✅, calls 🟡 on mainline. Needs remoteproc_mpss + firmware |
| GPS/GNSS | (SoC) | ❌ not wired | FP4 GPS ✅ via qrtr/pd-mapper. Inheritable |
| Battery / charging | PM7250B + SMB1395/smb5 | ❌ not wired | `qcom-pm8941`/`qcom_smbx`; FP4 battery 🟡. Needs DTS + pmic_glink |
| Sensors | ICM-40607 (IMU) etc. | ❌ not wired | iio drivers exist upstream; needs DTS + I2C wiring |
| Fingerprint | Goodix GF36xx | ❌ no mainline driver | no upstream path; lowest priority |
| Cameras | IMX682 / HM2 / OV16A1Q (+OV8856) | ❌ main sensors absent | CAMSS complex; out of scope for "usable" |

Confirmed-vs-inherit detail is in the per-component section below.

---

## What actually boots today (confirmed on hardware)

Source: `yuemuz3-beep/gauguin-mainline-notes` README + VM-RUNBOOK, pushed 2026-11-03, tested
on a Chinese retail **M2007J17C / 2007J17C** unit with a **CSOT** panel, kernel 7.2.0,
postmarketOS/Nura edge, systemd, console UI.
https://github.com/yuemuz3-beep/gauguin-mainline-notes

Verified working: boot, display (1080×2400 full-screen, DSC path), USB networking + SSH
(`ssh user@172.16.42.1`, host 172.16.42.2/24), readable console font, g++/vim/tmux/git,
internet via host proxy. Verified NOT working: touch, Wi-Fi, BT, audio, camera, modem.

This matches the gauguin DTS scope exactly — I confirmed the 390-line DTS
(`sm7225-xiaomi-gauguin.dts`, added 2026-10-11 by Matteo Cuneo) sets `status="okay"` only on
display/panel, `&gpu`, `&usb_1*`, `&ufs_mem_*`, and contains **zero** references to wifi,
`remoteproc_mpss/adsp/cdsp`, wcd938x/wcd937x, cs35l41, sound, novatek/touch, pm7250, smb139,
battery, charger or sensor nodes.
https://github.com/UsrBinLuna/linux-sm6350/blob/sm6350-7.2.y/arch/arm64/boot/dts/qcom/sm7225-xiaomi-gauguin.dts

---

## Where the code actually lives (confirmed)

| Thing | Location | State |
|---|---|---|
| gauguin DTS | `UsrBinLuna/linux-sm6350` @ `sm6350-7.2.y` only | registered in Makefile; added 2026-10-11 by Matteo Cuneo ("add device-tree for Xiaomi Mi 10T Lite") |
| Canonical kernel tree | `sm6350-mainline/linux` (maintained by Luca Weiss) | **no gauguin** — only `sm7225-fairphone-fp4.dts`, `sm6350-sony-xperia-lena-pdx213.dts`. Tags up to `v7.3.0-sm6350` |
| UsrBinLuna fork = mirror | `UsrBinLuna/linux-sm6350` and `sm6350-mainline/linux` share identical SHAs on shared branches; UsrBinLuna carries the extra gauguin DTS | both very active; branches kernel 6.9 → 7.3 |
| pmOS device pkg | `UsrBinLuna/pmaports-gauguin` @ branch `gauguin`: `device/testing/device-xiaomi-gauguin`, `firmware-xiaomi-gauguin`, `device/community/linux-postmarketos-qcom-sm6350` (pkgver 7.2.0), `alsa-ucm-conf-qcom-sm6350` | fork only |
| Upstream pmaports | `postmarketOS/pmaports` | **no gauguin** (code search total 0). Not submitted upstream yet |
| Firmware | `UsrBinLuna/GauguinFirmware` | Adreno a619 GMU/SQE/zap, reuses FP4 approach |
| CSOT panel driver + boot fixes | `yuemuz3-beep/gauguin-mainline-notes` | `panel-csot-nt36672c.c`, `build.sh`, `VM-RUNBOOK.md` |
| Vendor sources (touch/panel fw) | `LineageOS/android_kernel_xiaomi_gauguin` @ `lineage-24.0` | downstream 4.19, still active |

**Critical mismatch (confirmed):** the pmaports kernel APKBUILD pins
`_tag="v7.2.0-sm6350"` from `sm6350-mainline/$_repo` — but that tag's tree has **no**
`sm7225-xiaomi-gauguin.dtb`. So a vanilla `pmbootstrap` build using the stock source fails
with `ERROR: Unable to find qcom/sm7225-xiaomi-gauguin.dtb`. You MUST build against the
`UsrBinLuna/linux-sm6350` fork branch `sm6350-7.2.y` instead (which is what yuemuz3's
`build.sh setup` rewrites the APKBUILD to do).

---

## The panel-variant gotcha (important, per coordinator)

gauguin ships with at least two different NT36672C panels, and they need different drivers:

- **Tianma** variant — display-maker id `0x36`. DTS compatible `tianma,nt36672c`, driver
  `panel-tianma-nt36672c.c` (by DomHeadroom / Matteo Cuneo, in the fork). 1205 htotal,
  hfront 73 (per yuemuz3's reading of the upstream-style driver).
- **CSOT** (华星光电) variant — display-maker id `0x42`. Needs a **new** driver
  `panel-csot-nt36672c.c` (`CONFIG_DRM_PANEL_CSOT_NT36672C`), which yuemuz3 wrote because
  no Tianma/upstream driver matches its timing (htotal 1182, hfront 50). Panel string
  `qcom,mdss_dsi_j17_42_02_0b_dsc_video`.

**Both variants fail out-of-the-box:** I confirmed the stock pmaports kernel config
(`config-postmarketos-qcom-sm6350.aarch64`) enables **no** NT36672C panel at all — only
`NT36672A`/`NT36672E` (both `is not set`), and `TOUCHSCREEN_NOVATEK_NVT_TS` is not set.
`CONFIG_DRM_PANEL_TIANMA_NT36672C` is absent entirely → the Tianma driver is not even
compiled. So a Tianma unit needs that symbol enabled; a CSOT unit needs yuemuz3's driver +
its symbol. Display working "out of the box" is false for every gauguin today.
https://github.com/UsrBinLuna/pmaports-gauguin/blob/gauguin/device/community/linux-postmarketos-qcom-sm6350/config-postmarketos-qcom-sm6350.aarch64

**How to detect which panel your unit has** (from yuemuz3 VM-RUNBOOK step 0.1): take an
Android `bugreport`, open `dumpstate_board.txt`, and search for `DisplayDxe` (NOT `lcm` or
`nt36672` — MIUI logs never print "LCM"). You will see e.g.
`MDPPLATFORM_PANEL_J17_CSOT_NT36672C_LCD_DSC_VIDEO` and
`Successfully bind display panel 'qcom,mdss_dsi_j17_42_02_0b_dsc_video'` (42 = CSOT; 36 =
Tianma). No bugreport? The running mainline kernel's `dmesg` panel-bind line also tells you.

> Caveat: yuemuz3's own notes are internally inconsistent on the CSOT firmware filename —
> the README says CSOT → `novatek_nt36672c_j17_fw02.bin`, but VM-RUNBOOK step 0.1 says the
> same unit reported `fw01`. Treat the firmware suffix as "verify on your unit", not settled.

---

## Flash pmOS today — the concrete path (feasible, console-only)

This produces a booting, SSH-able console. No touch/Wi-Fi/audio. Prereqs: unlocked
bootloader (Mi Unlock, 168h cooldown), battery ≥50%, Ubuntu 22.04 VM (4 cores / 8 GB /
40 GB). **First confirm you are actually unlocked** — yuemuz3 found a unit reporting
`ro.boot.flash.locked=1` + `verifiedbootstate=green` despite a claimed unlock (a screen
repair had re-locked it): `fastboot oem device-info` → `Device unlocked: true`.

Reproducible route via `yuemuz3-beep/gauguin-mainline-notes` `build.sh`:

```bash
bash build.sh doctor     # preflight: repos reachable, tools, disk, DTS present on branch
bash build.sh setup      # clone UsrBinLuna/pmaports-gauguin (branch gauguin) +
                         #   UsrBinLuna/linux-sm6350 (branch sm6350-7.2.y); rewrite APKBUILD
bash build.sh init       # pmbootstrap init: edge / xiaomi / gauguin / console / systemd
bash build.sh install    # checksum + kernel build + rootfs
bash build.sh postfix    # remove bogus /boot fstab line, add console-font service
bash build.sh verify     # asserts sm7225-xiaomi-gauguin.dtb is in kernel pkg AND boot.img
img2simg <root.img> root.simg
fastboot erase dtbo               # REQUIRED — see fix 1
fastboot flash boot    boot.img
fastboot flash userdata root.simg
fastboot reboot
```

pmbootstrap device name: **`xiaomi-gauguin`**. Boot method: `fastboot flash` (header v2,
pagesize 4096) — note deviceinfo also permits `fastboot boot boot.img` for non-destructive
testing, but the `dtbo` problem below usually forces at least one `fastboot erase dtbo`.

### The four non-obvious boot fixes (all confirmed by yuemuz3, all still needed today)

1. **`fastboot erase dtbo`** — ABL loads the DTB from the 32 MB `dtbo` partition (19 Android
   DTBs), ignoring the DTB appended to `boot.img`. Without erasing, the kernel gets the
   vendor 4.19 device tree and resets right after the logo (looks like a kernel crash).
   Restore Android later with `fastboot flash dtbo <stock dtbo.img>`.
2. **Kernel cmdline via `/usr/lib/kernel-cmdline.d/*.conf`** — newer `boot-deploy` ignores
   `deviceinfo_kernel_cmdline`. Ship `50-gauguin.conf` with `clk_ignore_unused`,
   `pd_ignore_unused`, `regulator_ignore_unused`, `arm-smmu.disable_bypass=0`, `console=tty0`,
   `panic=0`, `PMOS_NO_OUTPUT_REDIRECT`, `pmos.nosplash`. Without these, Qualcomm clocks/power
   domains get disabled as "unused" and the device never comes up.
3. **Delete the `/boot` line from `/etc/fstab`** — `pmbootstrap install` writes a `UUID … /boot
   ext2` entry, but with `flash_method=fastboot` the boot partition is an Android image, not
   ext2. systemd fails the mount and boot stalls — **SSH never starts even though USB
   networking (ping 172.16.42.1) already works.** This is the easiest failure to misdiagnose.
4. **Bump kernel `pkgrel=1`** — the fork package is `pkgver=7.2.0 pkgrel=0`, identical to the
   upstream package, so apk may install the upstream one (which lacks the gauguin dtb) →
   `mkinitfs` fails. Verify with `zcat <apk> | grep -c sm7225-xiaomi-gauguin` (must be ≥1).

Plus the panel fix: enable the driver symbol for YOUR variant in the kernel config
(`CONFIG_DRM_PANEL_TIANMA_NT36672C=y`, or add + enable `panel-csot-nt36672c.c` /
`CONFIG_DRM_PANEL_CSOT_NT36672C=y` for CSOT) or you get a black screen after the logo.

UI: the port is set up as **console** (systemd). No Phosh/Plasma Mobile configured yet —
without touch a GUI shell is pointless anyway.

---

## Per-component remaining work (with citations)

### Touch — the single biggest blocker to a usable handset
Controller: Novatek NT36672C TDDI **on SPI** (`compatible="novatek,NVT-ts-spi"`, reset gpio
tlmm 21, irq gpio tlmm 22, fw `novatek_nt36672c_j17_fw0x.bin`). Mainline `novatek-nvt-ts`
supports `novatek,nt36672a-ts` but is **I2C-only** and cannot bind to an SPI part. The vendor
driver (`drivers/input/touchscreen/nt36672c/nt36xxx.c` in `LineageOS/android_kernel_xiaomi_gauguin`
@ `lineage-24.0`) is a 4.19 SPI driver needing a real port to 7.2. yuemuz3 estimates 1-2
weeks; not attempted. **Cannot be inherited from FP4 — FP4 uses a Himax HX83112A touch
controller, a completely different chip.**
Source: yuemuz3 README "Touch: why it is not done".

### Wi-Fi WCN3991 — wiring work, strong prior art
No node in gauguin DTS. Mainline has `ath10k_snoc` for the WCN399x family. **Fairphone 4
(WCN3990, same SoC) runs Wi-Fi in mainline (postmarketOS wiki: Wi-Fi "Partial").** gauguin
should be able to reuse the FP4 DTS wlan node + firmware with minor changes. This is
copy-adapt-and-debug, not new-driver work.
Sources: FP4 wiki table; gauguin DTS (no wifi node).

### Bluetooth WCN3991 — inheritable
No node yet. `hci_qca` + qca639x serdev. **FP4 Bluetooth = "Works".** Inheritable with DTS
wiring. Source: FP4 wiki.

### Audio WCD9375 + CS35L41 — drivers exist, needs wiring + UCM
No sound/codec nodes in gauguin DTS. Mainline has `wcd938x` (WCD937x/938x family) and
`cs35l41` amp drivers. **FP4 (WCD9380) audio = "Partial" in mainline**, so the SoC audio
path (lpass/q6) works; gauguin needs its codec + amp wired in DTS, a machine-sound node, and
an ALSA UCM profile (`alsa-ucm-conf-qcom-sm6350` already stubbed in pmaports). The CS35L41
amp (Cirrus, I2C/SPI, often stereo-paired) is extra wiring beyond what FP4 did. Partial
inherit.
Sources: FP4 wiki; `alsa-ucm-conf-qcom-sm6350` present in pmaports fork.

### Modem / 5G (Snapdragon X52, MSS) — inheritable, surprising upside
No `remoteproc_mpss` node in gauguin DTS. But **FP4 on mainline: Mobile data = "Works",
SMS = "Works", Calls = "Partial"** — the SM7225 modem genuinely works upstream via
remoteproc_mpss + qrtr + ModemManager. gauguin needs the MSS node, firmware path and NV/EFS
wiring. Higher effort than Wi-Fi but demonstrably achievable, contrary to the "no modem
support at all" claim in some gauguin READMEs.
Source: FP4 wiki (Calls/SMS/Mobile data rows).

### Battery / charging (PM7250B + SMB1395/smb5) — inheritable (partial)
No node yet. FP4 battery = "Partial" (charging + level reporting). Needs PMIC + smb5 wiring +
pmic_glink. Source: FP4 wiki.

### Sensors (ICM-40607 IMU etc.) — IIO drivers exist, needs I2C wiring. No FP4 row captured.
### Fingerprint (Goodix GF36xx) — no mainline path; lowest priority.
### Cameras (IMX682/HM2/OV16A1Q) — CAMSS, out of scope for "usable".

---

## What gauguin can and cannot inherit from Fairphone 4

Same SoC (sm7225), and FP4 is a mature mainline/pmOS target, so FP4's `sm7225-fairphone-fp4.dts`
is the single best reference. **Directly reusable (SoC-level, driver already proven on
sm7225):** Wi-Fi (ath10k_snoc), Bluetooth, audio SoC path (q6/lpass + wcd938x family),
modem (remoteproc_mpss), GPS, charger (pm7250b/smb5), GPU firmware approach.
**NOT reusable (board-specific, different chips):** display panel (gauguin NT36672C vs FP4
HX83112A) and touchscreen (gauguin Novatek SPI vs FP4 Himax). Those two — the exact pieces
gauguin is currently stuck on — have no FP4 shortcut.
Source: FP4 wiki hardware rows (Touchscreen/Display = HX83112A; audio WCD9380; Wi-Fi/BT
WCN3988/WCN3990; charger PM7250B).

---

## Biggest blocker + honest effort estimate

**Single biggest blocker: touchscreen.** It is the one daily-usability component with (a) no
mainline driver that binds (SPI vs I2C) and (b) no sibling to copy from (FP4 is a different
touch IC). Everything else broken is "wire up a node + firmware for a driver that already
exists and already runs on FP4." Realistic order of attack and rough effort (estimates, not
confirmed): touch port 1-2+ weeks; Wi-Fi/BT 1-2 weeks (prior art); audio 2-3 weeks (codec +
amp + UCM); battery 1 week; modem 2-4 weeks. Daily-usable (touch + Wi-Fi + audio + battery)
is on the order of **2-4 months part-time** for one developer fluent in Qualcomm mainline
bring-up — much of it debugging, not greenfield.

---

## Community / discussion pointers (names only — not joined/verified live)

- GitHub orgs: `sm6350-mainline`, `sm7150-mainline` (sibling SoC family).
- Key people (from repo commits/credits): **UsrBinLuna / Zephyr1112** (lead gauguin fork),
  **Matteo Cuneo** (gauguin DTS author), **DomHeadroom** (device package, Tianma panel
  driver), **Luca Weiss** (sm6350-mainline + FP4 maintainer, pmOS kernel pkg maintainer).
- **Nura Wiki** hardware status page for xiaomi-gauguin at `wiki.nura.eco` (the Nura project,
  which ships the pmOS/Nura edge gauguin images) — see limitations; I could not read it.
- postmarketOS matrix/IRC `#postmarketOS` and device-porting channels are where sm6350 work
  is typically discussed (general, not gauguin-specific-confirmed).

---

## Aside: iOS/XNU on gauguin (curiosity, not a path)

A separate experiment, `lvyufeng/UniXNU-gauguin` (pushed 2026-10-28), ports **UniXNU**
targeting iOS 16.7.1 (iPhone10,3 / A11) onto gauguin. Status is **very early and far behind
the Linux effort**: firmware runs, DarwinBoot parses the 57 MB XNU kernel and reaches the
pre-MMU probe, then hangs — `UniXNUConnectAll()` never returns and the panel shows blue/magenta
bands at kernel entry. The Adreno 619 GPU path is unverified (the nearest UniXNU example is
Adreno 610 on tb128fu — same GPU family, different IP). Mentioned only to contrast: this is a
research curiosity, nowhere near usable, whereas the postmarketOS/mainline Linux route above is
the only realistic way to run a usable alternative OS on gauguin today.
https://github.com/lvyufeng/UniXNU-gauguin

---

## Confirmed facts vs. guesses

**Confirmed (I verified against the source this session):** gauguin DTS exists only on
`UsrBinLuna/linux-sm6350@sm6350-7.2.y` (not in `sm6350-mainline/linux`, not in
`postmarketOS/pmaports`, not in torvalds); DTS is 390 lines, enables only display/GPU/USB/UFS,
added 2026-10-11 by Matteo Cuneo; stock pmOS config enables no NT36672C panel and no Novatek
touch; `panel-tianma-nt36672c.c` exists in the fork with Kconfig `DRM_PANEL_TIANMA_NT36672C`;
kernel pkg pins `v7.2.0-sm6350` whose tag tree lacks the gauguin dtb (the mismatch); deviceinfo
uses fastboot/header-v2/pagesize-4096, device name `xiaomi-gauguin`, console UI; FP4 wiki rows
(Wi-Fi Partial, BT Works, Audio Partial, Mobile data Works, SMS Works, Calls Partial, Touch
Works on HX83112A, Battery Partial, USB OTG Works). yuemuz3's four boot fixes and "what works"
list are his hands-on results (2026-11-03), reported as such.

**Guesses / estimates (clearly not confirmed):** all effort/time estimates (touch 1-2 wk, etc.
— partly yuemuz3's, partly mine); "2-4 months to daily-usable"; that FP4's Wi-Fi/modem DTS
will port with "minor changes" (plausible, same SoC, but not demonstrated on gauguin);
sensor/fingerprint feasibility; CSOT firmware filename (yuemuz3's own notes disagree fw01 vs
fw02).

---

## Unresolved questions

1. **Nura Wiki hardware table** (`wiki.nura.eco/wiki/Xiaomi_Mi_10i_(xiaomi-gauguin)`) is
   behind Anubis bot-protection and could not be fetched; it is the one source claiming a
   per-component "tested" matrix dated 2026-10-14. Worth a manual browser visit to
   cross-check my DTS-derived table.
2. **Is Matteo Cuneo's gauguin DTS queued for upstreaming** into `sm6350-mainline/linux` (and
   eventually mainline)? It is only in UsrBinLuna's fork today; no PR checked.
3. **Does a Tianma-panel unit actually light up** with just `CONFIG_DRM_PANEL_TIANMA_NT36672C=y`
   + the stock DTS, or does the Tianma driver also have the wrong timing (yuemuz3 implies it
   targets a different sub-variant)? Only CSOT is confirmed working, via a custom driver.
4. **Exact CSOT firmware filename** (fw01 vs fw02) — yuemuz3's README and VM-RUNBOOK conflict.
5. **Wi-Fi/modem firmware availability** for gauguin specifically (FP4 blobs vs gauguin blobs
   from TheMuppets) — not verified.
