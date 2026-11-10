# Phase 6: Video và các chế độ phụ

## Bối cảnh

Aperture đã có video CameraX (`camera-video`), HDR video (`VideoDynamicRange`), stabilization mode, frame rate. MIUI 14 có: short video, slow-mo, time-lapse, dual video, movie effects, panorama, document. Trên gauguin có báo cáo lỗi vidhance EIS và đảo màu video MIUI (`plans/reports/debugger-261109-1530-miui-video-stabilization.md`, `debugger-261109-1514-miui-video-color-swap.md`), nên ổn định hình phải dựa vào API chuẩn hoặc tự làm.

## Yêu cầu

- Video: 4K/1080p 30/60, codec HEVC/AVC, bitrate tùy chọn, look LUT trong preview và trong file (qua `CameraEffect` của CameraX áp lên `VideoCapture`), zoom mượt giữa ống theo `LensPlan`.
- Ổn định: `CONTROL_VIDEO_STABILIZATION_MODE` / preview stabilization khi HAL hỗ trợ; nếu không, EIS phần mềm bằng gyro + crop 10% (shader warp trên `SurfaceProcessor`).
- Slow-mo: `CameraConstrainedHighSpeedCaptureSession` (120/240 fps) khi profile báo hỗ trợ; ghi file với metadata tốc độ phát.
- Time-lapse/hyperlapse: chụp khung theo khoảng, mã hóa `MediaCodec`; hyperlapse dùng ổn định gyro.
- Short video: clip 10–60 s, nhạc nền người dùng chọn (không đóng gói nhạc), cắt bằng Media3 Transformer.
- Dual video: `ConcurrentCamera` của CameraX (API 30+, khi `getConcurrentCameraIds` có cặp), lùi về ẩn chế độ.
- Movie effects: tự làm "bokeh video" (segmentation phase 5), "time freeze", "slow shutter" (tích lũy khung).
- Panorama: ghép bằng OpenCV `Stitcher` (Apache-2.0), hướng dẫn quét bằng gyro.
- Document: phát hiện viền OpenCV + perspective + làm trắng nền, xuất PDF (Android `PdfDocument`).
- Âm thanh: chọn mic, mức gió (nếu có), ghi stereo.

## File / module

- `capture/.../video/*` (`VideoController.kt`, `HighSpeedSession.kt`, `GyroEis.kt`)
- `pipeline/.../{Panorama,Document,TimeLapse}Processor.kt`
- `:app` `models/CameraMode.kt` (thêm mode), `ui/views/CameraModeSelectorLayout.kt`

## Các bước

1. Video LUT + chất lượng; EIS gyro.
2. Slow-mo, time-lapse.
3. Panorama, document.
4. Short video, dual video, movie effects.

## Kiểm chứng

- Gauguin: 4K30 10 phút không rớt khung (> 99% khung đúng hạn), nhiệt độ theo `ThermalStatus` có hạ cấp tự động.
- Màu video khớp preview (không đảo kênh, kiểm ảnh thẻ màu).
- Mỗi mode không hỗ trợ trên máy bị ẩn thay vì crash (test trên emulator).

## Rủi ro

- `CameraEffect` + HDR video không tương thích trên vài máy → quirk `HDR_VIDEO_BROKEN`, tắt look khi HDR.
- High speed session không có trên HAL gauguin → ẩn slow-mo.

## Rollback

Các mode mới nằm sau flag; video gốc Aperture giữ nguyên.
