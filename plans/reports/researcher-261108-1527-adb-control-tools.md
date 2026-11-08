# Controlling an Android phone from PC over adb/Tailscale — tool research (2026-11-08)

Scope: pick the strongest PC-side control stack for the gauguin phone (LineageOS 24 **eng** build, Android 17: `adb root` available, SELinux permissive, adbd already listening on TCP 5555, no Play certification). Control host: Windows 11, occasionally Linux, phone reachable via Tailscale. Real goal beyond mirroring: let an AI assistant operate the phone.

## TL;DR — ranked top 3

The three winners do different jobs and stack cleanly; they are not competitors.

| Rank | Tool | Job it wins | Why it fits this setup |
|---|---|---|---|
| 1 | **scrcpy 5.0.1** | Human mirroring + input injection, lowest latency, audio | 154.3k stars, Apache-2.0, released 2026-10-08, works over plain `adb connect <ts-ip>:5555`, zero device-side install, no certification, Android 11+ audio |
| 2 | **MobileRun (formerly DroidRun)** | AI-agent control layer (the actual interest) | 10.0k stars, MIT, accessibility-tree + screenshot agent over adb, CLI + Python + MCP, bring-your-own LLM (Anthropic/OpenAI/Gemini/Ollama/…), device-agnostic |
| 3 | **ADB MCP server (e.g. martingeidobler/android-mcp-server) + openatx uiautomator2** | Direct AI-assistant control without a framework; deterministic scripted automation | Screenshot + tap + UI-hierarchy tools exposed to any MCP client (Claude etc.); uiautomator2 gives Python XPath-level control, 8.5k stars, still active |

Everything else evaluated below is either abandoned, research-grade, account-locked, or strictly worse than these on this device.

---

## 1. Mirroring + manual control (scrcpy family and friends)

### scrcpy — the default answer, still unbeaten in 2026

- Repo: [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) — 154.3k stars, Apache-2.0, maintained by rom1v/Genymobile.
- Latest: **v5.0.1 (2026-10-08)**; v5.0 (2026-10-05) added **hardware decoding on the PC enabled by default** (~10x CPU drop, `--hwdec=auto|d3d11va|…`), Windows ARM64 builds; v4.1 added VP8/VP9 encoders; v4.0 moved to SDL3, added flex virtual displays and mDNS TCP device detection; v3.2/3.3 added many audio sources and Android 15/16 fixes.
- Features that matter here: audio forwarding (Android 11+, we have 17), bidirectional clipboard, HID keyboard/mouse (UHID), gamepad, screen-off mirroring (`--turn-screen-off`), recording, camera mirror, **virtual displays** (`--new-display=WxH` / v4 `--flex-display`) — the killer feature for agent use: the AI can operate a display the human isn't looking at, or you can drive the phone with the physical screen off.
- No root needed — but our eng build's `adb root` removes the last edge-case failures (INJECT_EVENTS etc.). Nothing is installed on the device; nothing needs Play certification.
- Wireless: fully documented TCP/IP path. Since our adbd already listens on 5555 (property-pinned), the usual `scrcpy --tcpip` pairing dance is unnecessary — `adb connect` alone suffices. Note: adb's *pairing* flow (`adb pair`) rejects non-RFC1918 addresses (a known Tailscale pain point), but that only affects the modern mDNS wireless-debugging flow; a permanently listening `adbd` on 5555 skips pairing entirely.
- Windows install (official [doc/windows.md](https://github.com/Genymobile/scrcpy/blob/master/doc/windows.md)):

```powershell
winget install --exact Genymobile.scrcpy      # bundles adb
# or: scoop install scrcpy; scoop install adb
# or: choco install scrcpy; choco install adb

adb connect <tailscale-ip>:5555
scrcpy --serial <tailscale-ip>:5555           # audio on by default on Android 11+
scrcpy -s <tailscale-ip>:5555 --new-display=1080x2340 --no-window --record=agent.mp4  # headless capture for an agent
```

Verdict: install this first; it is the observation + manual-control plane for everything else.

### Variants and wrappers

- **QtScrcpy** ([barry-ran/QtScrcpy](https://github.com/barry-ran/QtScrcpy)) — 32.8k stars, Apache-2.0, Windows/macOS/Linux prebuilts. Adds a GUI, **multi-device group control**, game keymaps, APK drag-drop install, and background recording; audio via sndcpy (Android 10+). Trade-off: tracks upstream scrcpy slowly (audio support "more limited" than upstream in 2026 comparisons) and the author's energy has shifted toward commercial offshoots (QuickMirror/QuickAssistant). Choose it only if multi-phone group control becomes a real need.
- **guiscrcpy** — effectively dead: last real development Dec 2023, [declared end-of-life](https://www.linuxfordevices.com/tutorials/android-screen-mirror-guiscrcpy); AUR package broken with PyQt5. Skip.
- **scrcpy-gui / "Scrcpy Plus"** — third-party shells of varying freshness; none matches upstream's pace (upstream is a CLI, which is fine — and better — for agent use). Skip.
- **WS-scrcpy** ([NetrisTV/ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy)) — browser-based scrcpy, last release 2024-03, community reports it hard to run; effectively abandoned. If browser control is ever wanted, [ya-webadb/WebADB](https://github.com/yume-chan/ya-webadb) is the live successor. Not needed for this setup.

## 2. AI-agent control of Android (2025–2026 landscape)

This is the category that actually changed in 2025–2026. Reality check: the "agent" part is the LLM; every practical tool below is a **perception + actuation layer over adb** — which our setup already exposes over Tailscale.

### MobileRun / DroidRun — the practical leader

- Repo: [droidrun/mobilerun](https://github.com/droidrun/mobilerun) — 10.0k stars, MIT, active (1.5k+ commits). Rebrand of DroidRun ("the Phone Layer for AI agents", [droidrun.ai](https://droidrun.ai)); the old DroidRun guides (2025) still apply.
- What it is: LLM-agnostic phone agent. Perception = accessibility tree **+** screenshots; actions = tap/swipe/type/multi-step plans. Works with OpenAI, **Anthropic**, Gemini, xAI, Ollama, DeepSeek, OpenRouter, OpenAI-compatible endpoints — so it can run fully local or against Claude.
- Interfaces: CLI, Python API, and an **MCP server** — i.e., it drops straight into an existing AI-assistant setup. A companion "mobile-harness" agent skill reports 100% AndroidWorld.
- Connection: Android via `adb` **or** the Portal app (an accessibility-service app it installs itself via `mobilerun setup`). Because everything goes through adb, `adb connect <tailscale-ip>:5555` works with no USB — `setup` pushes the Portal APK over the network connection. Python `>=3.11,<3.14` (3.14 unsupported); Windows is not explicitly called out in the README but it is a plain Python/adb toolchain and is widely used on Windows — treat as "works, first run may need adb on PATH".

```powershell
# Windows (Python 3.11–3.13, or use uv)
uv tool install mobilerun            # CLI
uv tool install "mobilerun[anthropic]"
mobilerun setup                      # installs Portal app over the connected adb device
mobilerun ping
mobilerun configure                  # point at your LLM
mobilerun run "Open Settings and turn on dark mode"
```

### MCP servers for raw adb control — lightest-weight agent path

If the AI assistant already speaks MCP, a thin adb MCP server gives it eyes and hands without adopting a framework:

- [martingeidobler/android-mcp-server](https://github.com/martingeidobler/android-mcp-server) — screenshot, tap by element/coordinate, UI hierarchy, logs, bug documentation.
- [adb-mcp](https://www.google.com/search?q=adb-mcp) (TypeScript, 2026) and several "Android ADB Server" listings on MCP marketplaces (Claude/Cursor/VS Code) — same pattern: `adb exec-out screencap`, `input tap`, `uiautomator dump` wrapped as tools.
- These are small enough to audit in an afternoon and trivially work over an `adb connect`-ed Tailscale device. For a custom eng build, this is the highest-control, lowest-dependency option.

### Research-grade GUI agents (know them, don't build on them for daily driving)

- **Open-AutoGLM** ([zai-org/Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM), Zhipu/Z.ai) — open phone-agent *model* (AutoGLM-Phone-9B weights) + adb-driven framework. Interesting if you want a self-hosted VLM doing the reasoning instead of an API; heavier to operate than MobileRun with a hosted model.
- **Mobile-Agent** ([X-PLUG/MobileAgent](https://github.com/x-plug/mobileagent), Alibaba) — v3/GUI-Owl multi-agent research framework; benchmark-oriented.
- **AppAgent** (TencentQQGYLab) — influential paper (~687 citations) for multimodal smartphone agents; demo-grade code.
- **MobileUse**, **opendroid**, **arbigent** — newer open-source phone-use/testing agents (arbigent targets Android/iOS/web *testing* with an AI agent). All adb-based, all viable, none with MobileRun's momentum.

Practical note: for a personal assistant on one phone, a hosted frontier model behind MobileRun or an MCP server will beat self-hosted research agents on reliability. Use the research stack only if local-model operation is a requirement.

### DIY loop (still the lowest-latency path)

`adb exec-out screencap -p` + `adb shell input tap/swipe/text` + `adb shell uiautomator dump` in a loop driven by your own agent code, with scrcpy as the human's observation window. Text-injection gotcha: `input text` mangles spaces/non-ASCII — use the **ADBKeyBoard** IME (openstf, input via broadcast) or rom1v's **yadb** for reliable unicode typing. This is essentially what the MCP servers above package up; write it yourself only when you need custom policies.

## 3. Command-line power tools

- `adb shell input tap|swipe|text|keyevent`, `uiautomator dump` (view hierarchy XML), `getevent`/`sendevent` (low-level input events): all present on the device. On user builds Android 10+ blocks shell injection into `/dev/input` (SELinux); our **eng build with SELinux permissive + adb root lifts that**, so `sendevent` and even legacy binaries work again — but they are legacy for a reason; `input` and uiautomator are coordinate-equivalent and safer.
- **minicap/minitouch (openstf/STF)**: dead end. STF was abandoned in 2020 (DeviceFarmer fork carries it), minitouch is blocked on Android 10+ user builds; on this eng build it would *technically* run, but scrcpy supersedes minicap (better codec, audio) and uiautomator/`input` supersede minitouch. Do not build on STF-era binaries in 2026.
- **openatx/uiautomator2** ([repo](https://github.com/openatx/uiautomator2)) — ~8.5k stars, GitHub active through late 2026 (PyPI releases have lagged; latest visible 3.2.9 from 2025). Python device control with XPath/resource-id selectors, screenshot, watcher; `weditor` is its web UI inspector. Runs over adb-over-wifi (`u2.connect("<ts-ip>")` after `adb connect`, or its own HTTP-over-adb-forward). Best deterministic-automation layer; this is what several agent frameworks sit on.
- **Appium + UiAutomator2 driver** — [appium-uiautomator2-driver](https://github.com/appium/appium-uiautomator2-driver) v9.0.1 (2026-11, breaking changes vs 8.x), very active. W3C-standard, JSONWire server per device, real WebDriver ecosystem. Overkill for phone-as-assistant; pick only if you already have Appium test suites. Works over adb wifi serials.
- **Maestro** ([mobile-dev-inc/Maestro](https://github.com/mobile-dev-inc/maestro), [maestro.dev](https://maestro.dev)) — YAML flow E2E framework, open source, Windows supported, connects to USB **or Wi-Fi adb** devices instantly; 2026 direction is "agentic" testing + AI assertions. Best choice when the assistant should run *pre-written, repeatable* flows (e.g., "run the morning-diagnostic flow") rather than free-form GUI navigation.

## 4. Full wireless suites (consumer)

| Tool | Open source | Account | Custom ROM / uncertified | Over Tailscale adb | Verdict |
|---|---|---|---|---|---|
| [KDE Connect](https://kdeconnect.kde.org) | Yes (GPL) | No | Works on LineageOS (FOSS, no Google) | Partly — UDP-broadcast discovery won't cross subnets; add device **by IP manually** (ports 1714–1764 TCP+UDP) | Good sidekick for notifications/clipboard/files from Linux/Win; not a mirror/control tool |
| [Vysor](https://www.vysor.io) | No | Yes (Pro features, wireless behind paywall) | Works (adb-based) | adb-based, yes | Strictly worse than scrcpy (low-res free tier, proprietary). Skip |
| AirDroid | No | Yes + cloud relay | App leans on Play services for push; degraded without | Uses own cloud, not adb | Wrong tool for a degoogled eng build. Skip |
| DeskDock | No (free tier) | No | adb-based but **USB-oriented** (mouse/kb share, no mirroring) | No | Skip |
| Windows Phone Link / Samsung Flow | No | Microsoft/Samsung account | Needs certified companion device plumbing; typically broken on AOSP/eng builds | n/a | Skip |

None of these need Play certification in the "adb-based" rows, but none of them beat the adb stack anyway. KDE Connect is the only one worth installing, as a complement.

## Certification & security notes

- Nothing in the recommended stack (scrcpy, adb, uiautomator2, MobileRun, MCP servers, Maestro, Appium) requires Play certification, GMS, or a Google account. They are exactly the right class of tools for an uncertified eng build.
- adb over TCP 5555 is unencrypted and authenticated only by RSA key acceptance. On the public internet that would be a firewall incident; confined to the tailnet it is acceptable — but remember **any device on the tailnet can connect**, so keep the tailnet small/trusted. Tailscale encrypts the transport regardless.
- Keep `persist.adb.tcp.port=5555` bound behind Tailscale only (it is, by topology) and do not port-forward it at any router.

## Trade-off matrix

| Dimension | scrcpy 5 | MobileRun/DroidRun | adb MCP + uiautomator2 | Maestro | Appium uiauto2 | QtScrcpy | KDE Connect |
|---|---|---|---|---|---|---|---|
| Mirroring quality/latency | Best (hw decode, 35–70 ms) | None (uses screenshots) | Screenshots only | None | None | Good (upstream-minus) | None |
| Input injection | HID/UHID, best | tap/swipe/type | tap/swipe/type + tree selectors | YAML flows | W3C actions | GUI control | mouse/kb share |
| AI-agent fit | Observation + virtual display | Purpose-built, MCP | Purpose-built, minimal | Fixed flows + AI asserts | Programmatic QA | Low | None |
| File transfer | push/pull via adb | via adb | via adb | — | — | drag-drop | Yes (nice) |
| Windows | First-class | Python, works | Python/TS, works | Yes | Yes (Node) | Yes | Yes |
| Works over `adb connect` (no USB) | Yes | Yes (Portal installed over adb) | Yes | Yes | Yes | Yes | n/a (own protocol, manual IP over TS) |
| Maintenance / community | 154.3k stars, monthly releases | 10.0k stars, active | mixed per-server; uiautomator2 8.5k active | Active, VC-backed | Very active (v9 Nov 2026) | 32.8k, slow | KDE project, steady |
| Cert/account needed | None | None (LLM key) | None | None | None | None | None |

## Recommended stack (do this)

1. **Human plane — scrcpy** (Win11):

```powershell
winget install --exact Genymobile.scrcpy
adb connect <tailscale-ip>:5555
scrcpy -s <tailscale-ip>:5555          # mirror + control + audio
# headless/virtual display for the agent while you keep using the phone:
scrcpy -s <tailscale-ip>:5555 --new-display=1080x2340 --no-audio
```

2. **Agent plane — MobileRun** (CLI/Python/MCP, Claude or local model):

```powershell
uv tool install "mobilerun[anthropic]"
mobilerun setup && mobilerun ping && mobilerun configure
mobilerun run "Open the camera app and switch to video mode"
```

3. **Deterministic/scriptable plane — ADB MCP server + openatx uiautomator2** for scripted flows, app management (`pm install/uninstall`, `am start`), file sync, and giving any MCP-capable assistant direct hands:

```powershell
uv tool install uiautomator2 adbutils   # or: pip install uiautomator2
# MCP: clone/config martingeidobler/android-mcp-server (Python) into your assistant's MCP config
```

Linux side needs nothing different: same scrcpy, same Python tools, `adb connect` over the same tailnet.

## Limitations of this research

- No hands-on testing on the actual device; star counts, versions, and dates reflect web/GitHub state on 2026-11-08.
- Android 17 is brand-new: scrcpy fixed Android 15/16 regressions promptly, but MobileRun's Portal accessibility service and openatx uiautomator2 on A17 are assumed-not-verified; the eng build (root, permissive SELinux) is the safety net that makes breakage fixable.
- Consumer suites (Vysor/AirDroid/DeskDock) were assessed from docs/community evidence, not installed.
- Did not evaluate Mobilerun Cloud (paid hosted phones) — irrelevant when the phone is in hand.

## Unresolved questions

- Does the LOS24 eng build ship GApps/microG? (Only affects AirDroid-class tools, which are rejected anyway.)
- Does MobileRun Portal's accessibility-tree capture work on Android 17? Verify after install; fallback is its screenshot-only mode or the MCP-server path.
- Will more than one phone ever be controlled simultaneously? If yes, add QtScrcpy for group control.

## Sources

- [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) · [releases](https://github.com/Genymobile/scrcpy/releases) · [windows install doc](https://github.com/Genymobile/scrcpy/blob/master/doc/windows.md)
- [droidrun/mobilerun](https://github.com/droidrun/mobilerun) · [droidrun.ai](https://droidrun.ai)
- [martingeidobler/android-mcp-server](https://github.com/martingeidobler/android-mcp-server)
- [barry-ran/QtScrcpy](https://github.com/barry-ran/QtScrcpy) · [srevinsaju/guiscrcpy](https://github.com/srevinsaju/guiscrcpy) (EOL per [LinuxForDevices](https://www.linuxfordevices.com/tutorials/android-screen-mirror-guiscrcpy)) · [NetrisTV/ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy)
- [zai-org/Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM) · [X-PLUG/MobileAgent](https://github.com/x-plug/mobileagent) · [TencentQQGYLab/AppAgent](https://github.com/tencentqqgylab/appagent) · [takahirom/arbigent](https://github.com/takahirom/arbigent)
- [openatx/uiautomator2](https://github.com/openatx/uiautomator2) · [openstf/minitouch (Android 10 issue #49)](https://github.com/openstf/minitouch/issues/49) · [DeviceFarmer/STF status](https://devicelab.dev/blog/openstf-devicefarmer-alternative)
- [appium/appium-uiautomator2-driver releases](https://github.com/appium/appium-uiautomator2-driver/releases) · [appium.io uiauto2 driver](https://appium.io/docs/en/latest/quickstart/uiauto2-driver)
- [mobile-dev-inc/Maestro](https://github.com/mobile-dev-inc/maestro) · [maestro.dev](https://maestro.dev) · [QASkills Maestro guide 2026](https://qaskills.sh/blog/maestro-mobile-testing-guide-2026)
- [KDE Connect](https://kdeconnect.kde.org) · [KDE Connect on LineageOS thread](https://www.reddit.com/r/LineageOS/comments/t36xuv/can_anyone_get_kde_connect_to_work_on_lineageos) · [Vysor](https://www.vysor.io)
- adb-over-Tailscale specifics: [techninja.io root-device method](https://www.google.com/search?q=adb+tcpip+5555+tailscale+root+techninja), `adb pair` RFC1918 check and DNS workaround (eugenehl.medium.com), adblib internals (nexushorizon.dev)

---

Status: DONE
Summary: scrcpy 5.0.1 (154.3k stars, Oct 2026) for mirroring/control + MobileRun/ex-DroidRun (10k stars, MIT, adb-based, MCP-capable) as the AI-agent layer + a thin ADB MCP server with openatx uiautomator2 for deterministic automation; all three run over `adb connect <tailscale-ip>:5555` with no USB, no accounts, and no Play certification.
Concerns: Android 17 compatibility of MobileRun's Portal accessibility service and uiautomator2 is unverified; adb-on-5555 is accessible to anything on the tailnet — keep the tailnet trusted.
