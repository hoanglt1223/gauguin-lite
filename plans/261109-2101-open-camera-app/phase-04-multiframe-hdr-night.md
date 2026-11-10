# Phase 4: Đa khung: HDR, Night, Astro, Super Res Zoom

## Bối cảnh

Mục tiêu tương đương HDR+ (Hasinoff et al. 2016), Night Sight (Liba et al. 2019), Astrophotography, Super Res Zoom (Wronski et al. 2019) của GCam, và Night mode của MIUI. Thuật toán công bố trong bài báo; cài đặt mở tham khảo: Halide (MIT), "hdr-plus" của timothybrooks (giấy phép cần xác minh, chỉ đọc thuật toán cho tới khi xác minh), IPOL "HDR+ pipeline" (Monod et al. 2021). Trên gauguin: SM7225, Adreno 619, IMX682; HAL MIUI-derived có thể không cho burst RAW ổn định.

## Yêu cầu

- Bắt burst: Camera2Interop qua CameraX (`Camera2CameraControl`, `ImageCapture` không đủ cho burst) hoặc phiên Camera2 riêng trong `:capture` cho chế độ đa khung; ưu tiên RAW_SENSOR, lùi về YUV_420_888 khi máy không có RAW (đọc từ profile/quirk).
- Thuật toán merge (Halide AOT, arm64, có đường CPU và Vulkan/OpenCL nếu Halide hỗ trợ trên máy):
  - Align: pyramid tile matching (Hasinoff 2016).
  - Merge: Wiener-like trong miền tần số trên tile, hoặc robust merge.
  - Finish: demosaic (RAW), white balance (AWB từ HAL), local tone mapping (exposure fusion Mertens, có trong OpenCV Apache-2.0), sharpen, chroma denoise.
- HDR: 4–15 khung underexposed bằng nhau (bracket bằng nhau, không bracket EV), ZSL buffer khi máy hỗ trợ.
- Night: kích hoạt theo lux ước lượng (`SENSOR_EXPOSURE_TIME`×ISO); exposure dài tới 1/3 s cầm tay, tới 4 s trên chân máy (phát hiện chân máy bằng gyro); motion metering từ chuyển động preview.
- Astro: khi chân máy + rất tối, tới 16 khung × 4–16 s nếu HAL cho phép (`SENSOR_INFO_EXPOSURE_TIME_RANGE`); hot pixel suppression.
- Super Res Zoom: handheld multi-frame SR (Wronski 2019) cho stop crop 2x trên main; lùi về upscale đơn khung (phase 5 SR model).
- Ngân sách: chụp xong trả lại UI ngay, merge trong hàng đợi phase 3; preview thumbnail tạm.

## File / module

- `capture/.../BurstController.kt`, `ExposurePlanner.kt`, `MotionMeter.kt`, `TripodDetector.kt`
- `pipeline/src/main/halide/{align,merge,finish,superres}.cpp`, `pipeline/.../MultiFrameProcessor.kt`
- `:app`: chế độ Night, nút HDR (auto/on/off)

## Các bước

1. Đo khả năng thực tế của gauguin: RAW burst fps, exposure tối đa, ZSL (ghi vào profile seed).
2. Halide toolchain trong build (AOT generator chạy trên host, `.a` + header commit hoặc sinh trong CI; Soong: `cc_prebuilt_library_static` hoặc sinh trước).
3. Align + merge trên RAW, test trên burst DNG từ dataset HDR+ (Google, giấy phép CC-BY 4.0, xác minh) và burst tự chụp.
4. Finish pipeline + tone mapping; đường YUV.
5. Night, Astro, SR theo thứ tự.
6. Tuning bằng bộ ảnh so sánh cố định (`tests/scenes/`).

## Kiểm chứng

- Trên dataset burst: PSNR/SSIM cải thiện so với khung đơn; không ghosting ở cảnh chuyển động (kiểm bằng mắt trên 20 cảnh chuẩn).
- Gauguin: HDR 8 khung 12MP xử lý < 4 s; Night < 8 s; không OOM (giới hạn tile, theo dõi `ActivityManager.getMemoryInfo`).
- Máy không có RAW: HDR qua YUV vẫn chạy.

## Rủi ro

- HAL không cho exposure dài hoặc RAW burst → quirk + giảm khung, ghi rõ trong UI.
- Halide trong Soong phức tạp → dùng thư viện sinh trước, CI kiểm hash.
- Bộ nhớ khi 64MP → merge ở 16MP binned trừ khi người dùng chọn 64MP.

## Rollback

HDR/Night tắt bằng flag; chụp đơn khung vẫn là mặc định an toàn.
