# Phase 2: Device profile cho mọi máy

## Bối cảnh

Leica port có `com.codex.modelmatch` với 261 profile (oppo 94, vivo 88, redmi 47, xiaomi 32) khớp theo `Build.MODEL`/`Build.DEVICE`/`Build.BRAND`, cộng `CameraCatalog.scan()` → `build()` → `ProfileRouter.apply()` → `MatchPolicy.assign()` → `FixedStops.render()`. Bài học đo được trên gauguin (`plans/261109-1409-leica-port-improve/plan.md`): catalog thô cho 5 chip sai (0.6, 0.6, 0.9, 0.9, 1x) vì không khử trùng theo cảm biến và không loại macro/depth; cần stop 2x là crop của main; khóa lớp + phản chiếu chậm gây ANR. Phase này làm lại logic đó từ đầu theo đặc tả (không chép mã, không lấy file `device-profiles.json` của port).

## Yêu cầu

### Schema (`profiles/schema/device-profile.schema.json`, JSON Schema 2020-12, `schemaVersion: 1`)

- `id` (`<brand>/<codename>`), `match`: `brand`, `device[]`, `model[]`, `fingerprintPrefix[]` (tùy chọn), `minSdk`/`maxSdk`.
- `cameras[]`: `id`, `facing`, `role` (`main|ultra|tele|macro|depth|mono|front|front-ultra`), `physicalIds[]` cho logical, `focalMm`, `equivFocalMm`, `sensorMm`, `hidden` (id chỉ có qua `getCameraIdListNoLazy` hay vendor), `preferredSizes` (photo/video/raw), `maxFps`.
- `zoomStops[]`: `ratio`, `cameraId`, `mode` (`physical|crop|logical`), `label`.
- `quirks[]`: danh sách khóa cố định (ví dụ `ULTRAWIDE_DUP_ID`, `NO_ZSL`, `JPEG_ORIENTATION_WRONG`, `HDR_VIDEO_BROKEN`, `RAW_BLACK_LEVEL_WRONG`), mỗi khóa có tác dụng định nghĩa trong code.
- `vendorTags{}`: tên tag → mục đích (chỉ đọc, phase 8 dùng).
- `knownBugs[]` (text + link issue), `source` (`auto|community|verified`), `testedBuilds[]`.

### Tự sinh khi mở lần đầu

- `CatalogScanner`: duyệt `getCameraIdList()` (và id ẩn thử từ 0..15 bằng `getCameraCharacteristics` có bắt lỗi), lấy `LENS_FACING`, `LENS_INFO_AVAILABLE_FOCAL_LENGTHS`, `SENSOR_INFO_PHYSICAL_SIZE`, `PIXEL_ARRAY_SIZE`, capabilities, `getPhysicalCameraIds()`.
- Khử trùng theo (focal, sensor size, pixel array); loại camera ≤ 3 MP hoặc thiếu `BACKWARD_COMPATIBLE` khỏi vai trò chính, gán `macro`/`depth` theo focus distance.
- Tỉ lệ zoom = equivFocal / equivFocal(main), làm tròn bước 0.1; thêm stop crop 2x trên main khi không có tele.
- Chạy trên `Dispatchers.Default`, không khóa lớp; cache kết quả theo `Build.FINGERPRINT` trong `noBackupFilesDir`.

### Ưu tiên khớp

`verified` > `community` > `auto`. Người dùng ghi đè thủ công trong Settings ("Device profile").

### Cơ sở dữ liệu cộng đồng

- Repo `profiles/data/<brand>/<codename>.json`, đóng gói snapshot vào APK (`assets/profiles.bundle.json`, sinh trong build), không tải mạng tự động.
- Luồng gửi: Settings → "Export device profile" → JSON (không kèm số serial, IMEI, vị trí) → chia sẻ hoặc mở URL GitHub issue form có sẵn nội dung; issue form + bot chuyển thành PR.
- CI validator (`tools/profile-validator`, Kotlin/JVM hoặc Python): kiểm schema, id trùng, tỉ lệ zoom đơn điệu, role hợp lệ, quirk thuộc danh sách, không trường nhận dạng cá nhân.
- Seed: `xiaomi/gauguin.json` (camera 0 IMX682 main 5.43mm, 3/6 ultra 1.65mm trùng id, 2/4 macro/depth 1.93mm, 5 logical [0,4], 1/7 front; stops 0.6→id 3, 1→id 0, 2→id 0 crop; quirk `ULTRAWIDE_DUP_ID`).

## File / module

- `profiles/` (sở hữu riêng phase này): `CatalogScanner.kt`, `ProfileResolver.kt`, `LensPlan.kt`, `ZoomStops.kt`, `Quirks.kt`, `ProfileExporter.kt`, `schema/`, `data/`
- `:app`: `ui/views/LensSelectorLayout.kt` (đọc `LensPlan`), `SettingsActivity.kt` (mục profile)
- `.github/ISSUE_TEMPLATE/device-profile.yml`, `.github/workflows/profiles.yml`

## Các bước

1. Viết schema + validator + seed gauguin, CI chạy validator.
2. `CatalogScanner` + unit test với characteristics giả lập (fixture JSON dump từ `dumpsys media.camera` của gauguin).
3. `ProfileResolver` + `LensPlan`, nối vào `CameraViewModel` thay cho lens list hiện có.
4. Quirks: cài đặt tác dụng của từng khóa trong `:capture`.
5. Export + issue form.
6. Nhập dần profile công khai: chỉ dữ liệu thực tế (tiêu cự, id) lấy từ dump do cộng đồng gửi; không chép file của port.

## Kiểm chứng

- Unit test: fixture gauguin → stops chính xác 0.6/1/2 với id 3/0/0.
- Trên gauguin: không ANR khi đổi ống lần đầu (đo 20 lần, StrictMode bật).
- Profile export từ gauguin qua validator xanh và tái tạo được `LensPlan` giống hệt.
- Máy không có profile: chạy auto, ít nhất có 1x và các ống vật lý được khử trùng.

## Rủi ro

- Id ẩn chỉ mở được bằng API ẩn → bỏ qua, ghi quirk. 
- Dữ liệu cộng đồng sai → `source: community` không ghi đè `verified`; người dùng chọn lại được.

## Rollback

Feature flag `profiles.enabled=false` trả về lens selector của Aperture.
