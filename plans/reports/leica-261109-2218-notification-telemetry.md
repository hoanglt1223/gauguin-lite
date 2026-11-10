# Leica port gauguin: thông báo "background rendering" và telemetry

Ngày 2026-11-09. Bản cuối: `miui-ports/leica/out/leica-gauguin-en-slim.apk` (421.7 MB, SHA-256 bắt đầu `8834F5ED09EA8BA0`, cùng khóa thử), đã `adb install -r` (giữ dữ liệu) và chép sang `D:\Projects\camera-ports-los24\release-assets\leica-gauguin-en-slim.apk`. Dựng: `build-leica-gauguin.ps1 -Slim`.

## 1. Thông báo treo mãi

Nguyên nhân: `com.codex.fullm9.PhotoProcessingService` (classes17). `BackgroundCapture.cloudPreviousAttach()` khởi động service mỗi lần mở camera khi `no_backup/m9-photo-jobs/jobs.db` tồn tại (hoặc đang chọn Perfect M9). Hàng đợi rỗng nên sau thời gian giữ 15 s, `finish` gọi `stopSelfResult` + `stopForeground(DETACH)` rồi `notify(19409, notification(false))`: thông báo không ongoing, thanh tiến độ 100/100, không có hẹn giờ, nên nằm mãi. Service thật ra đã dừng; chỉ thông báo còn lại.

Sửa (`fixes_patch.py` → `drained_notice`): trong `notification(Z)`, khi `ongoing == false` và `failureCount == 0` thì `setTimeoutAfter(4000)`, `setAutoCancel(true)`, `setProgress(0,0,false)`. Trong lúc chạy vẫn là thông báo foreground có tiến độ. Khi có ảnh lỗi, thông báo "Some photos incomplete…" vẫn giữ để người dùng biết.

Kiểm trên máy (poll 0.5 s sau khi mở nguội): giây 1–21 `ONGOING|NO_CLEAR|FOREGROUND_SERVICE`, service chạy; giây 22 service dừng, thông báo đổi thành `AUTO_CANCEL`; giây 28 biến mất. `dumpsys activity services` trống sau đó.

## 2. Telemetry

| Thành phần | Endpoint (chuỗi trong dex) | Cách tắt | hosts máy (`grep -c`) |
|---|---|---|---|
| OneTrack SDK 3.1.2 (classes2, DB `onetrack_*`, `one_track_cloud`, `ot_ps_*`) | `tracking.miui.com`, `tracking.intl/eu/india/rus.miui.com` | `OneTrack.isDisable()` trả `true`. Đây là công tắc tắt của chính SDK; `util.s.a()` (cổng mạng chung), track, upload, cloud config đều kiểm nó | 2 / 1 / **0 (eu)** / 1 / 1 |
| OneTrack cloud config | `sdkconfig.xiaomi.com`, `sdkconfig.intl/eu/india/rus.xiaomi.com` | như trên (`b.e.f()` thoát ở `s.a()`) | **0 cả 5** |
| OneTrack ad | `api.ad.xiaomi.com` | như trên | 2 |
| Camera CloudConfig (`com.miui.camerainfra.cloudconfig`, `CloudConfig.db`, classes3) | URL ghép từ chuỗi mã hóa; phần content tải từ `https://cnbj1.fds.api.xiaomi.com` | `Xe.e.f()` (DataRequester, request mạng) trả `EmptyList`, giống cache rỗng; cấu hình mặc định trong máy vẫn dùng | cnbj1: **0** |
| Đồng hồ mạng của watermark (`Hh.v`, classes4, chuỗi XOR 0x7d12) | HEAD `https://www.baidu.com` (region cn), `https://yandex.com` (ru), `https://www.google.com` (khác) để đọc header `Date` | `Hh.v.c()` trả `System.currentTimeMillis()`, đúng nhánh dự phòng của nó khi lỗi mạng | không chặn (là trang thường) |
| Không vá, chỉ liệt kê | `tracker.ai.xiaomi.com/track/perf/v2` (AIVS, classes3), `resolver.msg.xiaomi.net`, `app.chat.xiaomi.net`, `cn.app.chat.xiaomi.net`, `sandbox.xmpush.xiaomi.com` (MiPush), `data.mistat.xiaomi.com` | không thấy kết nối nào tới chúng khi test | tracker.ai: 0; resolver.msg: 0; data.mistat: 1 |

Thực đo trước khi vá đồng hồ mạng: mỗi lần mở app tăng khoảng 7 KB rx / 1.5 KB tx. Bắt bằng `/proc/net/tcp` (uid 10219), `tcpdump` (SNI `www.baidu.com`), `strace -e connect` và `debuggerd -j` (chặn tạm bằng iptables để kịp lấy stack, đã gỡ): stack OkHttp từ `Hh.x` / `Hh.v` (WatermarkRepository). Sau khi vá: không còn kết nối nào.

## 3. Test bản cuối

| Hạng mục | Kết quả |
|---|---|
| Chụp 3 ảnh Full M9 Distilled (nút 540,2088) | Đạt: `IMG_20261109_225701/707/712.jpg` (6.7–6.8 MB), logcat 3 dòng `LMomentPort: Full M9 Distilled · 3472×4624` |
| Thông báo sau khi xong | 0 bản ghi `NotificationRecord pkg=com.kobbin` (thông báo cuối tự hủy sau ~4 s, xem mục 1) |
| Foreground service sau khi hết hàng đợi | Không còn (`ServiceRecord` = 0) |
| Mạng uid 10219 (`dumpsys netstats detail`, sau `--poll`) | Trước rx=539367 tx=173112, sau mở nguội + 3 ảnh + 30 s: không đổi |
| FATAL / ANR / tombstone | Không có. Tombstone mới nhất vẫn `tombstone_37` (15:34), `/data/anr` trống |

Ghi chú: ảnh chụp lẻ (1 ảnh) được dựng ngay trong tiến trình camera, không qua hàng đợi; hàng đợi/service chỉ chạy ở lần mở camera (khôi phục) và khi giao ảnh Perfect M9.

## File đã đổi

- `miui-ports/leica/scripts/fixes_patch.py`: `drained_notice`, `onetrack_off`, `cloudconfig_off`, `net_time_off`.
- `miui-ports/leica/scripts/build-leica-gauguin.ps1`: thêm classes2, classes4 vào danh sách dex được baksmali/smali.
- Repo `camera-ports-los24`: commit `041254b` (chưa push) với 2 file trên + `leica/README.md`. Không có khóa ký, khóa AES hay PIN.

## Sự cố trong lúc test

Một lần `monkey -p … 1` (dùng để mở app) bắn một sự kiện ngẫu nhiên làm tắt Wi-Fi; đã bật lại (`svc wifi enable`, đã nối lại "Ahihi"). Lần sau mở app bằng `am start -n com.kobbin.leica.wmrebuild/com.android.camera.Camera`.

## Còn lại

- Không sửa hosts trên máy. Nếu muốn chặn ở mức hệ thống: thêm `tracking.eu.miui.com`, `sdkconfig.{,intl.,eu.,india.,rus.}xiaomi.com`, `tracker.ai.xiaomi.com`, `cnbj1.fds.api.xiaomi.com`.
- 11 ảnh test mới (`IMG_20261109_2235*`–`2257*`) nằm trong `DCIM/Camera`.
