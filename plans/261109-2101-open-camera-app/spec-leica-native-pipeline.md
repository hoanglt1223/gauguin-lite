# Đặc tả pipeline look native (bổ sung cho spec-leica-functional.md)

Ngày 2026-11-09. Cùng quy tắc provenance như `spec-leica-functional.md`: chỉ mô tả logic, công thức, ngưỡng; không chép code, không mang weights/LUT/curve/bảng tham số. Địa chỉ dạng `0x13c9a8` là hàm trong `libfullm9.so` (Ghidra headless, sha256 `9803a969…`); lớp dạng `fullm9.X` thuộc `com.codex.*`. Evidence REA: xem appendix của spec chính.

## 1. Classic CCD (M9) — pipeline full-res (`fullm9.FullM9Engine.render`)

1. **Đo cảnh** (`FullM9Engine.settings`):
   - Nguồn ưu tiên: `CaptureSnapshot` → key capture result chứa `luxindex`/`lux_index` (nhận nếu trong [0,1000]) và key kết thúc `cct`/`colortemperature` (nhận nếu trong [1500,20000] K) → EXIF.
   - Từ EXIF: `lux = clamp(474.9 − (log2(N²/t) − log2(ISO/100))·23.45, 0, 999)` — **lux index kiểu Qualcomm: càng lớn càng tối**.
   - Mặc định: lux 300, CCT 5000. Zoom: `FocalLengthIn35mm ≥ 50` → `zoom = clamp(f35/23, 3.2, 4.3)` (chọn tầng shading tele).
2. **Input:** decode, `DenoiseFlow.prepare` (denoise nhẹ input), ảnh dọc xoay về ngang.
3. **Fit canvas:** `scale = min(1, 4096/W, 3072/H)`.
4. **`NativeM9.frameCreate` (`0x135be4`):** canvas RGB8 cố định 4096×3072, ảnh đặt giữa, phần thừa **mirror-pad**. `m9::Frame::prepare` (`0x13c9a8`) box-average 4×4 → ảnh thấp 1024×768; NaN → lỗi "Non-finite image sample".
5. **Style net** (`M9Graph`, `m9::Frame::styleInput` `0x13cdb0`):
   - Tensor NCHW `[1,4,864,1120]`: ảnh 1024×768 đặt tại offset (48,48), reflect-pad.
   - RGB chuẩn hóa `(v−128)/127.5`; kênh 4 ("mask") hằng `(0−128)/127.5`.
   - **Chọn model:** `lux > 260 && cct < 4692` → `low`; ngược lại → `high`. Tức `low` chỉ cho cảnh tối dưới ánh ấm (tungsten), mọi cảnh khác dùng `high`. Chỉ giữ 1 trong 2 session (`M9Graph.get` đóng cái kia).
   - `styleOutput` (`0x13cf4c`): cắt [48:816, 48:1072] → RGB8 qua `v·127.5+128`, clamp.
6. **Colorfix theo tile — cách lên full-res** (`M9Graph.visibleTiles`, `tileInput` `0x13d0e0`, `tileOutput` `0x13d314`):
   - Lưới 8×6 tile 512 px trên canvas (48 tile); chỉ chạy tile có pixel ảnh thật (log `tiles=N/48`).
   - Input `[1,6,544,544]` (512 + halo 16): kênh 0–2 = ảnh style upsample ×4 nearest; kênh 3–5 = ảnh gốc full-res; ngoài canvas = `−1.0039`.
   - Output: lõi 512×512 ghi về canvas. **Colorfix chạy full-res, ảnh style thấp làm "guide"** — không phải bilateral/guided upsampling cổ điển.
   - Progress 12→77%.
7. **`frameRecover` (`0x13b4f0`):** cắt canvas về kích thước ảnh, scale ngược nếu bước 3 đã thu.
8. **LUT + shading** (`NativeM9.applyFilter(bitmap, lut, shading[8])` `0x13b75c`, per-pixel `m9::leicaPixel` `0x13d4c0`):
   - ≥1 MP → chia hàng cho ≤4 thread.
   - **3D LUT 17³ trilinear** (byte BGR, index `((r·17+g)·17+b)·3`, kiểm tra size = 17³·3).
   - **Vignette luma-only có điều kiện độ sáng:** tọa độ chuẩn hóa quanh tâm (x hiệu chỉnh aspect); `r = √(x²+y²) + dither·0.04·s2` (dither = hash sin cổ điển); `t = clamp((r−s0)/(s1−s0))`, `sm = smoothstep(t)`; `Y' = 0.499R+0.387G+0.114B`; `k = s7 + s6/(1+exp(s4·(s5−Y')))`; `gain = s3·(k + sm·(1−k)) − 1`; `out = rgb + Y601·gain`. Ý nghĩa 8 tham số: s0/s1 = bán kính bắt đầu/kết thúc, s2 = dither, s3 = cường độ, s4/s5 = độ dốc/điểm giữa sigmoid độ sáng, s6/s7 = biên độ/sàn (vùng sáng bị vignette khác vùng tối).
   - Tham số LUT + shading lấy từ `LeicaParams` (§3).
9. **Denoise output** (`DenoiseFlow.finish`, native `outputDenoise` `0x134610`): thống kê lưới ~16000 ô (`cell = √(W·H/16000)`); sigma ước lượng `/3.016`, trần 12; cường độ `(σ−1.25)/5`; chroma denoise ≤0.42; bước sửa giới hạn ±8 (8-bit); luma Rec.709.
10. **Texture recovery** (`NativeM9.restoreTexture` `0x139280`): detail = gốc − blur nhị thức 3×3 trên luma Rec.709; chỉ cộng khi `|d| > 0.8σ + 0.75`; trọng số texture theo gradient chuẩn hóa `clamp((g/(36σ²+…+1) − 0.35)/0.4)`, sàn phương sai 64. Sau đó `quality80.QualityPass.fullDetail` (sharpen thích ứng) và palette người dùng (`CloudGraph.palette`).
11. **Encode:** vẽ lên bitmap `DISPLAY_P3` (`FullM9Engine.p3`). `boost()`: tỉ lệ pixel có B ≥ 250 — <8% → headroom 5.0, >20% → 4.0, giữa nội suy tuyến tính; headroom cho gain map Ultra HDR (`FullM9Hdr`).
12. Watermark (nếu bật) rồi HDR/encode cuối — xem spec chính §4.2.

**Không có grain trong đường Full M9.** Grain chỉ ở `MadridShader` và Silver Mono.

**Đường RAW (tồn tại, tắt mặc định)** (`NativeM9.rawOpen/rawStats/rawRender`, `fullm9.Tuning`, `fullm9.AE`): lux/CCT từ `DngMeta`; AE đo bằng tuning `ae_m9.json`/`ae_tele.json`; ma trận màu `CCM = CCM_look(adrc,lux,cct) · CCM_normal(adrc,lux,cct)⁻¹ · camera→sRGB` (nghĩa là "delta look" so với tuning gốc), cộng LUT hue/sat 2D, gamma, chroma, tone curve; render 2 cấu hình (thường + HDR).

## 2. Ý nghĩa file tham số (ngữ nghĩa, không dữ liệu)

- **`styletrans_params.json`:** `styletrans_size`/`colorfix_size` (H,W,C), `snpe.runtime=dsp`, `encrypt`/`key` (cờ giải mã `.minn`, ở đây false), `dlcs[]` gồm `dlc_name`, `model_index` (0 low, 1 high, 2 colorfix), I/O `shape` NHWC, `encoding tf16`, `offset −128`, `delta 0.007843` → `float = (q + offset)·delta` (0..255 ↦ [−1,1]). `Threshold.lux_threshold_daytime=260`, `cct_threshold=4692` (quy tắc chọn ở §1.5).
- **`conversion-validation.json`:** mỗi ONNX: `bytes`, `max_abs_vs_torch` (~1–2e-6), `seconds` (thời gian convert), `opset 17`, `ir 8`.
- **`leica_filter_param_<look>_{snapshot|preview}.bin`** (`fullm9.LeicaParams`, u16 LE):
  - Header: số scene + kích thước scene, offset khối LUT, hằng 17 (kích thước LUT; sai → lỗi), số tầng zoom.
  - Scene: tên 64 byte + **cây 2 tầng bin lux [lo,hi] → bin CCT [lo,hi] → LUT index**.
  - Khối LUT: `lutCount × 17³ × 3` byte.
  - Tầng zoom: `zoom_min` + cây lux/CCT → bộ shading 8 float.
  - Lookup (`LeicaParams.corners`): 2 bin lux bao quanh × 2 bin CCT trong mỗi bin → **trộn song tuyến tính 4 góc** (LUT trộn byte, shading trộn float). Tầng zoom = tầng lớn nhất có `zoom ≥ zoom_min`.
  - `preview` và `snapshot` cùng định dạng, dữ liệu khác (preview nhẹ hơn).
  - **open-camera:** thiết kế lại cùng ý tưởng: LUT/vignette nội suy theo (lux, CCT, zoom), dữ liệu tự tạo.
- **`ae_m9.json` / `ae_tele.json`** (`fullm9.AE`, đường RAW): AEC dạng Qualcomm. `metering.base_target_by_lux.*` = luma mục tiêu theo node lux × node DR, trần/sàn, hệ số zoom; `spot_light_detection.*` = phát hiện nguồn sáng điểm để giữ highlight; `hist_target_by_lux.*` = mục tiêu theo histogram (phần trăm sáng/tối, riêng cho mặt); `normal_drc_ctrl.*` = gain DRC tối đa theo lux (`adrc = max(1, min(interp(lux), …))`). Nội suy 1D/2D tuyến tính.
- **`ipe_tables.json`** (`fullm9.Tuning`): dump tuning IPE ISP theo profile `m9`, `normal`, `tele`, `tele_normal`, `m9_lin`; khối gamma, ma trận màu 3×3, chroma, LUT 2D hue/sat, local tone mapping, tone curve; mỗi khối có node trigger (adrc, lux, CCT) để nội suy. `m9*` = look, `normal*` = gốc để lấy nghịch đảo.

## 3. Chọn look và khác biệt (`donor120.LeicaEngine.process`)

| Look | Chuỗi thử (dừng ở nhánh đầu thành công) | Tham số khác biệt |
|---|---|---|
| Classic CCD (M9) | (1) runner SNPE/DSP `model120.LegendaryPostProcessor.processM9` — chỉ SoC Qualcomm (`Build.SOC_MANUFACTURER`) → (2) `M9CpuFallback` (nếu `allowCpuFallback`) → (3) `M9Distill` → (4) `M9OrtFallback` → (5) `MadridLegendary("M9")` LUT thuần | Warm filter (denoise 0.6, EV −0.95, warmth 0.3) + param `m9_snapshot`; runner gọi lux 200 / CCT 5500 cố định |
| Classic CCD Plus (M9+) | Như M9; sau nhánh thành công thêm `boostSaturationContrast` | Warm filter (0.6, −1.3, 0.5); boost: saturation ×1.25 (ColorMatrix) → R·(1+0.04), B·(1−0.04) → contrast `1.1·v + (1−1.1)·128`; JPEG q100 |
| Rangefinder Neutral (M10-R) | `MadridLegendary("M10R")` → `processM10R` (style net + warm filter param `m10r_snapshot`, (0.6, −0.95, 0.3)) → CPU → Distill → ORT. **Mọi nhánh kết thúc `MadridShader(0.3)`** | **Có dùng style net** (sửa spec cũ) |
| Silver Mono (M3) | `applyOriginalFilter(m3 param, lux 200, CCT 5500)` + runner mono (`libzxalgo_monopan.so`) → lỗi: `MadridLegendary("M3")`. Luôn kết bằng `M3Mono.ensure` (ép xám thật, `quality80.MonoRows`) | Xem công thức dưới |
| Distilled (M9D) | Distill → ORT → LUT thuần | — |
| Khác | cine LUT (`AlexaLut`, shader 0.22), portrait SepLUT (`PortraitFilm`, shader 0.18, lỗi → LUT M9), vivid LUT (shader grain 0 / vig 0.3), `Lm9Stats` | — |

**Silver Mono CPU (`donor120.M3Mono.convert`):**
- Luma `0.54R + 0.40G + 0.06B` (nghiêng đỏ → trời tối).
- Curve: `t = clamp((v−10)/236)`, `v' = 10 + 236·(t + 0.42·(smoothstep(t) − t))` (đen 10, trắng 246 — fade nhẹ).
- Grain: lưới nhiễu xorshift (seed cố định), cell `max(1, W/1400)` px, nội suy song tuyến; biên độ `13·(0.3 + 0.7·clamp(4·l·(1−l)))` → mạnh ở trung tính.
- Ngưỡng coi ảnh đã xám: chroma trung bình < 2.5.

**`model120.MadridShader.apply(grain, vignette)`** (sau M10-R/cine/portrait/vivid):
- Vignette: `d = dist((x−0.5)·0.75, y−0.5)`; `P = 100^−(1−Y709)`; hệ số `P + (1−P)·(1 − (1 − smoothstep(1.4, 0.2, d))·vig)` → vùng sáng gần như không bị tối góc.
- Grain: texture nhiễu 256×256 (hash sin, trung bình 6 mẫu), lặp ô; biên độ `(1 − Y')·grain` → grain ở vùng tối.
- JPEG q100, copy EXIF.

## 4. ONNX I/O (đọc header protobuf, `miui-ports/leica/scripts/onnx_header.py`)

| Asset | Producer / IR / opset | Inputs | Outputs | Kiến trúc (suy từ op) |
|---|---|---|---|---|
| `donor120/m9fb_styletrans_high.onnx` (16.6 MB) | pytorch 2.x / IR 10 / opset 18 | `rgb` f32 [N,3,864,1120]; `mask` f32 [N,1,864,1120] | `out` f32 [N,3,864,1120] | UNet kiểu MobileNet (Conv+ReLU6, Concat, Resize). Chỉ có "high"; Java đưa mask = 0 |
| `donor120/m9_distill.onnx` (0.67 MB) | pytorch / IR 8 / opset 17 | `lowres` [b,3,lh,lw]; `full` [b,3,h,w] | `out` [b,C,h,w] | Lowres dự đoán hệ số, áp lên full (kiểu guided/bilateral) |
| `cacnet.onnx` (78 MB) | pytorch 2.2 / IR 8 / opset 16 | `image` [1,3,224,224] | `crop` [1,4]; `attention` [1,1,224,224] | GridSample, DepthToSpace |
| `nima-aesthetic.onnx` (12.8 MB) | tf2onnx / IR 7 / opset 13 | `image` [1,224,224,3] | `dense` [1,10] softmax | MobileNet |
| `leica-v4/styletrans_{low,high,colorfix}.minn` | SNPE DLC | theo `styletrans_params.json` | | Chỉ chạy qua runner DSP/CPU |
| ONNX low/high/colorfix của `M9Graph` | opset 17 / IR 8 | `input` [1,4,864,1120] / [1,6,544,544] | 3 kênh | Dim symbolic; **không có trong APK** (lấy ngoài qua `Assets.model()`) |

Thiếu trong APK: `lm9_net.onnx` (`Lm9Net`), `seplut_fivek.onnx` (`PortraitFilm`) → hai nhánh này luôn fallback trên bản cài này.

## 5. Fallback và runtime

- **`M9Graph` ORT session:** `intraOp = threads` (XNNPACK: intra ORT `min(2,cores)`, thread XNNPACK = `threads`), `interOp 1`, tắt CPU arena và mem pattern, `ALL_OPT`, `allow_spinning=0`. Tạo session lỗi với backend ≠ CPU → ghi `name:config` vào tập `FAILED`, `M9CpuPolicy.forget`, quay về ORT CPU; lỗi lúc chạy → về CPU và chạy lại.
- **Hiệu chỉnh online** (`M9Graph.trial`, trên tile colorfix): chạy cấu hình hiện tại → snapshot output → chạy ứng viên, đo giờ → `M9CpuPolicy.matches(…, 544, 544, border 16)` bắt buộc khớp (sai → "CPU candidate changes consumed pixels", loại) → OOM dừng hiệu chỉnh → lưu winner (`M9CpuPolicy.save`). Chi tiết candidate/TTL: spec chính §8.4.
- **Bộ nhớ:** buffer direct dùng chung (input ~3.87 M float, output ~2.9 M float). Session **release sau 60 s idle** (thread `M9-model-idle`, đếm `generation`). Mọi chạy model `synchronized` trên `M9Graph` + lock render toàn cục `FullM9Engine.LOCK`.
- **`M9CpuFallback`:** chạy **tiến trình con** (runner SNPE trên CPU) với argv `<libdir> <modeldir> in.raw out.raw W H rot lux cct` (lux 200, CCT 5500), `LD_LIBRARY_PATH` gồm stub DSP; exit ≠ 0 → ghi `last_run.txt` + logcat. Ý tưởng cho open-camera: cô lập model nặng ở process riêng để crash/OOM không giết app.
- **`M9Distill`:** fit 4096×3072; `lowres` cạnh ngắn 256; `full` tile KEEP 1024 + HALO 96, mirror pad; chuẩn hóa `/255`; sau đó warm LUT, JPEG q95.
- **`M9OrtFallback`:** fit 4096×3072, mở canvas về 4:3, mirror pad, scale 1024×768, pad 48 → 1120×864; input `(v−128)/127.5`, mask 0; output cắt 1024×768, upscale. **Bơm lại chi tiết:** `out = up(style) + gốc − up(blur_σ1(gốc/2))` (thay tần thấp, giữ tần cao gốc). Warm LUT, JPEG q95; cache 1 entry theo CRC32.
- **Quy tắc rẽ nhánh:** không phải Qualcomm → bỏ SNPE; `allowCpuFallback=false` → bỏ runner CPU; mỗi nhánh trả null (exception/decode lỗi/thiếu model) → nhánh kế; cuối cùng LUT thuần + `diagNative` (thu logcat).
- **Thư viện:** backend QNN đổi tên (`libd12Htp`, `libd12HtpV81Stub`, `libd12Cpu`, `libd12System`), ORT (`libd12xruntime*`), runner `libstyletrans_runner.so` (chuỗi log `Styletrans run=%d rotation=%d lux=%d cct=%d`). Ba `lib{mialgo,zxalgo}_styl*.so` cùng kích thước 13.6 MB, hash khác.

## 6. Hướng cho open-camera

- Baseline nhanh: LUT 17³/33³ + vignette luma có sigmoid độ sáng + grain theo luma, tham số nội suy (lux, CCT, zoom) — tái tạo đúng cấu trúc §1.8/§2, dữ liệu tự làm.
- Look AI: kiến trúc 2 tầng "style thấp + refine full-res theo tile có halo" (§1.5–1.6) hoặc distill kiểu lowres→full (§4) — model tự huấn luyện.
- Giữ chi tiết: dùng công thức "thay tần thấp" (`M9OrtFallback`) hoặc detail-gate theo σ (§1.10).
