# Phase 8: Cầu nối vendor extension

## Bối cảnh

Một số tính năng tốt nhất của OEM nằm trong HAL/thư viện độc quyền: night/HDR/bokeh/face retouch qua CameraX Extensions (`camera-extensions`, Aperture đã dùng trong `ext/ExtensionsManager.kt`) hoặc Camera2 Extensions (`CameraExtensionCharacteristics`, API 31+); vendor tag của Qualcomm/MediaTek/Xiaomi (ví dụ `org.codeaurora.qcamera3.*`, `com.qti.*`, `xiaomi.*`). App chỉ *gọi* những gì máy công khai qua API, không đóng gói thư viện vendor. Trên LineageOS gauguin, OEM extension thường không có; MIUI-derived HAL có thể có vendor tag.

## Yêu cầu

- Lớp `VendorBridge` khám phá:
  - CameraX `ExtensionsManager.isExtensionAvailable` cho NIGHT, HDR, BOKEH, FACE_RETOUCH, AUTO.
  - Camera2 `CameraExtensionCharacteristics` (gồm `isPostviewAvailable`, strength).
  - Vendor tag: liệt kê `CameraCharacteristics.getKeys()`/`CaptureRequest` keys có tiền tố vendor, đối chiếu `vendorTags` trong profile (chỉ những tag cộng đồng đã ghi nhận tác dụng, ví dụ chọn HAL night, MFNR, ZSL size).
- Thứ tự ưu tiên cho mỗi tính năng: (1) pipeline mở của dự án nếu người dùng chọn "Open", (2) extension OEM nếu có, (3) pipeline mở. Mặc định có thể chỉnh theo profile.
- Tag vendor ghi vào request chỉ khi profile `verified` khai báo; mọi lỗi `IllegalArgumentException` → tắt tag đó cho phiên.
- Hiển thị nguồn xử lý trong EXIF/UI ("OEM Night" hay "Aperio Night") để minh bạch.
- Tài liệu cho cộng đồng cách tìm tag (`dumpsys media.camera`, `adb shell cmd media.camera`), không phân phối blob.

## File / module

- `vendor-bridge/` (sở hữu riêng): `VendorBridge.kt`, `ExtensionsProbe.kt`, `VendorTagRegistry.kt`
- `:profiles` schema: phần `vendorTags` (phase 2 đã dành chỗ)
- `docs/vendor-tags.md`

## Các bước

1. Probe extension + UI chọn nguồn.
2. Vendor tag registry đọc từ profile, ghi request có bảo vệ.
3. Thử trên một máy có OEM extension (Pixel/Samsung/Xiaomi stock) và trên gauguin (ghi nhận tag MIUI-derived nếu có).

## Kiểm chứng

- Máy có extension: ảnh NIGHT từ OEM chụp được, EXIF ghi đúng nguồn.
- Gauguin: probe không crash; tag không hợp lệ bị bỏ qua với log.
- Bản `foss` không chứa thư viện vendor (CI quét).

## Rủi ro

- Vendor tag gây treo HAL → chỉ tag `verified`, có nút tắt toàn bộ bridge.
- Điều khoản Play/F-Droid: gọi API công khai không vi phạm; không đóng gói gì.

## Rollback

Flag `vendorBridge.enabled=false`.
