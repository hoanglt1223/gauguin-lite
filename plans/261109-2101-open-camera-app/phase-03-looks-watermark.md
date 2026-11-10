# Phase 3: Looks (LUT tự làm), watermark, xử lý nền (MVP)

## Bối cảnh

Leica port có Leica Styles (M9/M9+/M10-R/M3, style transfer ONNX có đường lùi CPU/LUT), watermark nhiều mẫu, thông báo "background rendering". MIUI có filters, watermark thiết bị/thời gian. Không được dùng LUT, model, artwork của các app này. Looks được thiết kế lại: LUT 3D tự tạo từ mô tả công khai về màu (đường cong tông, độ bão hòa từng dải màu, độ hạt, vignette), không có tên thương hiệu.

## Yêu cầu

- Định dạng look: `looks/<id>/look.json` (tên, mô tả, tham số) + `lut.cube` (33³, sRGB→sRGB hoặc log→display) + tùy chọn grain, vignette, halation, tone curve.
- Bộ look đầu tiên (tự làm, CC0 hoặc CC-BY-4.0 của dự án): Natural, Vivid, Classic CCD, Classic CCD Plus, Rangefinder Neutral, Silver Mono, Warm Film, Cool Film, Faded, High Contrast Mono.
- Công cụ tạo LUT: script `tools/lutgen` (Python + numpy, chạy ngoài app) từ tham số đọc được; có thể dùng ảnh tham chiếu tự chụp (color checker) để chỉnh.
- Áp look trong preview (GPU, OpenGL ES 3 shader 3D texture qua `CameraEffect`/`OverlayEffect` của CameraX hoặc `SurfaceProcessor`) và trên ảnh cuối (native C++ trong `:pipeline`, nội suy tetrahedral).
- Editor look: cường độ (0–100%), grain, vignette; lưu look tùy chỉnh; nhập `.cube` của người dùng.
- Watermark/khung: "EXIF strip" (máy, ống, tiêu cự, f, tốc, ISO, thời gian), "Film border", "Polaroid", "Minimal", font mở (Inter, IBM Plex — OFL), tên máy lấy từ profile; tùy chọn logo người dùng tự nạp.
- Xử lý nền: `WorkManager` expedited/foreground worker, thông báo tiến trình, hàng đợi bền (Room), lưu ảnh gốc trước rồi thay bằng bản đã xử lý (`IS_PENDING`), không mất ảnh khi app chết.
- Không dùng style transfer ML ở phase này; phase 5 bổ sung tùy chọn.

## File / module

- `pipeline/src/main/cpp/lut/*`, `pipeline/.../LookRenderer.kt`, `WatermarkRenderer.kt`, `ProcessingQueue.kt` (Room), `ProcessingWorker.kt`
- `app/src/main/assets/looks/*`, `app/.../ui/looks/*` (editor), `tools/lutgen/`
- `licenses/assets.md` (nguồn font, LUT)

## Các bước

1. Lutgen + 10 look, review màu trên màn hình hiệu chuẩn.
2. Shader preview, đo FPS trên gauguin.
3. Renderer native cho ảnh cuối, khớp màu với preview (ΔE trung bình < 2 trên ảnh test).
4. Watermark renderer + 4 mẫu.
5. Hàng đợi nền + thông báo.
6. Phát hành 0.1 (cùng phase 1, 2).

## Kiểm chứng

- Preview có look ≥ 30 fps ở 1080p trên gauguin.
- Ảnh 64MP (IMX682 full) áp look + watermark < 3 s trên gauguin; ảnh 12MP < 1 s.
- Kill app khi đang xử lý: ảnh gốc vẫn có trong DCIM và được xử lý tiếp khi mở lại.
- Unit test: LUT identity cho ảnh không đổi; parse `.cube` lỗi bị từ chối có thông báo.

## Rủi ro

- Look "giống Leica" vô tình gợi nhãn hiệu → tên và mô tả trung tính, không nhắc hãng trong UI/store.
- Lệch màu preview/final → dùng chung LUT và cùng không gian màu, test ΔE.

## Rollback

Look mặc định "None" = Aperture gốc; tắt hàng đợi nền thì lưu ảnh trực tiếp.
