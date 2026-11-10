# Leica port gauguin: sửa lỗi, test trên máy, thêm style LUT

Ngày 2026-11-09. Bản cuối: `miui-ports/leica/out/leica-gauguin-en-slim.apk` (421.7 MB, cùng khóa thử, cert SHA-256 `b08fa019…7f9b`), đã `adb install -r` (giữ dữ liệu) và chép sang `D:\Projects\camera-ports-los24\release-assets\leica-gauguin-en-slim.apk`. Dựng: `powershell -ExecutionPolicy Bypass -File miui-ports/leica/scripts/build-leica-gauguin.ps1 -Slim` (khoảng 140 giây). Máy: ART release, CheckJNI tắt.

Ảnh chụp màn hình và file test: `miui-ports/leica/test/` (file ảnh tải về ở `test/files/`).

## Sửa lỗi

| Lỗi | Nguyên nhân | Cách sửa | File |
|---|---|---|---|
| ANR khi bấm 0.6 ngay sau khi chụp (báo cáo trước, ART debug) | `RearLens.call()` quét `getClass().getMethods()` của Camera2Module mỗi lần gọi, trong lúc giữ khóa lớp `RearLens` (các hàm `bind`, `switchLens`... đều `synchronized`). Luồng main bấm chip phải chờ khóa đó | `MethodCache.find()` lưu `Method` theo lớp + tên + số tham số; thân `call()` thay bằng tra cache. Không đổi hành vi | `scripts/java/src/com/codex/rearlens/MethodCache.java`, `scripts/fixes_patch.py` |
| Mất nút "Leica Styles" sau khi Back/Home rồi mở lại (lặp lại 7/7 lần) | Nút do `EditorEntry.install()` gắn, mà hàm này chỉ được gọi từ `ModeSelectView.setItems()`; MIUI chỉ gọi `setItems()` khi khởi động nguội | Gọi thêm `EditorEntry.install(this)` trong constructor của `ModeSelectView` (classes3). `attach()` vốn chống trùng theo view | `scripts/fixes_patch.py`, `build-leica-gauguin.ps1` |
| App crash khi lướt bảng chọn tông màu (nút "Full M9 Distilled") tới mục "Perfect M9" | Có từ bản en: `LeicaV43Ui` tra `tên.toLowerCase() + "_intro"`, còn `FullM9Ui.galleryIntro` so `equals` phân biệt hoa thường; bản dịch để khóa là `"Perfect M9_intro"` → trả null → `getString(0)` → `Resources$NotFoundException` | Dịch khóa thành chữ thường: `perfect m9_intro`, `leica moment cloud_intro` | `scripts/translations-en.json` |

Về ANR: với ART release không tái hiện được trước khi sửa (5 lần mở nguội + 5 lần nóng, kịch bản chụp rồi bấm 0.6 sau 0–1.2 s, `/data/anr` trống). Bấm 0.6 trong lúc ảnh đang chụp bị MIUI bỏ qua (`ZoomToggle isn't interactive`, `snapshotInProgress`), không treo. Sau khi sửa: 5 lần nguội + 5 lần nóng + 5 lần trên bản cuối, lần nào cũng mở id 3, 0 ANR, không có `Long monitor contention` nào liên quan RearLens.

## Style LUT film (mục 3)

Có thể thêm: app có sẵn bộ đọc LUT `com.codex.model120.AlexaLut` (65³, float32 LE, ba mặt phẳng R/G/B, chỉ số `b*4225 + g*65 + r`, đọc từ `assets/donor120/<tên>` qua `ModelAssets`). Bản gốc không kèm file LUT nào dạng này. Danh sách style không đọc từ file mà ghép cứng trong `ModelUi` (chèn 3 model donor M9+/M10-R/M9 Distilled vào giữa danh sách cloud/tone), nên vá smali:

- `film_luts.py` tự sinh 8 LUT từ phép toán tông/màu đơn giản (đường cong S, lift/gain, bão hòa, split-tone, đen trắng có trọng số kênh), không dùng dữ liệu bên thứ ba: Warm Film, Portrait Film, Cool Chrome, Faded Matte, Teal & Orange, Vivid Slide, Mono Contrast, Mono Soft. Kèm ảnh mẫu 1536x1024 cho bảng chọn, làm từ ảnh test chụp trên máy (`scripts/film-sample.jpg`, đã bỏ EXIF/GPS). Thêm vào APK bằng `repack_apk.py --add=` (16 entry, khoảng 3.3 MB mỗi LUT trước nén).
- `FilmLut` (Java, biên dịch javac + d8 trong lúc dựng): style id 771–778, `process()` gọi `AlexaLut.process()`.
- `fixes_patch.py`: `ModelUi` (mảng tên/ảnh/giới thiệu nối thêm, các hằng 3/4/5 thành 11/12/13), `ModelPort.valid/process`, `CloudGalleryAdapter`, khoảng id hợp lệ của `EditorRenderer` (770 → 778).
- Giới hạn: khung xem trước dùng tông M9 (`PreviewTone` 2) khi chọn style film; LUT chỉ áp lên ảnh đã lưu.

Bằng chứng: `test/60-film-sheet.jpg` (8 ảnh mẫu), `test/57-editor-exports.jpg`, `test/58-camera-teal-orange.jpg`.

## Bảng test

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| ANR đổi 0.6 sau khi chụp | Đạt (15/15 lần, 0 ANR) | logcat, `dumpsys media.camera` id 3; `/data/anr` trống |
| Ảnh 0.6x sau sửa | Đạt | `IMG_20261109_220135.jpg` 2664x3866 (ultrawide 2448x3264 + khung watermark), 4.7 MB |
| Pro: ISO / tốc độ / WB tay | Đạt. Chỉnh 1/1000–1/8000, ISO 160, 2900K, preview đổi theo; chụp ra file | `test/12-pro-manual.png`, `test/13-pro-slow.png`; `IMG_20261109_211302.jpg` 3472x4624, 8.7 MB, EXIF ISO 50, 2.0 s, WB manual (EXIF lấy giá trị của khung chụp cuối, logcat có `applyExposureTime` theo giá trị đã chỉnh) |
| Pro: RAW/DNG | Không có tùy chọn. Định dạng ảnh chỉ JPG/HEIF; cài đặt Pro chỉ có Biểu đồ; `DCIM/Camera/Raw` trống | `test/21-format.png`, `test/22-pro-settings.png` |
| Camera trước | Không có nút đổi camera trong cả 3 chế độ; vuốt trên preview mở menu chứ không đổi camera. Profile của người port chỉ định tuyến camera sau | `test/40-swipe.png`, UI dump |
| Đêm, video, chân dung | Không có chế độ: thanh chế độ chỉ có Chuyên nghiệp, Leica Essential, Leica Styles | UI dump `test/20-settings.xml` (tab Video trong cài đặt chỉ là cài đặt MIUI còn sót) |
| Watermark | Đạt. Màn "Dấu chìm" mở được, bật khung Leica mẫu 2 → ảnh 3780x5478 có khung. Đã tắt lại sau test. Khung ghi "Xiaomi 17 Pro" (tên máy lấy từ cấu hình watermark của bản gốc, không phải lỗi port) | `test/31-watermark-on.png`, `IMG_20261109_211952.jpg`, `test/34-watermark-off.png` |
| Leica Styles editor: nhập ảnh từ thư viện | Đạt (trình chọn tệp hệ thống) | `test/54-imported.png` |
| Áp Full M9 Distilled / M9+ / M10-R, xuất | Đạt, cả 3 xuất ở kích thước gốc 3780x5478 vào `DCIM/Camera/LeicaStyles_*` (6.9 / 6.8 / 11.7 MB, xuất 19–25 s) | `test/55-style-*.png`, `test/57-editor-exports.jpg` |
| Áp style film trong editor, xuất | Đạt 7/8 qua script (Teal & Orange bị lỡ do lỗi so khớp `&amp;` của công cụ test, đã sửa công cụ); xuất khoảng 8 s mỗi ảnh, 3780x5478 | `LeicaStyles_*_Warm Film.jpg`... |
| Style film khi chụp | Đạt: chọn Teal & Orange trong bảng tông → "Use it" → chụp ra `IMG_20261109_215835.jpg` 3780x5478 | `test/58-camera-teal-orange.jpg` |
| Bảng chọn tông (lướt hết danh sách) | Đạt sau sửa (trước sửa: crash ở "Perfect M9") | logcat |
| Nút Leica Styles sau Back/Home | Đạt sau sửa (5/5; trước sửa 0/7) | UI dump |
| Cài đặt: tiếng Trung sót | Không thấy. Quét toàn bộ tab Ảnh/Video/Chung, Pro, Định dạng ảnh, Dấu chìm: 0 chuỗi CJK | `test/uitext.py` trên các dump |
| FATAL / ANR / UnsatisfiedLink / FileNotFound | Chỉ có crash "Perfect M9" ở trên (đã sửa). Không có UnsatisfiedLink/FileNotFound. Không có tombstone của app (tombstone mới nhất 14:22, trước phiên test) | logcat, `/data/tombstones` |

Ghi chú: nhãn "Leica Ch ân thực" ở góc trên chế độ Pro bị ngắt dòng giữa chữ; đó là chuỗi tiếng Việt của MIUI trong ô hẹp, không phải bản dịch của port.

## Gói đóng góp cho người port

`docs/leica-gauguin-profile-contribution.md`: entry JSON cho `assets/device-profiles.json`, bảng ánh xạ id 0/3/6/2/4/1 (tiêu cự, kích thước cảm biến, vai trò), mã nhận dạng (`gauguin`, `M2007J17G` kiểm trên máy; `M2007J17C`, `M2007J17I`, `gauguinpro` chưa kiểm trên máy thật) và hai chỗ cần vá (`logicalPaths()` cho 2x, gọi `Profiles.detected()`).

## Repo camera-ports-los24

Commit `c0c15cf` (chưa push): `leica/README.md`, `build-leica-gauguin.ps1` (tham số `-Apk`, `-Slim`; `AuthorNotice.java` vẫn tùy chọn và không công bố vì chứa khóa AES), `fixes_patch.py`, `film_luts.py`, `film-sample.jpg`, `java/`, `slim_patch.py`, `repack_apk.py` (`--add=`), `translations-en.json`. Không có khóa ký hay khóa AES.

## File đã đổi ở repo này

- `miui-ports/leica/scripts/`: `build-leica-gauguin.ps1`, `fixes_patch.py` (mới), `film_luts.py` (mới), `film-sample.jpg` (mới), `java/` (mới), `repack_apk.py`, `translations-en.json`.
- `docs/leica-gauguin-profile-contribution.md` (mới).
- Công cụ test: `miui-ports/leica/test/{dev.ps1, uitext.py, uitap.py, editor-run.ps1}`.

## Còn lại

- Ảnh test (khoảng 25 file `IMG_20261109_21*`/`22*` và `LeicaStyles_*`) vẫn nằm trong `DCIM/Camera` trên máy.
- Tông màu khi chụp đã được chọn lại về Full M9 Distilled, watermark đã tắt.
