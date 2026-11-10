# Leica port gauguin: bản APK gọn (-Slim)

Ngày 2026-11-09. Dựng: `powershell -ExecutionPolicy Bypass -File miui-ports/leica/scripts/build-leica-gauguin.ps1 -Slim`.

- Kết quả: `miui-ports/leica/out/leica-gauguin-en-slim.apk` **423.6 MB** (bản en: 532.1 MB, giảm 108.5 MB, ~20%). Bản sao: `D:\Projects\camera-ports-los24\release-assets\leica-gauguin-en-slim.apk`.
- Cùng khóa thử (cert SHA-256 `b08fa019…7f9b`, giống bản en), cùng package/versionCode; `zipalign -c -p 4` đạt; `resources.arsc` vẫn stored. `adb install -r` đè lên bản đang cài: Success (giữ dữ liệu).

## Bảng gỡ bỏ

| Mục | Nén (MB) | Bằng chứng |
|---|---|---|
| `assets/legend85-experiment/*` (m9-v81.minn, libQnnSystem/Htp/HtpV81Stub/HtpV81Skel) | 41.2 | Chỉ `LegendExperimentActivity` đọc (classes11, `getAssets().open("legend85-experiment/"+…)`); nút vào màn này đã ẩn từ bản en; lỗi mở asset nằm trong try/catch của `check()`. Màn này cần HTP V81 |
| `assets/donor120/leica-v4/*` | 30.5 | CRC từng file trùng với `assets/lm_leica-v4/*`. Chỉ `ModelAssets` (classes24) đọc cây này (`model120.LegendaryPostProcessor.copyTree`). `slim_patch.py` thêm `ModelAssets.base()`: đường dẫn `leica-v4…` đọc từ `lm_leica-v4/`, phần khác vẫn `donor120/` |
| `assets/leica-v4/dsp/*`, `assets/lm_leica-v4/dsp/*` (libQnnHtpV81.so, HtpV81Skel, HtpV79Skel) | 17.0 | Cả 5 file là ELF Hexagon (e_machine 164), skeleton HTP V79/V81 cho cDSP. SM7225 là Hexagon 694 không có HTP nên không nạp được. Runner native (`lib*letrans_runner/_cpu.so`) chỉ `setenv ADSP_LIBRARY_PATH=%s/dsp`, không mở file trong đó; Java không tham chiếu `dsp/` ngoài mục SHARED `leica-v4/dsp/libQnnHtpV81.so` của `ModelAssets`, đã thay bằng `leica-v4/styletrans_params.json` (trùng, TreeSet bỏ) để `copyTree` không mở file đã gỡ |
| `resources.arsc` locale | 19.9 (24.4 → 4.5) | `aapt2 optimize -c en,vi,zh-rCN` chỉ trên manifest + arsc đã dịch; giữ cấu hình mặc định, vi, zh, zh-rCN và mọi cấu hình không phải locale. 5445 file `res/` vẫn được tham chiếu đủ (đối chiếu `aapt2 dump resources`). Locale khác (kể cả en-rGB/en-rAU) rơi về chuỗi mặc định đã dịch tiếng Anh |

## Giữ lại (có lý do)

- `cacnet.onnx` 73.5 + `nima-aesthetic.onnx` 11.9: `AiVisualReference` (AI composition) chạy ONNX Runtime CPU, là tính năng bật/tắt được, dùng được trên gauguin.
- `donor120/m9fb_styletrans_high.onnx`: đường lùi `M9OrtFallback` của M9.
- `leica-v4` và `lm_leica-v4` (`.minn`, seg model): khác nhau 5 byte ở mỗi file và đi với bộ thư viện native khác nhau (mialgo vs zx/d12), không gộp được nếu chưa chứng minh.
- Bản sao `libzxalgo_*`/`libmialgo_*`/`libd12*`: tên khác nhau và được các runner riêng `dlopen`, không gộp được nếu không vá ELF.
- `nonrootpro/donor-professional-ui.apk` (UI chế độ Pro, `ProDonorUi`), `vp/huaijiu.zip` (bộ lọc video MIUI qua `vp/info.json`), `res/raw` (LUT bộ lọc MIUI).
- Mật độ: `aapt2 --target-densities` không bỏ được file nào (đa số drawable chỉ có 560dpi/440dpi), nên bỏ qua.

## Kiểm tra trên máy

- Đã cài bằng `adb install -r`: thành công, chữ ký khớp.
- **Chưa test giao diện**: màn hình có khóa bảo mật (`isKeyguardShowing=true` sau khi đánh thức và vuốt; `locksettings get-disabled` = false), app không mở lên trên màn khóa. Chưa chụp Essential/Pro/Styles, chưa kiểm tra ultrawide, cài đặt, video.
- Lưu ý khi test: máy đang có sẵn `files/donor120/leica-v4/` (kể cả `.ready`) từ bản trước nên đường redirect sẽ không chạy. Để kiểm tra thật: `adb shell rm -rf /data/data/com.kobbin.leica.wmrebuild/files/donor120/leica-v4` rồi chụp M9 / M9+ / M10R / M3, xem thư mục được tạo lại có 7 file (không có `dsp/`) và logcat không có `FileNotFound`.
- Quay lại nếu lỗi: `adb install -r miui-ports/leica/out/leica-gauguin-en.apk` (cùng khóa).

## File

- `miui-ports/leica/scripts/build-leica-gauguin.ps1` (thêm `-Slim`), `scripts/slim_patch.py` (mới), `scripts/repack_apk.py` (thêm `--drop=prefix`).
