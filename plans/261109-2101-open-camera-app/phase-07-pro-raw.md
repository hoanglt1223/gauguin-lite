# Phase 7: Pro và RAW

## Bối cảnh

MIUI Pro mode và Leica Pro: ISO, tốc màn trập, WB Kelvin, focus tay, EV, histogram, focus peaking, zebra, RAW. Aperture đã có điều khiển noise reduction/edge/hot pixel/shading/distortion qua `ext/CaptureRequestOptionsBuilder.kt` (Camera2Interop). DNG dùng `android.hardware.camera2.DngCreator` (không cần LibRaw).

## Yêu cầu

- Điều khiển tay: ISO (`SENSOR_SENSITIVITY`), exposure time, WB (Kelvin → `COLOR_CORRECTION_GAINS` khi `MANUAL_POST_PROCESSING` có, lùi về preset AWB), focus distance (`LENS_FOCUS_DISTANCE`), EV, khóa AE/AF, chọn ống theo `LensPlan`.
- Hỗ trợ trợ giúp: histogram trực tiếp (từ khung analysis YUV), focus peaking + zebra (shader), đồng hồ đo sáng, leveler (có sẵn).
- RAW: DNG đơn, RAW+JPEG, burst RAW (dùng phase 4); ghi metadata đầy đủ; quirk `RAW_BLACK_LEVEL_WRONG` sửa khi ghi.
- Preset người dùng (lưu/đặt tên), bracketing EV.
- Định dạng ra: JPEG, HEIF (`HeifWriter`), Ultra HDR JPEG (API 34+, khi HAL hỗ trợ `JPEG_R`), DNG.
- Pro video: shutter/ISO cố định, log-like profile bằng LUT (flat curve tự làm).

## File / module

- `capture/.../manual/*` (`ManualControls.kt`, `RawCaptureController.kt`)
- `app/.../ui/pro/*` (dial, histogram, peaking overlay)
- `pipeline/.../DngWriter.kt`

## Các bước

1. Đọc khả năng (`REQUEST_AVAILABLE_CAPABILITIES`) → bật/tắt từng điều khiển.
2. UI dial và overlay.
3. DNG + RAW+JPEG, kiểm mở được bằng RawTherapee/darktable.
4. HEIF/Ultra HDR, preset, bracketing.

## Kiểm chứng

- Gauguin: ISO/tốc đặt tay khớp EXIF; DNG mở đúng màu trong darktable; focus peaking ≥ 30 fps.
- Máy chỉ LIMITED: điều khiển không hỗ trợ bị ẩn.

## Rủi ro

- HAL bỏ qua giá trị tay ở một số ống → đọc lại `CaptureResult`, cảnh báo người dùng, ghi quirk.

## Rollback

Mode Pro ẩn bằng flag.
