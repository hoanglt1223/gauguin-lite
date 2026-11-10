# Leica port cho gauguin: dựng lại, tiếng Anh, profile máy

Ngày 2026-11-09. Kế hoạch: `plans/261109-1409-leica-port-improve/plan.md`.

## Kết quả

- APK: `miui-ports/leica/out/leica-gauguin-en.apk` (532 MB, ký v1+v2+v3 bằng khóa thử trong `miui-ports/leica/keys/`, đã bỏ qua git).
- Dựng lại: `powershell -ExecutionPolicy Bypass -File miui-ports/leica/scripts/build-leica-gauguin.ps1` (khoảng 90 giây). Cần java 17, python 3, Android build-tools (máy này có 35.0.0), `tools/bin/{smali,baksmali}.jar` 2.5.2.
- APK gốc `miui-ports/leica/leica-installed.apk` không bị sửa. Quay lại: `adb uninstall com.kobbin.leica.wmrebuild` rồi cài APK gốc (khác khóa ký nên phải gỡ trước).

## Thay đổi

| Phần | Cách làm | File |
|---|---|---|
| Profile gauguin | Thêm profile `xiaomi/xiaomi-mi-10t-lite-gauguin` (codes gauguin, M2007J17G/C/I; ultra + main + 2x; `auxiliary_lenses` macro/depth để loại camera ≤3MP) | `scripts/gauguin-profile.json` |
| Tự nhận máy | `Profiles.detected()` có sẵn nhưng không ai gọi. Vá `Profiles.init()`: khi prefs `selected` rỗng thì chọn `detected()`. Hệ quả: bấm "Auto detect" cũng ra profile gauguin | `scripts/patch_port.py` |
| Chip 2x | `ProfileRouter.logicalPaths()` chỉ cho stop không có ống vật lý qua camera logic hoặc camera có zoom < 1x. Vá để camera main cũng mang được stop đó, nên 2x là crop của id 0 | `scripts/patch_port.py` |
| Tính năng cần HTP | Chỉ màn "Legendary Moment · OEM model experiment" (`LegendExperimentActivity`, QNN/DSP) là không có đường CPU; đã ẩn nút vào. Các style M3/M9/M9+/M10R/M4/M13/LP9/LM9/M9D đều có đường lùi CPU/ORT/LUT nên giữ lại | `scripts/patch_port.py` |
| Chuỗi trong mã của người port | 682 chuỗi const-string tiếng Trung trong classes11..31 (848 chỗ), dịch theo bảng | `scripts/translations-en.json`, `scripts/smali_strings.py` |
| Hộp thoại tác giả | `assets/cameralook/author-notice.bin` là dex mã hóa AES-GCM (khóa nằm trong `com.codex.cameralook.u`). Giải mã, dịch 3 chuỗi, mã hóa lại bằng cùng khóa/IV. Giữ tên tác giả | `scripts/AuthorNotice.java` |
| resources.arsc | Viết lại string pool: 150 chuỗi tiếng Trung mà cấu hình mặc định/en/vi dùng (tên app, chế độ chân máy, tên filter, ngày lễ, âm lịch, thông báo lỗi). Locale zh/ug/bo giữ nguyên | `scripts/arsc_strings.py`, `scripts/arsc-translations-en.json` |
| AndroidManifest | Nhãn thô (không phải resource) của app và activity: "Leica Moment", "Leica Styles"... | `scripts/arsc_strings.py manifest` |
| Danh mục máy | Tên/alias/ghi chú trong `device-profiles.json` (小米 → Xiaomi, 天玑版 → Dimensity Edition...) | `scripts/patch_port.py` |

`device-profiles.json` không nằm trong danh sách băm của `ModelAssetCheck` (chỉ kiểm `leica-v4/`), nên sửa được mà không lệch checksum.

## Bằng chứng kiểm tra trên máy

- Cài: gỡ bản gốc, `adb install` bản mới, `pm grant` camera/mic/vị trí/thông báo/media. Ảnh chụp màn hình ở `miui-ports/leica/work/shots/`.
- Nút nổi: "Device profile / Mi 10T Lite" ngay lần mở đầu; hộp thoại "Camera model profile" ghi "Current: Mi 10T Lite 5G / Redmi Note 9 Pro 5G (gauguin)".
- Chip: trước 0.6, 0.6, 0.9, 0.9, 1x; sau 0.6 / 1x / 2. Bấm 0.6 thì `dumpsys media.camera` báo id 3 đang mở; bấm 2 thì id 0.
- Ảnh trong `/sdcard/DCIM/Camera`: 1x `IMG_20261109_153458.jpg` 3472x4624; 0.6x `IMG_20261109_153752.jpg` 2448x3264 (ultrawide 8MP); 2x `IMG_20261109_153835.jpg` 3472x4624; thêm `IMG_20261109_154252.jpg` sau bản cuối.
- Giao diện: nút "Full M9 Distilled", chế độ "Leica Styles", trang tone "Use it", hộp thoại tác giả, nhãn app "Leica Moment" (`aapt dump badging`). Chuỗi MIUI gốc hiện tiếng Việt như cũ.
- Thông báo: kênh `m9-photo-processing` tên "Photo rendering progress", nội dung "Perfect M9 · background rendering / Rendering done, saved to gallery · pending 0 photo(s)".
- Lỗi: không có `FATAL EXCEPTION` của app. `tombstone_37` (15:34) là `mediaserver` SIGSEGV, cũng xảy ra với bản gốc lúc 15:27, không thuộc app này.

## Vấn đề còn lại

- **ANR khi đổi ống kính lần đầu.** Lần bấm 0.6 đầu tiên lúc app vừa chụp xong bị ANR: luồng main chờ khóa lớp `RearLens`, khóa này do luồng `CameraSetup` giữ khi đang chạy phản chiếu (`Method.getReturnType`/`TimSort`). Máy đang chạy ART bản debug (`libartd.so`), nên phản chiếu rất chậm. Mở lại app rồi đổi ống thì chạy bình thường (0.6x và 2x đều chụp được). Đây là mã gốc của người port; bản dựng không đụng tới phần này.
- Phím `KEYCODE_CAMERA` (27) không phải lúc nào cũng chụp; bấm nút chụp trên màn hình thì chụp ổn định.
- Chưa đo thời gian xử lý M9 / Full M9 trên CPU (Phase 2) và chưa lọc logcat API A17 khi chụp Pro hay quay video (Phase 3).
- Chip giữa hiện "1" khi không được chọn (chỉ hiện "1x" khi đang chọn). MIUI cũng hiện như vậy.
- Lúc test app có chiếm camera trong khi MIUI Camera (phiên khác) đang ở foreground. Không kill camera provider.

## Tiếng Trung còn lại (có chủ đích)

- Tên tác giả "我的天啊ys" trong hộp thoại "About this app" và trang Pro: là tên người, giữ nguyên.
- `resources.arsc`: chuỗi của locale zh-CN/zh-TW/ug/bo (chỉ hiện khi máy dùng các ngôn ngữ đó).
- Mã MIUI gốc (classes.dex đến classes10.dex): chuỗi log/debug tiếng Trung nằm trong mã gốc, không quét hết; khi dùng không thấy chuỗi nào lộ ra giao diện.
- Assets không hiện ra giao diện tiếng Việt/Anh: mục `zh` trong `watermarks/**/i18n.json` (mỗi file đều có mục `en`), tên layer Lottie trong `guide_optical_zoom_anim.json`, chú thích trong `smart_composition_config.json`, mô tả AppFunctions trong `app_functions_v2.xml`, tên filter đám mây trong `cloudfilter/*.json`, tên mẫu "模板N" trong `cg/info.json`, "怀旧" trong `vp/info.json`, và các drawable dạng vector trong `obfu_res/` (chữ vẽ sẵn cho bản `_cn`/`_tc`).
