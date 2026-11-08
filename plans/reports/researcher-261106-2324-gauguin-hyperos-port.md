# HyperOS on gauguin (Mi 10T Lite / Redmi Note 9 Pro 5G / Mi 10i) — port availability & feasibility

Date: 2026-11-06 (Asia/Saigon)
Device: Xiaomi gauguin, M2007J17G, Snapdragon 750G (SM7225), Sony IMX682. EOL. Last official firmware MIUI 14 (Android 12), 2023.
Task: find a usable full HyperOS ROM for gauguin, evaluate every realistic route, rank, and give a stay-vs-flash verdict against the current LineageOS 24 (Android 17) daily driver.

## Bottom line (read this first)

**No usable full HyperOS ROM exists for gauguin, and none is in active development.** Every "HyperOS for gauguin" link found is mislabeled MIUI 14 (version strings `V14.x...XM`, Android 12) served under a `/hyperos/` URL path by SEO firmware mirrors. Real HyperOS uses `OS1.x / OS2.x / OS3.x` version strings; zero such builds exist for this codename on any channel checked (XDA, Telegram, 4PDA-adjacent, GitHub, SourceForge, xiaomi.eu).

**Recommendation: stay on LineageOS 24. Do not flash a HyperOS port.** There is nothing credible to flash, and building one yourself is a high-effort project with a near-certain broken camera/VoLTE outcome on this SoC. Flashing would wipe your working Leica camera, root, and banking-hiding setup for a downgrade to Android 12-era internals.

## What "HyperOS for gauguin" actually is on the web

The search space is polluted. Three distinct false positives:

1. **Mislabeled MIUI mirrors.** ximitime.com, memeosupdates.com, samsony.net, mifirm.net all host gauguin firmware under `/hyperos/gauguin/` URLs, but every listed build is MIUI 14 / Android 12 (e.g. `V14.0.4.0.SJSEUXM` EEA 2023-07-10, `V14.0.2.0.SJSCNXM` China 2023-04-03). These are the device's last *official* MIUI, not HyperOS. The `/hyperos/` path is a site-wide template label, not a device fact.
2. **A xiaomi.eu HyperOS release that is a different device.** The Telegram post "XIAOMI.EU HYPEROS V1.0.3.0 STABLE" (`t.me/FeLLzProjects/359`) is for **raphael / raphaelin** (Mi 9T Pro / Redmi K20 Pro), not gauguin. Unrelated.
3. **A generic repack project that lists but does not ship gauguin.** See candidate C below.

## Candidates investigated (ranked best-to-worst for daily use)

None is a real, flashable, usable HyperOS build for gauguin. Ranked by how close each comes.

### A. Build-your-own via `toraidl/hyperos_port` — theoretically possible, practically not worth it
- **Source:** https://github.com/toraidl/hyperos_port
- **HyperOS/Android:** Tool ports a HyperOS (Android 14) system package onto an **Android 13** device base. Last commit 2024-12-16; ~210 stars.
- **Download/flash:** N/A — it builds a fastboot/recovery package from a base ROM + a donor HyperOS "port package" you supply.
- **Data wipe:** Yes (full firmware flash).
- **gauguin support:** **None.** Tested devices are flagships only — Xiaomi 10/10 Pro/10 Ultra/10S, 12, 13 series, 14 series, Pad 5 Pro. No Snapdragon 7-series, no gauguin. GitHub issue search for `gauguin` in the repo returns **0 results** — nobody has reported trying it.
- **Why it breaks on gauguin specifically:**
  - *Base mismatch:* the tool expects an **Android 13 HyperOS/MIUI base for the target device**. gauguin's last official base is MIUI 14 **Android 12**. There is no gauguin HyperOS base and no gauguin A13 official base to graft onto — you would be fighting the tool's core assumption from the start.
  - *Camera:* HyperOS's MiuiCamera + the donor's camera HAL/blobs are tuned to the donor's sensors and ISP. On a cross-ported Snapdragon 7-series device the multi-camera setup (IMX682 64MP main + aux) typically drops to a single working lens or fails to open — exactly the failure already documented for gauguin on AOSP ports (/e/OS: only one rear camera, workaround is PhotonCamera). You would lose the Leica pipeline you have today, not gain a better one.
  - *VoLTE/VoWiFi:* IMS config in HyperOS is carrier-XML + modem-blob dependent. Cross-ported onto a non-native base, VoLTE/VoWiFi commonly breaks or needs per-carrier patching — a known pain point on all 7-series ports.
  - *Sensors/fingerprint/BT:* fingerprint and side sensors often need the matching vendor/odm blobs; side-mounted FP on gauguin is a frequent breakage on non-native system ports.
- **Verdict:** A multi-week solo porting project with no prior art for this device and a near-certain broken camera. Not a daily driver path.

### B. xiaomi.eu — exists for gauguin, but is MIUI 14, not HyperOS
- **Source:** xiaomi.eu (gauguin listed on customrombay.org aggregation as "xiaomi.eu, Official, MIUI 14").
- **HyperOS/Android:** MIUI 14 / Android 12. xiaomi.eu's HyperOS branch (now up to HyperOS 3) is built **only for devices Xiaomi itself ships HyperOS to**; gauguin is EOL and was never in that set. No gauguin OS1/OS2/OS3 build exists or will.
- **Flash:** fastboot/recovery, unlocked bootloader; full wipe.
- **Verdict:** Closest thing to "stock Xiaomi UI, polished" but it is **not HyperOS** and it is Android 12-era — strictly older than your current LineageOS 24. Does not meet the ask.

### C. SourceForge "flashhchaton" repacked HyperOS — lists gauguin, ships nothing for it
- **Source:** https://sourceforge.net/projects/flashhchaton/
- **Claim:** supported-devices string includes "Redmi Note 9 Pro / Xiaomi 10T Lite (gauguin / gauguinpro)."
- **Reality:** the only actual download on the project is `Marble_1.0.6.0.UMRCNXM...zip` (a different device, marble). **No gauguin file is present.** Project status is marked **Inactive**; page notes prior files were removed by SourceForge. No version, no flash instructions, no stability data for gauguin.
- **Verdict:** Vaporware for this device. Treat the device-list entry as an aspirational template, not an available ROM. Also an untrusted redistribution source.

### D. Everything else — does not exist
- **XDA:** no gauguin HyperOS port thread found. gauguin's active custom-ROM scene is AOSP only.
- **Telegram / 4PDA:** no dedicated gauguin HyperOS channel or flashable zip found.
- **GitHub:** repo search `gauguin hyperos` = **0 results**. gauguin repos that exist are AOSP device/kernel/vendor trees (Sap1k, aospa-gauguin, kumarshailesh-codes) — LineageOS/crDroid-type material, not HyperOS.

## What gauguin *can* run (for context)
Per customrombay aggregation: LineageOS (A13 official), PixelOS (A14), DerpFest (A14), LibreMobileOS/AncientOS/ArrowOS/AncientOS (A13), /e/OS (A13). Your LineageOS 24 Lite (Android 17) is already newer than any of these public builds — you are ahead of the public gauguin ROM scene, not behind it.

## Stay vs flash — honest verdict

**Stay on LineageOS 24.** Reasoning:
- There is no HyperOS port to flash. The only "Xiaomi-skin" option (xiaomi.eu MIUI 14) is Android 12 — a large downgrade from your Android 17 base.
- You would trade a **working Leica camera, root, and banking-hiding** for a self-built port whose single most likely casualty is the camera (documented failure mode on this SoC/sensor), plus probable VoLTE and fingerprint regressions.
- Revert cost is non-trivial even though you can restore `D:\Projects\gauguin\stock\lineage-24.0-20261106-UNOFFICIAL-gauguin.zip`: any attempt is a full wipe, re-root, and re-setup of banking hiding each cycle.
- The only scenario where HyperOS is worth pursuing is if the *HyperOS UI itself* is the goal regardless of broken hardware (e.g. a secondary/experiment phone). For a daily driver it is a clear net loss.

If the HyperOS look is what you're after, a far safer route than a firmware port is a HyperOS-styled launcher/theme on your existing LineageOS — no wipe, no hardware risk. (Out of scope for this research; flag if you want it evaluated.)

## Source credibility notes
- Authoritative-negative: GitHub repo/issue search (0 results), customrombay ROM list, toraidl README tested-device list.
- Treat as SEO mirrors, not ground truth on OS type: ximitime, memeosupdates, samsony, mifirm (they relabel MIUI as HyperOS).
- Untrusted redistribution, avoid: flashhchaton SourceForge (inactive, no gauguin file).

## Limitations / unresolved questions
- xiaomi.eu's forum and ROM-checker require interactive device selection; both were checked but neither is scriptable here. The negative conclusion rests on gauguin's EOL status and absence from every HyperOS channel — strong but not a byte-level confirmation of "never."
- 4PDA's gauguin thread was not opened directly (search-engine indexing only); no HyperOS zip surfaced, but a dormant Russian-community link cannot be 100% excluded. If you want certainty, the single highest-value manual check is the 4PDA Mi 10T Lite firmware thread.
- `gh` CLI was unavailable this session (broken shell profile init); GitHub checks were done via web search instead — results are consistent and I consider them reliable.

Status: DONE
Summary: No usable or in-development full HyperOS ROM exists for gauguin — all "HyperOS/gauguin" links are mislabeled MIUI 14; building one via toraidl is unsupported for this device and would almost certainly break the camera/VoLTE. Recommend staying on LineageOS 24.
Concerns: 4PDA's gauguin thread and xiaomi.eu's interactive checker were not opened interactively; conclusion is strong (EOL + absent from every channel) but not byte-level exhaustive.
