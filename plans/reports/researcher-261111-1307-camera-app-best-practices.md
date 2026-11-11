# Báo cáo: best practice app camera Android, thư viện tham khảo, khoảng trống tính năng

Ngày: 2026-11-11. Phạm vi: Open Camera (`dev.opencamera.app`, Apache-2.0, fork Aperture). Kế hoạch editor hậu kì đi kèm: `plans/261109-2101-open-camera-app/phase-12-photo-editor.md`.

## Kết luận chính

1. Bật ZSL của CameraX (`CAPTURE_MODE_ZERO_SHUTTER_LAG`) có kiểm tra `isZslSupported`, và giữ một tổ hợp use case tối thiểu (Preview + ImageCapture, thêm ImageAnalysis/VideoCapture chỉ khi chế độ cần). Đây là nguyên nhân crash phase 4 trên iQOO và cũng là đòn bẩy lớn nhất cho shutter lag.
2. Ghi Ultra HDR (gain map JPEG, kèm ISO 21496-1) từ pipeline HDR sẵn có: chi phí thấp, giá trị cao, là chuẩn Android 14+.
3. Editor hậu kì dùng chung shader LUT phase 3, stack JSON riêng của app cộng XMP nhúng trong ảnh xuất; không cố tương thích `crs:` của Adobe.
4. Crash reporting không cần Google: ACRA (Apache-2.0) gửi qua email/chia sẻ, opt-in, tắt mặc định; mạng tắt mặc định.
5. Bẫy giấy phép phổ biến: libheif (LGPL-3), Exiv2 (GPL-2), LibRaw (LGPL/CDDL), mọi mã của Open Camera (Harman), Fossify, darktable, RawTherapee (GPL). Dùng `HeifWriter`, `androidx.exifinterface`, parser DNG tự viết.

## 1. Checklist best practice

| Hạng mục | Thực hành | Nguồn |
|---|---|---|
| Use case binding | Bind một lần với tập use case tối thiểu cho mỗi chế độ; đổi chế độ bằng `unbindAll` + bind lại trong `try/catch`; kiểm tổ hợp bằng `CameraInfo.isUseCaseCombinationSupported` (CameraX 1.4+) hoặc `SessionConfig`/feature groups (1.5) trước khi bind; lùi bỏ ImageAnalysis rồi hạ độ phân giải | https://developer.android.com/media/camera/camerax/architecture , https://developer.android.com/media/camera/camerax/feature-groups |
| Stream combinations | Tuân bảng guaranteed stream combinations theo `INFO_SUPPORTED_HARDWARE_LEVEL`; Android 15+ dùng `CameraDevice.isSessionConfigurationSupported`/`CameraDeviceSetup` để hỏi trước khi mở | https://developer.android.com/reference/android/hardware/camera2/CameraDevice#regular-capture , https://developer.android.com/reference/android/hardware/camera2/CameraDevice.CameraDeviceSetup |
| Độ trễ đổi session | Tránh đổi session khi đổi ống trong cùng logical camera: dùng zoom ratio (`CONTROL_ZOOM_RATIO`) để HAL tự chuyển physical camera; dùng `Preview` + `VideoCapture` cùng lúc để photo/video không phải bind lại | https://developer.android.com/media/camera/camera2/multi-camera |
| ZSL / shutter lag | `CAPTURE_MODE_ZERO_SHUTTER_LAG` (CameraX 1.2+), tự tắt khi flash/extensions; với Camera2 dùng ring buffer `PRIVATE`/YUV + `reprocess`; đo shutter lag bằng CameraX `CameraXBasic`/trace | https://developer.android.com/media/camera/camerax/take-photo/options , https://android-developers.googleblog.com/2022/09/camerax-1-2-beta.html |
| Preview/capture parity | Look/LUT áp trên preview qua `CameraEffect` (CameraX `media3-effect` hoặc `OverlayEffect`) cùng shader với capture; khung hình cùng tỉ lệ (`ViewPort` + `UseCaseGroup`) | https://developer.android.com/media/camera/camerax/camera-effects (CameraX effects), https://developer.android.com/reference/androidx/camera/core/ViewPort |
| Thermal | Lắng nghe `PowerManager.addThermalStatusListener` và `getThermalHeadroom`; ≥ `THERMAL_STATUS_SEVERE` thì giảm fps preview, tắt đa khung/ML, chặn 4K60 | https://developer.android.com/games/optimize/adpf/thermal |
| Pin | Đóng camera ở `onStop` (lifecycle CameraX lo), không chạy ImageAnalysis khi không cần, `STRATEGY_KEEP_ONLY_LATEST`, ML ở độ phân giải thấp | https://developer.android.com/media/camera/camerax/analyze |
| Bộ nhớ 50–200 MP | Không decode full-res vào `Bitmap` ARGB_8888 (200 MP = 800 MB); xử lý YUV/HardwareBuffer trong native theo tile, `BitmapRegionDecoder` cho thumbnail/editor, `largeHeap` không phải giải pháp; giới hạn số ảnh trong hàng đợi theo `ActivityManager.getMemoryInfo` | https://developer.android.com/topic/performance/graphics/load-bitmap |
| Xử lý nền | WorkManager expedited/foreground worker với `FOREGROUND_SERVICE_TYPE_DATA_SYNC`/`SPECIAL_USE` khai báo đúng (Android 14+ bắt buộc type); lưu ảnh trung gian xuống đĩa trước khi xử lý để không mất ảnh khi bị kill | https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running , https://developer.android.com/about/versions/14/changes/fgs-types-required |
| MediaStore / scoped storage | Ghi bằng `IS_PENDING=1` rồi 0, `RELATIVE_PATH` `DCIM/OpenCamera`; không xin `WRITE_EXTERNAL_STORAGE` từ API 29; sửa ảnh của app khác qua `createWriteRequest`; Android 14 partial photo access (`READ_MEDIA_VISUAL_USER_SELECTED`) cho editor | https://developer.android.com/training/data-storage/shared/media , https://developer.android.com/about/versions/14/changes/partial-photo-video-access |
| EXIF/XMP | `androidx.exifinterface` (Apache) cho EXIF, ghi orientation thật vào pixel hoặc tag (không cả hai); XMP tự ghi APP1; `MakerNote` không cần | https://developer.android.com/reference/androidx/exifinterface/media/ExifInterface |
| HEIF / Ultra HDR / AVIF | HEIF qua `androidx.heifwriter` khi có encoder HEVC; Ultra HDR: `ImageCapture.OUTPUT_FORMAT_JPEG_ULTRA_HDR` (CameraX 1.4, API 34+) hoặc tự tạo bằng `Bitmap.setGainmap`; ghi cả metadata ISO 21496-1; AVIF encode qua `Bitmap.CompressFormat` chỉ ở API mới, kiểm lúc chạy | https://developer.android.com/media/platform/hdr-image-format , https://developer.android.com/media/camera/camerax/take-photo/options , https://github.com/google/libultrahdr |
| Orientation | Dùng `OrientationEventListener` cập nhật `targetRotation` thay vì khóa activity; UI xoay icon, không xoay layout; lưu ý màn gập/đa cửa sổ | https://developer.android.com/media/camera/camerax/orientation-rotation |
| Accessibility | Nút chụp có label, phím âm lượng chụp, thông báo đếm ngược bằng âm thanh, TalkBack đọc chế độ/zoom; kiểm bằng Accessibility Scanner và Espresso `AccessibilityChecks` | https://developer.android.com/guide/topics/ui/accessibility/testing |
| i18n | `strings.xml` + plural, per-app language (`LocaleConfig`, API 33), RTL mirror trừ viewfinder; dịch qua Weblate (F-Droid quen dùng) | https://developer.android.com/guide/topics/resources/app-languages |
| Testing | Unit (Robolectric + CameraX `FakeCamera`/`camera-testing`), golden image cho pipeline trên host (C++ chạy trên x86), instrumented trên emulator camera ảo; device farm: Firebase Test Lab (phải trả, dùng cho CI tùy chọn) hoặc máy thật cộng đồng; CameraX có "Camera Compatibility Test" cho từng quirk | https://developer.android.com/media/camera/camerax/test , https://developer.android.com/training/testing/fundamentals |
| Crash report không Google | ACRA (Apache-2.0) với `MailSender`/dialog chia sẻ, opt-in; lưu tombstone native qua `ApplicationExitInfo` (API 30) để tự đọc ở lần mở sau | https://github.com/ACRA/acra , https://developer.android.com/reference/android/app/ApplicationExitInfo |
| Reproducible build F-Droid | Gradle wrapper và AGP cố định, `dependencyVerification`/`verification-metadata.xml`, tắt `vcsInfo`, NDK pin phiên bản, không ghi timestamp/build path vào `.so` (`-ffile-prefix-map`), baseline profile ổn định (AGP lỗi không deterministic `baseline.prof` cần `-Pandroid.injected...` hoặc tắt), ký riêng rồi F-Droid so sánh | https://f-droid.org/docs/Reproducible_Builds/ , https://f-droid.org/2023/09/03/reproducible-builds-signing-keys-and-binary-repos.html |
| Quyền riêng tư | Không quyền `INTERNET` trong bản chính, tải profile/model qua tùy chọn rõ ràng; gắn vị trí opt-in, xin `ACCESS_COARSE_LOCATION` khi bật, xóa GPS khi chia sẻ; `ACCESS_MEDIA_LOCATION` chỉ khi editor cần đọc vị trí ảnh | https://developer.android.com/training/data-storage/shared/media#location-info-photos |

Bài viết thực tế đáng đọc: Halide "iPhone camera deep dive" (lux.camera) về ProRAW và xử lý; GrapheneOS Camera README (CameraX, không quyền mạng, xóa EXIF mặc định); Google Research blog về HDR+ with Bracketing và Night Sight (thuật toán công khai); bài CameraX tại Android Dev Summit/I/O ("What's new in CameraX", 2023–2025) về ZSL, Ultra HDR, feature groups.

## 2. Boilerplate và thư viện

| Dự án | Giấy phép | Kết luận |
|---|---|---|
| android/camera-samples (CameraXBasic, Camera2Basic, CameraXAdvanced) | Apache-2.0 | Dùng (chép mã được, giữ NOTICE) |
| GrapheneOS Camera | MIT (đã kiểm repo) | Dùng/tham khảo: QR, xóa EXIF, xử lý quyền tốt; MIT tương thích Apache |
| LineageOS Aperture | Apache-2.0 | Gốc fork |
| LineageOS Snap (cũ, Camera2/CodeAurora) | Apache-2.0 (phần lớn), một số file BSD | Chỉ tham khảo, đã ngừng |
| Open Camera (Mark Harman, `net.sourceforge.opencamera`) | GPL-3.0 | Tránh mã; chỉ xem danh sách tính năng |
| Fossify/Simple Gallery, Fossify Camera | GPL-3.0 | Tránh mã; tham khảo UX editor |
| darktable, RawTherapee | GPL-3.0 | Chỉ đọc paper được trích dẫn trong mã, không đọc mã khi viết |
| Media3 effect / Transformer (GL effects) | Apache-2.0 | Dùng cho preview effect và video; shader mẫu tham khảo |
| CameraX `camera-effects` | Apache-2.0 | Dùng |
| GPUImage for Android (cats-oss) | Apache-2.0 | Tham khảo shader; gần như không bảo trì, không thêm dependency |
| CanHub Android-Image-Cropper | Apache-2.0 | Dùng hoặc tham khảo cho crop UI |
| uCrop (Yalantis) | Apache-2.0 | Tham khảo; bảo trì chậm |
| PhotoEditor (burhanrashid52) | MIT | Dùng cho markup (phase 11) |
| Compressor (zetbaitsu) | Apache-2.0 (đã kiểm repo) | Không cần: `Bitmap.compress` + scale làm được; ít bảo trì |
| OpenColorIO | BSD-3-Clause | Tham khảo/dùng offline để tạo LUT; nặng cho runtime di động |
| Little CMS 2 | MIT | Dùng nếu cần chuyển ICC tùy ý (ngoài sRGB/P3 có sẵn trong `ColorSpace`) |
| LibRaw | LGPL-2.1 hoặc CDDL-1.0 | Tránh trong APK chính; nếu cần định dạng RAW hãng thì `.so` động, cung cấp nguồn và cho phép thay thế (LGPL), hoặc CDDL với điều khoản file-level |
| Adobe DNG SDK | Adobe DNG SDK License (dễ dãi, giữ thông báo) | Tham khảo đúng đắn opcode/màu; dùng mã được khi giữ thông báo, nhưng nặng |
| libultrahdr | Apache-2.0 | Dùng khi cần encode Ultra HDR dưới API 34 |
| libavif / libaom / dav1d | BSD-2 / BSD-2 (+AOM patent license) / BSD-2 | Dùng nếu cần AVIF trên API thấp |
| libheif | LGPL-3.0 | Tránh; dùng `HeifWriter` của hệ thống |
| Exiv2 | GPL-2.0+ | Tránh; dùng `androidx.exifinterface` + XMP tự viết |
| Adobe XMP Toolkit SDK | BSD-3-Clause | Có thể dùng nhưng to; writer XMP tối giản tự viết là đủ |
| ACRA | Apache-2.0 | Dùng cho crash report opt-in |
| Halide | MIT | Đang dùng |
| OpenCV | Apache-2.0 (4.5+) | Đang dùng |

## 3. Khoảng trống tính năng (so với Pixel Camera, iPhone Camera, Halide, Kino, Xiaomi/Leica, vivo/ZEISS, Samsung Expert RAW, Lightroom Mobile, Snapseed, VSCO)

Đã có trong plan và không nhắc lại: looks/LUT, HDR/Night/Astro/SR, Pro/RAW, bokeh, scene detect, composition, video modes, creative modes, retouch, editor phase 12.

| # | Tính năng | Có ở | Giá trị | Công sức | Ghi chú |
|---|---|---|---|---|---|
| 1 | Ultra HDR JPEG từ pipeline HDR | Pixel, Samsung, iPhone (Adaptive HDR) | Cao | Thấp | CameraX/`Bitmap.setGainmap`, API 34+ |
| 2 | ZSL mặc định + đo shutter lag | Mọi flagship | Cao | Thấp | Có đường lùi |
| 3 | Histogram, zebra, focus peaking, false color | Halide, Kino, Expert RAW, Xiaomi Pro | Cao | Thấp-TB | Shader trên preview |
| 4 | Best take / chọn khung từ buffer trước bấm | Pixel (Top Shot, Best Take), Samsung | Cao | TB | Dùng ring buffer ZSL |
| 5 | DNG đã merge đa khung (linear DNG) | Expert RAW, iPhone ProRAW, Halide | Cao | TB | Dùng merge phase 4 |
| 6 | Video Log + LUT xem trước | Kino, iPhone Log, vivo, Xiaomi | TB-Cao | TB | Cần đường cong log tự định nghĩa |
| 7 | Photographic Styles điều chỉnh được lúc chụp | iPhone, Pixel (Real Tone/Styles) | TB-Cao | Thấp | Tham số look phase 3 + preset phase 12 |
| 8 | Tài liệu nhiều trang, PDF, OCR offline | Pixel, iPhone, Samsung | TB | TB | OCR: Tesseract (Apache-2.0) hoặc model LiteRT |
| 9 | Hẹn giờ thông minh (mắt mở/cười, cử chỉ tay) | Pixel, Samsung, Xiaomi | TB | Thấp | Face landmarker có sẵn |
| 10 | Cảnh báo ảnh mờ/mắt nhắm sau chụp | Pixel, Lightroom | TB | Thấp | Laplacian variance + landmark mắt |
| 11 | Process Zero / chế độ ít xử lý | Halide | TB | Thấp | Tắt NR/sharpen, tone đơn giản |
| 12 | Macro tự chuyển ống | iPhone, Xiaomi | TB | Thấp | Theo `minFocusDistance` trong profile |
| 13 | Ghép ảnh nhóm (Add Me) | Pixel | TB | Cao | Segmentation + căn chỉnh |
| 14 | Chụp chân dung với điều chỉnh tiêu cự sau chụp | iPhone, vivo | TB | TB | Lưu depth map vào XMP GDepth |
| 15 | Spatial/3D photo (Depth map chuẩn Google) | Pixel, iPhone | Thấp-TB | TB | GDepth/GImage XMP |
| 16 | Đồng bộ preset giữa máy (export/import file) | Lightroom, VSCO | Thấp-TB | Thấp | Đã có trong phase 12 dạng file |
| 17 | Remote shutter qua Wear OS/Bluetooth HID | Pixel, Samsung | Thấp-TB | TB | Phím âm lượng Bluetooth trước |
| 18 | Video stabilization chọn mức, horizon lock | iPhone, Samsung, Xiaomi | TB | Cao | `CONTROL_VIDEO_STABILIZATION_MODE_PREVIEW_STABILIZATION` khi có |

Top 10 đã ghi vào mục "Ý tưởng bổ sung" của `plan.md`.

## Hạn chế của nghiên cứu

- Không đo trên máy; mọi mục tiêu thời gian trong phase 12 là ước lượng, cần benchmark bước 2.
- Giấy phép GrapheneOS Camera, Compressor và đặc tả Ultra HDR được kiểm trực tiếp lần này; các giấy phép còn lại theo hiểu biết hiện có về repo, cần kiểm lại tệp LICENSE khi thực sự thêm dependency.
- Không đánh giá chi tiết đường cong log video và bảng stream combination của gauguin.

## Câu hỏi chưa giải quyết

1. Có chấp nhận quyền `INTERNET` (cho tải model/profile) trong bản chính, hay tách flavor không mạng?
2. Editor có cần đọc RAW hãng (CR3/NEF/ARW) không? Nếu có thì phải quyết LibRaw theo LGPL hay CDDL.
3. Có muốn xuất XMP tương thích một phần với Lightroom không (rủi ro kỳ vọng sai)?
