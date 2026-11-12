# Open Camera: Pro phơi sáng dài qua Camera2 burst (feat/pro-burst)

Ngày 2026-11-12 (Asia/Saigon). Worktree `D:\Projects\open-camera-wt\pro-burst`, nhánh `feat/pro-burst`, commit `2d87bf8`; đã gộp `--no-ff` vào `main` (`dbd2f9d`). Chưa push.

## Đã làm

- Pro với màn trập thủ công từ **1/4 s** trở lên (`ManualStill.MIN_CAMERA2_EXPOSURE_NS`) giờ chụp bằng đường Camera2 burst của Night/Astro, 1 khung, `SENSOR_EXPOSURE_TIME`/`SENSOR_SENSITIVITY` lấy đúng từ Pro. WB, ma trận màu, nét được chép từ kết quả preview (preview đang chạy với cài đặt Pro, nên Kelvin/preset/lấy nét tay được giữ).
- Màn trập ngắn hơn 1/4 s hoặc Pro tự động: vẫn đi đường CameraX như cũ.
- Chỉ áp dụng khi phiên RAW (`FULL_RES_RAW`) đang bind và activity đã gắn `burstHost`, giống điều kiện burst của Night.
- **Đường lùi:** `ManualStill.withFallback` chạy Camera2 burst; lỗi (không phải hủy) thì chụp 1 khung RAW qua CameraX như trước; cả hai lỗi thì trả null và chuỗi hạ phiên + toast có sẵn xử lý. Hủy (chạm màn trập, `onStop`) luôn được truyền ra, không bị coi là lỗi. Đường Night/HDR cũng dùng chung hàm này (hành vi giữ nguyên).
- `usesCamera2Burst` được thay bằng `MultiFrameCaptureController.camera2Plan(plan)`.

## File đã sửa (ghi chú merge)

- `multiframe/MultiFrameCaptureController.kt`: thêm `manualStill`, `camera2Plan`; bỏ `usesCamera2Burst`.
- `viewmodels/CameraViewModel.kt`: `takeFullResPhoto` dùng `camera2Plan` + `ManualStill.withFallback`.
- `pro/ProModeUi.kt`: `applyOptions` đặt `multiFrame.manualStill`.
- Mới: `multiframe/ManualStill.kt`, test `ManualStillTest.kt` (6 test: kế hoạch 1 khung, ngưỡng, lùi khi burst lỗi, cả hai lỗi trả null, không có fallback, hủy không chạy fallback).

## Bằng chứng trên gauguin (c28004a8, gói `dev.opencamera.app.pb`, phòng có đèn, ISO 400)

Tap → saved đo từ thời điểm `input tap` (đồng hồ máy) đến dòng log `MultiFrame: kind=SINGLE ... save=` . Log: `plans/reports/perf-traces/pro-burst-{before,after}-*.txt`.

| Màn trập | Trước | Sau | Khung Camera2 (sau) |
|---|---|---|---|
| 1/4 s | 3,39 s | 3,10 s | t=250 000 000 ns, iso=400, frame 0 xong ở 2,39 s |
| 1 s | 9,05 s | 3,80 s | t=1 000 000 000 ns, iso=400, frame 0 ở 3,17 s |
| 1,6 s | 11,66 s | 4,44 s | t=1 600 000 000 ns, iso=400, frame 0 ở 3,76 s |

- EXIF (đọc bằng Pillow): 0,25 / 1,0 / 1,6 s, ISO 400, 4624×3472, mô tả "Open Camera Single RAW".
- Không crash; preview sống trở lại sau mỗi lần chụp. App đã force-stop và về Home sau mỗi phiên.

## Gate

`.\gradlew.bat assembleDebug test lint` thành công; `app:generateBp` thành công, không đổi `Android.bp`.

## Còn lại / lưu ý

1. **Overhead cố định ~2,2–2,8 s** (unbind CameraX, mở camera, tạo session, đóng, bind lại). Tap → saved = phơi sáng + ~2,8 s, hơi vượt mục tiêu +1–2 s. Muốn giảm thêm phải giữ phiên Camera2 riêng hoặc bỏ chờ `onClosed`; chưa làm.
2. Ở 1/4 s lợi ích nhỏ (3,4 → 3,1 s). Nếu thấy preview bị đóng băng là phiền thì có thể nâng ngưỡng lên ~1/2 s.
3. Đường lùi CameraX sau khi burst lỗi chỉ được kiểm bằng unit test, chưa ép lỗi trên máy.
4. Trong lúc chụp, viewfinder là ảnh mờ đóng băng (giống Night).
5. Gate chạy chung `assembleDebug test lint app:generateBp` trong một lệnh Gradle báo lỗi biên dịch giả (unresolved reference tới module khác); chạy `app:generateBp` riêng thì sạch. Lỗi môi trường build, không liên quan thay đổi này.
