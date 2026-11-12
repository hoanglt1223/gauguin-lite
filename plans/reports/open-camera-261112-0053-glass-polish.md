# Open Camera: chỉnh Glass cho giống mockup, đổi chế độ mượt hơn

Ngày 2026-11-12 (Asia/Saigon). Repo `D:\Projects\open-camera`, worktree `D:\Projects\open-camera-wt\glass-polish`, nhánh `feat/glass-polish`.
Commit `5c86ba7`, merge `--no-ff` vào `main` local là `662a4df`. Chưa push.
Gói dùng để test trên gauguin: **`dev.opencamera.app.gp`** (build với `-PopenCamera.debugSuffix=.gp`). Gói này vẫn còn cài trên máy và đã được tắt.

## 1. Glass so với mockup

Mockup `261111-1419-camera-ui-skins/mockups/glass.html` được chụp bằng Chrome headless, mỗi chế độ một ảnh. App được chụp trên gauguin. Ảnh đặt cạnh nhau nằm ở `plans/reports/perf-traces/glass-polish/compare-{photo,video,pro,portrait,night}.png`. Ảnh gốc là `mockup-glass-*.png`, `app-before-*.png` và `app-after-*.png`.

| Khác biệt (trước khi sửa) | Đã sửa |
|---|---|
| Preview bắt đầu dưới thanh trên 64dp, nên có một dải đen phía trên và capsule nằm trên nền đen | `previewTop` của Glass = 0. Preview bắt đầu ngay dưới status bar và capsule trên nổi trên preview |
| Phần dưới (chip zoom, hàng chế độ, shutter) nằm trên nền đen đặc | `GlassBackdrop`: chụp preview bằng PixelCopy bất đồng bộ (18 px ngang, khoảng 6 lần/giây, chạy ngoài main thread). Hàng điểm ảnh ở mép trên/dưới được kéo giãn phủ phần màn hình ngoài khung preview, có lọc bilinear (tự thành mờ, không cần shader blur), phủ một lớp tint nhẹ. Mép preview được làm mềm 56dp, nhờ vậy nhìn như preview tràn viền dưới các nút |
| Capsule trên màu xám đậm có viền đều | Vật liệu kính dùng chung `glassCapsule()`: lớp sáng 20→8% trắng trên nền đen 14%, viền sáng phía trên (specular) mờ dần xuống dưới |
| Chế độ là chữ trần | Hàng chế độ nằm trong capsule kính. Pill của chế độ đang chọn là 20% trắng, chữ vàng |
| Thumbnail vuông bo 12dp, nút lật camera là hình tròn xám | Cả hai là nút tròn kính 52dp, cùng vật liệu |
| Chip zoom | Dùng chung vật liệu kính |
| Shutter | Giữ nguyên vì đã đúng mockup: 78dp, vòng trắng 3dp, không có panel tối phía sau |

Còn khác mockup (cố ý):
- Thanh trên vẫn có 6 nút (đèn, HDR, live, hẹn giờ, looks, cài đặt), mockup chỉ có 4. Bỏ nút là bỏ tính năng.
- Ảnh chụp có tỉ lệ 3:4, nên preview không thể tràn thật. Phần ngoài khung là cảnh đã làm mờ, như vậy vẫn thấy đúng khung sẽ chụp.

Origin không đổi: mọi thay đổi hình ảnh chỉ áp dụng khi `s.glass`. Đã chụp kiểm tra trong `app-after-origin.png`.

## 2. Đổi chế độ

### Nguyên nhân (perfetto `before.pftrace`, bản debug)
1. **Bind CameraX hai lần mỗi khi đổi Ảnh ↔ Video.** Lần đầu là bind theo cấu hình mới. Lần thứ hai xảy ra khi khung preview đổi giữa 3:4 và 9:16: PreviewView đổi viewport trong pha layout, và controller đang bind tự bind lại. Mỗi lần bind tốn 30–76 ms trên main và phiên camera phải mở lại thêm một lần.
2. **Portrait → Ảnh không ăn.** `updateAiPortraitButton` cập nhật `portrait` nhưng không tính lại `uiMode`, nên vuốt từ Chân dung sang Ảnh bị kẹt.
3. **Pro biến mất khỏi carousel khi đang ở Video**, nên danh sách bị xếp lại và vuốt từ Video nhảy thẳng sang Quét.

### Cách sửa
- Collector cấu hình camera đổi khung preview trước: gỡ bind (giữ khung đông cứng đã làm mờ), đợi `doOnNextLayout` (tối đa 250 ms), sau đó bind đúng một lần. Collector `cameraMode`/`photoAspectRatio` không còn tự layout lại.
- Gọi `.derived()` khi cờ portrait đổi. Pro được giữ trong danh sách chế độ khi đã từng có.
- Animation chuyển cảnh trên Glass: preview tối đi (32%) rồi sáng lại (khoảng 110 + 380 ms) mỗi lần đổi chế độ. Với các chế độ phải bind lại thì vẫn có khung đông cứng mờ, rồi crossfade sang preview thật như trước. Pill của chế độ trượt theo carousel như cũ.

### Số đo (gauguin, bản debug, vuốt Ảnh ↔ Video)

| Chỉ số | Trước | Sau |
|---|---|---|
| Số lần `bindToLifecycle` (perfetto) | 14 lần cho khoảng 6 lần đổi Ảnh↔Video (có bind thừa trong pha layout) | 8 lần cho 8 lần đổi (1 lần/đổi) |
| Tổng thời gian `layout` trên main | 325 ms (tối đa 86) | 36 ms (tối đa 4) |
| Frame dài nhất khi đổi | 222 ms | 85 ms |
| Recompose dài nhất | 54 ms | 38 ms |
| Bind start → frame preview đầu | 520–946 ms (trung vị khoảng 590) | 426–568 ms (trung vị khoảng 490) |
| Chạm → frame preview đầu | 538–964 ms (trung vị khoảng 606) | 529–694 ms (trung vị khoảng 620) |
| gfxinfo 16 lần đổi Ảnh↔Video: p50 / p95 / p99 | 22 / 73 / 150 ms (gói `.dev` = main) | 24 / 85 / 150 ms |
| gfxinfo khung giật | 13% (89/682) | 19% (151/781) |

Đọc số:
- Bind thừa và layout nặng đã hết. Frame tệ nhất giảm từ 222 xuống 85 ms. Thời gian từ bind tới khung preview đầu giảm khoảng 100 ms.
- Thời gian từ chạm tới khung preview đầu gần như không đổi. Lý do là bind giờ chờ layout xong (thêm khoảng 120 ms), và phần lớn thời gian còn lại là HAL mở lại phiên (khoảng 450 ms), không thể tránh khi đổi sang use case video.
- gfxinfo đếm thêm khung từ animation làm tối và từ lớp nền kính (khoảng 6 lần vẽ/giây), nên tỉ lệ "janky" tăng dù frame nặng nhất giảm. Đây là bản debug (ART thông dịch). Bản release sẽ nhẹ hơn.
- Lần đầu vào Pro vẫn tốn khoảng 100 ms `measureAndLayout` khi compose ProDials lần đầu (vấn đề cũ, audit P1). Lần này chưa sửa.

Dữ liệu: `before.pftrace`, `after.pftrace`, `after-origin.pftrace`, `gfx-*.txt`, `logcat-*.txt` trong `perf-traces/glass-polish/`. Log `OcPerf: preview streaming … after bind start, … after mode tap` được thêm để đo.

## 3. Gate
- `.\gradlew.bat assembleDebug test lint`: đạt.
- `.\gradlew.bat app:generateBp`: đạt, `Android.bp` không đổi.

## File dùng chung đã sửa (ghi chú merge)
- `CameraActivity.kt`: collector `cameraConfiguration` (gỡ bind, layout, rồi bind), `layoutPreviewForSkin(tokens, unbindFirst): Boolean` (lấy tỉ lệ từ cấu hình mới nhất), `updateAiPortraitButton`, `derived()`, `previewSample`, log perf.
- `ui/overlay/CameraOverlay.kt`, `CameraUiState.kt` (thêm `previewSample` có cài đặt mặc định), `ui/skin/SkinTokens.kt` (Glass `previewTop = 0`), file mới `ui/overlay/GlassBackdrop.kt`.

## Không bao giờ crash
- Mọi lỗi PixelCopy hoặc lỗi lấy mẫu đều trả `false`, khi đó không vẽ nền kính. Khi `BlurPolicy.NONE` (người dùng tắt mờ, hoặc máy yếu) thì không chạy lớp nền.
- Bước gỡ bind được bọc trong `FeatureGuard`. Nếu layout không đến thì sau 250 ms vẫn bind.
- Việc lấy mẫu chỉ chạy khi Activity ở trạng thái RESUMED.
- Logcat crash trống trong các phiên test.

## Concerns
- Lỡ tay cài bản build của gate (hậu tố mặc định `.dev`) đè lên **`dev.opencamera.app.dev`**. Đã cài lại `open-camera-alpha6-debug.apk` (bản `.dev` mới nhất trong `Downloads\camera-test-apks`, build từ `2f74523`). Nếu trước đó máy có bản `.dev` mới hơn thì cần cài lại.
- Lớp nền kính không phải blur thật mà là ảnh nhỏ phóng to. Trên cảnh có tương phản cao vẫn thấy vệt mờ dạng dải. Nếu muốn blur mạnh hơn trên API 31+ thì có thể thêm `RenderEffect`, đổi lại tốn GPU ở mỗi lần vẽ.
- Chưa test trên iQOO và bản release.
