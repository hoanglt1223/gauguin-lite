# Audit độ trễ thao tác Open Camera trên gauguin (2026-11-11 17:23–18:50)

## Phạm vi và điều kiện đo

- Máy: gauguin `c28004a8`, Android 17 (bản eng, shell root), màn hình 1080x2400. Phòng tối (cảnh đo ở ISO 576–6400), máy đặt yên trên bàn.
- Bản chính được đo: `dev.opencamera.app.dev`, bản debug, cài lúc 17:26:02 bởi agent merge (cây `main`, có Compose editor, Glass/Origin skin). `dev.opencamera.app.skins` không có trên máy nên không cài thêm APK.
- Bản so sánh: build `feat/ui-skins` (add7c02) với `isDebuggable = false` (thay đổi tạm, không commit) trong worktree tạm `D:\Projects\open-camera-wt\audit-perf`, cài dưới tên `dev.opencamera.app.lataudit`. Bản này cũ hơn `main` nên chỉ dùng để thấy tác động của cờ debuggable. Đã gỡ gói và xoá worktree sau khi đo.
- Công cụ: Perfetto (ftrace sched/freq/binder/print, atrace gfx view am wm camera input dalvik hal res, app tracing, frametimeline), `am start -W`, `simpleperf record -g` trên máy, `top -H`, logcat, chụp màn hình sau mỗi thao tác để kiểm tra trạng thái.
- Mỗi thao tác được đánh dấu bằng `trace_marker` (`ACT:<tên>`). Script phân tích: `C:\Users\nguye\AppData\Local\Temp\perf\an.py` (ngoài repo).

### Cách đọc các cột
- **Phản hồi**: từ sự kiện chạm (deliverInputEvent UP) đến khi khung UI đầu tiên của app hiện lên.
- **Khoảng ngắt preview**: khoảng lớn nhất không có khung camera mới (`onFrameAvailable` của SurfaceView) trong 6 s sau khi chạm. Đây là thời gian người dùng thấy preview bị đứng hoặc nhoè. Chỉ có nghĩa khi lớn hơn khoảng 100 ms; preview bình thường chạy khoảng 27 fps.
- **Ổn định**: khung UI cuối cùng trước một khoảng lặng 500 ms. Màn hình camera vẽ liên tục (xem C1) nên "ổn định" ở đó gần như luôn bị cắt ở khoảng 5 s. Với camera, cột khoảng ngắt preview có ý nghĩa hơn.
- **Main chạy**: thời gian luồng main ở trạng thái Running trong cửa sổ đó. **Khung dài nhất**: slice gốc dài nhất trên luồng main.

## Phát hiện nền (ảnh hưởng mọi thao tác)

| # | Vấn đề | Bằng chứng | Nguyên nhân | Cách sửa | Ưu tiên |
|---|---|---|---|---|---|
| C1 | Màn hình camera không bao giờ ngừng vẽ khi đang rảnh: khoảng 47 khung/s, 35–40% bị giật, RenderThread và main bận khoảng 35% thời gian. `uiautomator` báo "could not get idle state". | Trace `dev-camera`/`dev-photo-lens`: khoảng 2600 khung UI trong 55 s, `draw-VRI postAndWait` khoảng 2 s mỗi 5 s. simpleperf: `InfiniteTransition.onFrame` chiếm khoảng 12% CPU của main (7% ở bản release) | `ui/overlay/CameraOverlay.kt:868` gọi `rememberInfiniteTransition("busy")` mà không có điều kiện, và `sweep` được đọc trong composition. Vì vậy cả shutter recompose ở mỗi khung, kể cả khi `busy == false` | Chỉ tạo transition khi `busy`, hoặc đọc `sweep` trong `drawBehind` qua lambda/`graphicsLayer`. `RecordingPill` (dòng 449) chỉ được compose khi đang quay nên không bị ảnh hưởng | P0 |
| C2 | Vòng lặp AI chụp preview ngay trên luồng main | simpleperf rảnh: `AiController.loop → PreviewView.getBitmap → createTransformedBitmap → SkiaCanvas::drawBitmap` chiếm khoảng 50% CPU main (11% tổng app ở bản release) | `ai/AiController.kt:117` gọi `viewFinder.bitmap` (vẽ phần mềm toàn khung) trên Main mỗi 250 ms đến 1 s để nhận diện cảnh và bố cục | Dùng khung YUV nhỏ từ ImageAnalysis (đã có luồng analysis), hoặc `PixelCopy` vào bitmap nhỏ trên luồng nền. Giảm tần suất khi cảnh không đổi | P0 |
| C3 | Motion photo sao chép từng byte của mọi khung analysis | simpleperf rảnh (debug): `MotionPhotoController.copy` và `DirectByteBuffer.get` chiếm 46% CPU app trên luồng `pool-10-thread`, khoảng 60% một lõi | `modes/MotionPhoto.kt:268,278-279` lặp từng pixel với `ByteBuffer.get(index)`. Khi debuggable, ART chạy thông dịch nên rất chậm. Ở bản release vẫn tốn | Dùng `get(byte[],off,len)` theo dòng rồi decimate bằng native/libyuv, hoặc lấy mẫu từ khung preview nhỏ | P1 |
| C4 | Mỗi lần activity camera được tạo lại thì sinh một thread pool mới mà pool cũ không dừng | Tên luồng tăng dần `pool-16 → pool-33-thread`, và pool cũ vẫn chạy 450–590 ms CPU sau khi activity mới lên (`dev-more3`, `dev-more4`) | Executor tạo theo activity hoặc ViewModel mà không `shutdown()` trong `onDestroy` | Đóng executor ở `onDestroy`/`onCleared`, hoặc dùng một executor dùng chung cho cả process | P1 |
| C5 | Bản debuggable chậm hơn nhiều | Cold start `TotalTime` 1754–1885 ms (debug) so với 585–697 ms (non-debuggable). Lúc rảnh: 6,0 G cycles/5 s so với 3,1 G | ART tắt JIT/AOT tối ưu, và code nóng (C3) chạy thông dịch | Đo và dogfood bằng biến thể non-debuggable (hoặc `release` với R8). Các số dưới đây là của bản debug | thông tin |

## Bảng theo thao tác (bản `dev`, debug)

| Thao tác | Phản hồi (ms) | Khoảng ngắt preview (ms) | Ổn định (ms) | Main chạy (ms) | Khung dài nhất | Hàm hoặc luồng nóng | Giả thuyết nguyên nhân | Đề xuất sửa | Ưu tiên |
|---|---|---|---|---|---|---|---|---|---|
| Cold start → khung preview đầu | Displayed 1754–1885 (non-debug 585–697) | khung camera đầu ở khoảng 3600 ms sau intent | – | bindApplication 508, performCreate 899, inflate 368 | Compose recompose 198, doFrame 207 | `ImageDecoder` decode JPEG 3840x2560 xuống thumbnail 309x206 mất 343 ms (DefaultDispatch); `PlayerView` inflate 104 ms; CameraX init chạy song song nhưng bind sau layout Compose | Camera chỉ được bind sau khi inflate View cũ cộng overlay Compose xong; thumbnail decode từ ảnh gốc | Bind camera sớm (trong `onCreate`, trước Compose), inflate trễ `PlayerView`, lấy thumbnail qua `ContentResolver.loadThumbnail`. Thêm baseline profile | P1 |
| Chạm shutter → ảnh được lưu (Ảnh, HDR tự động, phòng tối) | shutter bị vô hiệu sau khoảng 300 | preview đứng **khoảng 16 s** | **126 s** (NIGHT 6 khung RAW, t=1 s) | 1,4–1,8 s mỗi 5 s (spinner) | 46 ms | logcat `MultiFrame: Captured kind=NIGHT frames=6 ... t=1000000000 capture=126450ms`; xử lý 3,4 s (align 1,8 s, merge 0,8 s, finish 0,6 s) | Burst RAW chụp tuần tự: `captureRaw` gọi `takeRaw` cho từng khung, trong khi repeating request cũng đặt `SENSOR_FRAME_DURATION` dài. Mỗi still request phải xếp hàng sau nhiều khung repeating dài trong pipeline HAL. Thêm vào đó các `bounded("burst options")` chờ hết hạn 3 s | Chỉ gửi phơi sáng dài cho still request, một lần qua `captureBurst` hoặc CameraX `takePicture` hàng loạt. Giữ repeating preview ở 30 fps. Hiện ETA hoặc đếm ngược và cho huỷ | **P0** |
| Chạm shutter ở ASTRO (vô tình bật) | khoảng 300 | preview đứng đến hết capture | **107 s** (4×16 s). Lần bấm tiếp bị xếp hàng, xong sau 484 s | – | – | `kind=ASTRO frames=4 t=16000000000 capture=107100ms` | Như trên. Ngoài ra snackbar "Thiên văn" (`CameraActivity.kt:1252`) chỉ cần một lần chạm là đặt ASTRO **dính lâu dài** | Snackbar chỉ áp dụng cho một lần chụp. Hiện rõ trạng thái ASTRO và thời lượng trước khi chụp. Khi chưa có tripod thì giới hạn tổng thời gian | **P0** |
| Thao tác UI khi đang chụp nhiều khung | chạm vào mode hoặc lens bị nuốt | – | – | – | – | trace `dev-photo-lens`: 13–60 lần `onCaptureSequenceAborted` cho mỗi lần chạm lens, không có khung preview mới | Thay đổi zoom/session khi burst đang giữ camera | Chặn thao tác có phản hồi rõ ("đang chụp…"), hoặc cho huỷ burst | P1 |
| Lens 1× → 0.6 | 2–110 | **777** | 814 | 348 | doFrame 76 | CameraX-core rebind (đổi camera vật lý) | Đổi sang camera siêu rộng phải bind lại session | Dùng logical multi-camera (`CONTROL_ZOOM_RATIO` < 1) nếu HAL hỗ trợ. Nếu không, giữ khung đông cứng mờ (đã có) và chuyển mượt | P2 |
| Lens 0.6 → 1 | 122 | **754** | 780 | 325 | 85 | như trên | như trên | như trên | P2 |
| Lens 1 → 2 / 2 → 1 | 58 / 61 | 44 / 41 (không đứt) | 569 / 354 | 317 / 298 | 20 / 22 | Recomposer 170 ms | Zoom crop. Phần lớn chi phí là recompose cả overlay | Thu nhỏ phạm vi recompose của lens chip | P3 |
| Mode Ảnh → Video | 92 | **641** | 953 | 689 | doFrame 101 | animation 297, recompose 202, CameraX bind | Bind lại toàn bộ use case (`bindCameraUseCasesOrThrow` gọi `unbind()` rồi bind) | Giữ session khi có thể (CameraX `VIDEO_CAPTURE` cùng `IMAGE_CAPTURE`), chuẩn bị trước | P1 |
| Mode Video → Ảnh | 132 | **742** | 966 | 649 | 136 | như trên | như trên | như trên | P1 |
| Mode Ảnh → Pro | 271 | <50 | 4918 | **2607** | doFrame 160 | `AndroidOwner:measureAndLayout`, `pool-10-thread` 1269 ms, DefaultDispatch 352 | Bật Pro làm dựng lại panel và overlay đo/vẽ dày (ProDials), cộng với luồng analysis | Tạo panel Pro trễ hoặc giữ sẵn. Tách overlay histogram/peaking để không vẽ lại mỗi khung | P1 |
| Mode Pro → Ảnh | 72 | <50 | 614 | 322 | 53 | – | – | – | P3 |
| Mode Ảnh → Đêm | 36 | <50 | 501 | 295 | 18 | – | Chỉ đổi cài đặt | – | P3 |
| Mode Video → Chân dung | 123 | **774** | 1088 | 972 | 114 | `CX:bindToLifecycle` 93 ms trên main | Bind lại cộng bật AI chân dung | Như Video ↔ Ảnh | P1 |
| Mode Quét | không đo được: chip nằm ngoài vùng nhìn thấy ở bố cục hiện tại | – | – | – | – | – | – | – | – |
| Mở "Thêm" (More) | 224 | – | 625 | 542 | doFrame **212** | `draw-VRI` 163, measureAndLayout 113 | Sheet có 17 ô được dựng lần đầu trong một khung | Dựng trước hoặc dùng lazy grid, tránh blur lớn | P2 |
| More → Video chuyên nghiệp / Quay chậm / Tua nhanh / Hyperlapse / Video ngắn / Màn trập chậm / Đóng băng / Toàn cảnh / Tài liệu (VideoModesActivity) | 50–130 | <50 (activity mới) | khoảng 5800 (vẽ liên tục) | 920–1150 | clientTransaction 88–144 | `CameraX-camerax` 2,0–3,2 s CPU, khoảng 17–25 khung giật trên 170 | Mở camera thứ hai trong activity mới. Spinner hoặc animation chạy liên tục như C1 | Giữ một camera session, tránh tạo activity riêng. Áp dụng sửa C1 | P2 |
| Quay về camera từ VideoModesActivity | 5–220 | **720–850** | 805–919 | 460–760 | doFrame 98–125 | `performStart`, CameraX bind | Camera của activity chính phải mở lại | như trên | P2 |
| More → Mặt trăng / Phơi sáng lâu / Vệt sáng / Xoá người / Ghép lấy nét / Thể thao / Thiên văn (trong camera) | 67–103 | <50 | 470–490 | 273–326 | 32–57 | `pool-N-thread` 230–300 | Ổn | – | P3 |
| Thoát các mode trên bằng Back (activity bị dựng lại) | **1590–1650** | **1720–1890** | 2700–3350 | **1820–2170** | clientTransaction **355–471** | `activityStart`, `performCreate`, DefaultDispatch 710–790; pool cũ vẫn chạy (C4) | Back thoát activity rồi phải cold-start lại. Mode sáng tạo không xử lý Back | Bắt Back để tắt mode sáng tạo thay vì đóng activity | P1 |
| Mở dải Looks | 93 | <50 | 365 | 305 | 84 | `draw-VRI` 80 | Dựng 6 vòng tròn preview lần đầu | Giữ sẵn | P3 |
| Áp dụng look (Vivid / Gốc) | 122 / 180 | **797 / 774** | 251–298 | 205–269 | input 51–60 | CameraX rebind khi đổi giữa có và không có effect | Bật hoặc tắt `CameraEffect` buộc bind lại session | Luôn gắn effect (passthrough khi look = Gốc), chỉ đổi uniform/LUT | P1 |
| Áp dụng look → look khác (Classic CCD) | 147 | 46 | 147 | 117 | 29 | DefaultDispatch 142 (nạp LUT) | Ổn | – | P3 |
| Đóng Looks | 118 | <50 | 473 | 402 | 34 | – | – | – | P3 |
| Mở Cài đặt (SettingsActivity) | 241 | – | 504 | 286 | doFrame 157 | `RV OnLayout` 109, inflate 77 | Lần đầu inflate PreferenceFragment | Chấp nhận được, có thể tải trước | P3 |
| Quay lại camera từ Cài đặt | 263 | **779** | 812 | 497 | 131 | `CX:bindToLifecycle-SessionConfig` | `onStop` làm camera bị đóng, phải bind lại | Chấp nhận (hành vi CameraX) | P3 |
| Bật/tắt Lưới, Mức độ, mở hộp thoại lưới (trong Cài đặt) | 15–28 | – | 238–881 | 113–327 | 22–67 | – | Ổn | – | P3 |
| Đổi skin Origin → Glass rồi quay về camera | 394 | **1650** | 4957 | 1710 | doFrame **301** | `pool-33-thread` 1410, animation 477 | Đổi skin làm activity/overlay dựng lại toàn bộ cộng bind lại camera. Hiệu ứng kính mờ tốn | Áp dụng skin bằng recompose theme, không recreate. Làm ấm blur | P2 |
| Bấm thumbnail thư viện | mở Google Photos (ngoài app) | – | – | – | – | – | – | – | – |
| Mở editor (DevelopActivity, process đã chạy sẵn) | TotalTime 147 | – | – | – | – | `DevelopEngine` lần render đầu 43 ms (1139x1517) | Ổn | – | P3 |
| Kéo thanh trượt Phơi sáng / Tương phản | 14 / 0 | – | – | 27–37 | 32–40 | 52–61 khung/0,9 s, khung trung bình 27–32 ms, **22–38 khung giật** | GL rẻ (`develop-gl` < 1,5 ms/slice); jank nằm ở UI `draw-VRI` 385–407 ms. Compose vẽ lại cả màn hình mỗi lần giá trị đổi | Chỉ invalidate vùng ảnh và nhãn, giới hạn recompose bằng `derivedStateOf` | P2 |
| Nút Tự động | 76 | – | 219 | 126 | 63 | – | Ổn | – | P3 |
| Tab Phong cách (editor) | 135 | – | 538 | 459 | 114 | DefaultDispatch 400 (dựng thumbnail looks) | Dựng 6 thumbnail cùng lúc | Dựng từ ảnh proxy nhỏ, lazy | P2 |
| Xoá vật thể (MI-GAN) | 62 | – | **khoảng 5500** | 48 | 31 | luồng `editor-retouch` 3,1 s CPU; UI ghi "migan 3709 ms" | Chạy inpaint trên CPU ở độ phân giải lớn | Chạy trên crop quanh mask hoặc NNAPI/GPU, có thanh tiến trình | P2 |
| Chọn công cụ retouch (Vết thâm…) | 51 | – | 58 | 43 | 37 | – | Ổn (các chạm sau bị màn so sánh kết quả chặn nên không đo) | – | P3 |
| Xuất (Lưu JPEG 3472x4624) | 34 | – | **2237** (render 1846) | sau đó main 3,2 s | – | `DevelopExporter` | Render full-res một lần trên GPU/CPU | Chấp nhận nhưng chạy nền kèm thông báo. Main bận 3,2 s sau khi lưu cần xem lại (có thể là reload ảnh) | P2 |

### So sánh debug với non-debuggable (`feat/ui-skins`, cùng máy, cùng cảnh)

| Thao tác | debug (`main`) | non-debuggable (`ui-skins`) |
|---|---|---|
| Cold start TotalTime | 1754–1885 ms | 585–697 ms |
| CPU app lúc rảnh (5 s) | 6,0 G cycles | 3,1 G cycles (không có motion copy, AI getBitmap vẫn chiếm 11%) |
| Lens 1 → 0.6, khoảng ngắt preview | 777 ms | 662 ms |
| Lens 0.6 → 1 | 754 ms | 685 ms |
| Pro → Ảnh: main / khung dài nhất | 322 ms / 53 ms | 610 ms / 92 ms (khác code) |

Bỏ cờ debuggable giúp nhiều cho khởi động và CPU nền. Các lần preview đứng khi bind lại camera thì gần như không đổi, vì chúng nằm ở luồng camera và HAL, không phải ở code Java.

## Mười thao tác tệ nhất (theo mức người dùng cảm nhận)

1. Shutter trong cảnh tối (NIGHT tự động): ảnh lưu sau 126 s, preview đứng, UI không phản hồi (P0).
2. Shutter ở ASTRO, bật chỉ bằng một chạm snackbar và dính lâu dài: 107 s mỗi ảnh, các lần bấm thêm bị xếp hàng đến 8 phút (P0).
3. Màn camera vẽ liên tục và chụp preview trên main (C1 cộng C2) làm mọi thao tác chậm thêm (P0).
4. Pro: main bận 2,6 s, khung 160 ms (P1).
5. Thoát mode sáng tạo bằng Back: tạo lại activity, phản hồi 1,6 s, preview đứng 1,8 s, rò thread pool (P1).
6. Đổi skin: preview đứng 1,65 s, khung 301 ms (P2).
7. Áp dụng look giữa có và không có effect: preview đứng khoảng 0,8 s (P1).
8. Đổi mode Ảnh ↔ Video ↔ Chân dung: preview đứng 0,64–0,77 s, khung 100–136 ms (P1).
9. Lens 0.6 ↔ 1: preview đứng khoảng 0,75–0,8 s (P2).
10. Xoá vật thể 3,7–5,5 s, xuất ảnh 2,2 s cộng 3,2 s main bận (P2). Cold start đến preview đầu khoảng 3,6 s (P1).

## Trace (git-ignored, `D:\Projects\gauguin\plans\reports\perf-traces\`)

`dev-cold-start` (cold start, build trước 17:26), `dev-camera` (shutter ở chân dung và trạng thái bận), `dev-photo-lens` (shutter NIGHT/ASTRO, lens), `dev-modes`, `dev-modes2` (mode, looks), `dev-looks` (áp dụng look, More), `dev-more1`…`dev-more4` (các mode trong More), `dev-settings` (cài đặt, lưới, mức độ, skin), `dev-editor1` (slider, tự động, phong cách), `dev-retouch`, `dev-export`, `rel-modes` (bản non-debuggable). Cấu hình: `perf-traces\cfg\trace.pbtxt`.

## Hạn chế

- Máy dùng chung với agent merge và agent đo bộ nhớ. Bản `dev` được cài lại lúc 17:26 giữa lúc đo, và agent khác cài `dev.opencamera.app.perf` (không phải của audit này) rồi chạy nó lúc 18:25 và 18:50. Trace `rel-modes2` bị lẫn nên đã xoá. Các phiên bị chạm sai mode đã được gán lại nhãn bằng ảnh chụp màn hình.
- Cảnh rất tối, nên HDR tự động chuyển thành NIGHT. Thời gian chụp trong cảnh sáng chưa đo.
- Chưa có bản `release` với R8. Bản non-debuggable là `feat/ui-skins`, không phải `main`.
- Không đo được: mode Quét (chip ngoài màn hình), chỉnh mắt đỏ/làm mịn da (bị màn kết quả chặn), mở thumbnail (app chuyển sang Google Photos).

## Câu hỏi còn mở

- Có muốn burst RAW dùng một `captureBurst` duy nhất không? Việc này cần đổi cách đi qua CameraX (Camera2 interop).
- Snackbar Thiên văn nên chỉ áp dụng cho một ảnh, hay vẫn giữ là cài đặt lâu dài nhưng có cảnh báo?
