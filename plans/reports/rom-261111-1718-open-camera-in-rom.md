# Open Camera trong ROM gauguin (LineageOS 24)

Ngày: 2026-11-11. Trạng thái: đã cấu hình, chưa build/flash.

## Cách làm: (b) prebuilt `android_app_import`

Không chọn (a) build từ nguồn vì:
- `app/Android.bp` cần `OpenCamera_org.opencv_opencv`, mà AAR OpenCV (~118 MB) bị git-ignore, chỉ `app:generateBp` (Gradle) mới tạo lại được. Clone qua repo sync sẽ thiếu file, Soong lỗi.
- Ngoài ra còn 6 thư viện JNI, plugin Compose compiler và hàng chục AAR với phiên bản riêng: rủi ro cao trên cây LOS 24, mà pool chỉ cho build có giới hạn.

APK lấy từ GitHub release qua `scripts/fetch-open-camera.sh`. APK bị git-ignore, không commit vào repo public.

## Các file

| File | Vai trò |
|---|---|
| `lite/open-camera/Android.bp` | `OpenCamera` (presigned, không privileged, partition product, tắt dex_preopt) + sysconfig + RRO |
| `lite/open-camera/preinstalled-packages-opencamera.xml` | cài cho user FULL/PROFILE (cả `dev.opencamera.app` và `.dev`) |
| `lite/open-camera/overlay/` | RRO SystemUI: `config_cameraGesturePackage = dev.opencamera.app` (nhấn đúp nút nguồn mở thẳng Open Camera thay vì hiện bảng chọn) |
| `lite/features.mk` | thêm `LITE_KEEP_OPEN_CAMERA ?= true`; `LITE_KEEP_CAMERA_APERTURE ?= false` |
| `lite/lite.mk` | `PRODUCT_PACKAGES += OpenCamera` khi toggle bật |
| `scripts/fetch-open-camera.sh` | tải APK từ release (`[tag] [asset]`, mặc định: release mới nhất có .apk), kiểm tra zip |
| `.gitignore` | `lite/open-camera/*.apk` |

Quyền: không cấp sẵn. Camera, micro, vị trí xin lúc chạy như app thường (không cần privapp vì không privileged).

## Kiểm tra đã làm

- Đồng bộ file sang VM (`/srv/lineage/vendor/gauguin-lite`), tải APK `v0.1.0-alpha3` (285 MB).
- `get_build_var PRODUCT_PACKAGES` (lunch `lineage_gauguin-cp2a-eng`) có `OpenCamera` và `lite_remove_CAMERA_APERTURE`. Pool lúc kiểm tra: 90.07%.
- Chưa chạy Soong analysis (`m nothing`) và chưa build.

## Build / flash

```bash
cd /srv/lineage/vendor/gauguin-lite && bash scripts/fetch-open-camera.sh [tag]
cd /srv/lineage && source build/envsetup.sh && lunch lineage_gauguin-cp2a-eng
m OpenCamera OpenCameraGestureOverlay   # build riêng module, kiểm pool trước
# hoặc build ROM đầy đủ (~/eng-build-preopt.sh) khi pool cho phép, rồi flash như thường lệ
```

Thử nhanh trên máy đã flash mà không cần build lại ROM: `adb install` APK; RRO cần build ROM.

## Việc còn mở

1. Release chỉ có APK debug (`dev.opencamera.app.dev`, ký debug). Cần một release APK ký bằng key release (package `dev.opencamera.app`) để RRO cử chỉ nút nguồn khớp; với bản `.dev` SystemUI tự rơi về cách chọn intent bình thường (không crash).
2. Khi phát hành APK release, chạy `fetch-open-camera.sh <tag> <tên asset>`.
3. APK debug 285 MB làm phân vùng product to ra; kiểm tra dung lượng phân vùng khi build.
4. `LITE_CAM_MIUI=true` vẫn cài MIUI Camera: app bên thứ ba gọi `IMAGE_CAPTURE` có thể hiện bảng chọn lần đầu (người dùng chọn "Luôn luôn").
5. Giống MiuiCamera, `Android.bp` cần có APK ngay cả khi toggle tắt; luôn chạy script fetch trước khi build.
6. Chưa chạy `m nothing`; lỗi Soong (nếu có) chỉ lộ ra khi build.
