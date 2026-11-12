# Audit bộ nhớ Open Camera (dev.opencamera.app) — 2026-11-11 17:23

Phạm vi: `D:\Projects\open-camera` (main @ c6eb6d8). Các worktree `ui-skins`, `phase12-editor`, `phase11-retouch` đã được merge hết vào main (`git diff main...<branch>` rỗng với `*.kt`/`*.cpp`), nên audit tĩnh chạy trên main.
Phần động chạy trên gauguin (c28004a8) với bản dev có sẵn `dev.opencamera.app.dev`, đo bằng `dumpsys meminfo`. Không build LeakCanary (xem mục Hạn chế).

## Tóm tắt

| # | Mức | Vấn đề | Bằng chứng |
|---|-----|--------|------------|
| 1 | P0 | Model ML (ORT MI-GAN, LiteRT GPU face_detector/face_landmarks) không bao giờ được giải phóng; ORT dùng CPU arena mặc định | Editor đứng yên: Native Heap 549–617 MB, không giảm sau khi ép GC; lúc xoá vật thể lên tới 914 MB, PSS 1.31 GB; am_kill ghi PSS 1,231,168 KB |
| 2 | P0 | Mở editor chạy lại toàn bộ bước retouch đã lưu, kể cả MI-GAN và model mặt, ngay khi mở | Process editor mới: Native 815 MB, PSS 1.08 GB, mở tới frame đầu mất 9059 ms; log có `migan`, `face_detector`, `face_landmarks` được nạp trước `engine ready` |
| 3 | P1 | Lưới so sánh retouch trong editor không recycle các kết quả không được chọn (tối đa 4 bản copy proxy) | `RetouchPanel.kt:129-134`, `141` |
| 4 | P1 | Đỉnh bộ nhớ khi decode/export RAW toàn độ phân giải | `SourceLoader.kt:188-220`, `Exporter.kt:102-140` |
| 5 | P2 | Bitmap trung gian không recycle trên đường decode và render | `SourceLoader.kt:153,164`; `DevelopEngine.kt:96,135,269,284`; `DevelopActivity.kt:492,503` |
| 6 | P2 | Mỗi lần infer LiteRT/ORT đều cấp phát direct buffer mới; `CompatibilityList` không được đóng | `LiteRtBackend.kt:36,78,92`; `OrtBackend.kt:43-45,73` |
| 7 | P2 | `LookSurfaceProcessor.release()` gọi `eglTerminate` trên display mặc định dùng chung cả process | `LookSurfaceProcessor.kt:77` |
| 8 | P3 | Coroutine scope tách rời khi mở editor; cache LUT/AI-mask không giới hạn | `DevelopActivity.kt:384`; `LooksRepository.kt:33`; `AiMaskProvider.kt:30` |

Không thấy leak Activity/Context: `Activities` luôn ở mức 1–2, `AppContexts` 5–8, mọi listener sensor/orientation/thermal đều được hủy đăng ký (xem mục "Đã kiểm, ổn").

## Số liệu động (dumpsys meminfo, KB)

Camera (`CameraActivity`, preview đứng yên, process mới):
```
cam-start   java=68280  native=56412   gfx=32416  pss=281104 acts=2
cam-idle1   java=105116 native=74828   gfx=90352  pss=394420 acts=2
openclose12 java=44948  native=280564  gfx=4108   pss=461346 acts=1
idle0..3    native 105488 -> 272868 -> 287232 -> 270596 (preview đứng yên)
```
Native dao động mạnh, 56→287 MB, ngay cả khi preview đứng yên. Đây là dấu hiệu churn bitmap mỗi frame (`viewFinder.bitmap` trong `AiController.kt:118`, `ProModeUi.kt:293`, `PreviewBlurView`) chờ GC thu hồi, chưa phải leak giữ lại. Độ tin cậy trung bình, vì phiên bị agent khác chen vào (xem Hạn chế).

Editor (`DevelopActivity`, đo thụ động trên phiên retouch của agent khác: blemish, skin, redeye, teeth, eyes, geometry, object removal):
```
passive-editor1  java=79016  native=602556 gfx=166764 pss=966402
passive-editor8  java=32124  native=549228 gfx=111604 pss=813028
editor-preGC     java=118516 native=617512 gfx=180828 pss=1037290
editor-postGC2   java=99868  native=617288 gfx=180852 pss=1018509   <- ép GC (kill -10), native không giảm
watch3           java=94016  native=914476 gfx=183716 pss=1313130   <- lúc chạy object removal
new-editor       java=49908  native=814916 gfx=95848  pss=1077445   <- process mới, ngay sau khi mở ảnh có stack retouch
am_kill ... dev.opencamera.app.dev ... 1231168                       <- PSS lúc bị dừng
```
Bảng tách chi tiết (editor-preGC): Native Heap 617 MB, Gfx dev 106 MB, EGL mtrack 74 MB, Dalvik 93 MB, tổng PSS 1018 MB.

## Phát hiện chi tiết

### 1. Model ML tồn tại suốt đời process, ORT arena phình theo peak — P0
- Bằng chứng: `ml/src/main/java/dev/opencamera/ml/MlRuntime.kt:116-123`. `release`/`releaseAll` chỉ được gọi từ `AiSettingsFragment.kt:34` và từ setter `preference` (dòng 53). Không có `onTrimMemory`/`ComponentCallbacks2` nào trong toàn repo. `MlRuntime` là singleton (dòng 223-228), nên `loaded` giữ mọi session cho tới khi process chết. `OrtBackend.kt:30-39` tạo `SessionOptions` mà không tắt CPU arena hay memory pattern; arena của ORT giữ peak và không trả lại. Ngoài ra `OrtBackend.kt:43-45` copy toàn bộ model sang `ByteArray`, tạo thêm một bản copy trên heap. LiteRT GPU delegate giữ thêm bộ nhớ GL/EGL (khớp với EGL mtrack 74 MB).
- Số đo: native editor 617 MB không giảm sau GC; MI-GAN cộng hai model mặt được nạp trong cùng process.
- Tác động: process editor ở mức 0.8–1.3 GB PSS, nguy cơ bị LMK giết hoặc OOM khi export, và đẩy app nền khác ra.
- Sửa:
  - (a) Gọi `MlRuntime.releaseAll()` (hoặc release theo model) trong `onTrimMemory(TRIM_MEMORY_UI_HIDDEN / RUNNING_LOW)` và khi thoát editor hoặc màn retouch.
  - (b) Thêm cơ chế tự release model sau N giây không dùng (idle timeout) trên executor của từng model.
  - (c) Với ORT, đặt `options.setCPUArenaAllocator(false)` và `setMemoryPatternOptimization(false)` cho model kích thước biến đổi (MI-GAN), rồi đo lại.
  - (d) Dùng `ModelSource.Path` thay vì copy `ByteArray`.
- Ưu tiên: P0.

### 2. Mở editor replay toàn bộ retouch, gồm model nặng — P0
- Bằng chứng: `DevelopActivity.kt:416-418` gọi `applyToolsAsync` khi mở ảnh; `463-495` chạy `ToolRegistry.applyAll` trên toàn bộ `stack.tools` (với object removal là MI-GAN). Log của process 22490 cho thấy `migan` nạp lúc 17:33:23, `face_detector` lúc 17:33:27, `face_landmarks` lúc 17:33:29, rồi tới `engine ready at 8867 ms`.
- Tác động: mở lại một ảnh đã retouch tốn khoảng 9 s và khoảng 800 MB native trước khi người dùng làm gì.
- Sửa: cache kết quả raster của stack retouch (PNG hoặc patch cạnh `assetDir`, theo hash của stack và kích thước proxy) và nạp lại thay vì chạy model. Chỉ replay khi cache thiếu hoặc stack đổi, và release model ngay sau khi replay xong.
- Ưu tiên: P0.

### 3. Lưới so sánh retouch trong editor rò bitmap tới khi GC chạy — P1
- Bằng chứng: `app/.../develop/ui/compose/RetouchPanel.kt:129-134`. `onPick` chỉ commit `r.bitmap` mà không recycle các `resolved[k]` còn lại; `onCancel` không recycle kết quả nào. Dòng 141 copy `src` cho mỗi phương pháp (tối đa 4), và bản copy bị bỏ lại khi tool lỗi. Màn `RetouchActivity.kt:505` thì có recycle đúng; bản editor bị thiếu.
- Tác động: proxy 1836x2560 ARGB = 18.8 MB, nên tối đa khoảng 56 MB native thừa mỗi lần so sánh, cộng dồn nếu người dùng so sánh liên tiếp trước khi GC chạy.
- Sửa: khi pick, recycle mọi `resolved[k]` với `k != i`; khi cancel hoặc job bị hủy, recycle toàn bộ và xoá `grid.results`. Trong `runTool`/`compare`, recycle bản copy nếu `apply` ném lỗi.
- Ưu tiên: P1.

### 4. Đỉnh bộ nhớ RAW 16 MP — P1
- Bằng chứng:
  - `SourceLoader.kt:188-196` (`developCameraRaw`, `half=false` khi export): LibRaw trả về `ShortArray` w·h·3, khoảng 96 MB trên Java heap; cộng direct buffer w·h·8 (`linearBitmap`, 128 MB); cộng bitmap RGBA_F16 (128 MB); cộng bản xoay trong `orient` (128 MB thêm, tạm thời). Đỉnh khoảng 400–500 MB, trước khi `Exporter` (`Exporter.kt:102-140`) cấp phát thêm bitmap `out`, `proxy` và `IntArray` full-size ở nhánh CPU fallback (`134`).
  - `developDng` (`170`) dùng `readBytes()` đọc nguyên file DNG vào heap.
  - `loadFull` chỉ áp `MAX_PIXELS` sau khi decode xong (`135-140`).
- Tác động: OOM hoặc LMK khi export RAW, nhất là khi model ở mục 1 vẫn đang nằm trong bộ nhớ.
- Sửa: truyền `maxPixels` vào decoder (LibRaw `half_size` hoặc downscale khi đổi sang half-float); ghi thẳng vào bitmap bằng `copyPixelsFromBuffer` theo dải; xoay khi chuyển đổi thay vì tạo bitmap mới; release `ShortArray` sớm (set null trước khi tạo bitmap). Release model ML trước khi export.
- Ưu tiên: P1.

### 5. Bitmap trung gian không recycle — P2
- `SourceLoader.kt:153`: bản gốc không ARGB không được recycle sau `copy`. `164`: bản `bmp` chưa xoay không được recycle, nên mỗi lần decode raster full-res tồn tại tạm hai bản.
- `DevelopEngine.kt:96` (bitmap prewarm), `135` (thumbnail `small` sau khi upload), `269` (`readScaled` cho histogram, khoảng mỗi 150 ms khi kéo slider), `284` (frame CPU mỗi lần render).
- `DevelopActivity.kt:492/503`: `toolProxy` cũ không được recycle khi thay bằng bản mới (sau khi `engine.open` đã chuyển sang bản mới).
- `DevelopEngine.open` (`110`) tạo `IntArray` proxy mới (18.8 MB Java) mỗi bước retouch.
- Tác động: churn native và Java, GC dồn dập; khớp với Java heap dao động 31→118 MB trong editor.
- Sửa: recycle tại các điểm trên, hoặc dùng lại buffer (`IntArray` proxy nếu cùng kích thước).
- Ưu tiên: P2.

### 6. Cấp phát mỗi lần infer, CompatibilityList không đóng — P2
- `LiteRtBackend.kt:78` và `92`: `allocateDirect` cho mọi input và output ở mỗi lần `run`. Direct buffer chỉ được giải phóng khi GC chạy, nên live portrait và scene detection tạo áp lực native ẩn.
- `LiteRtBackend.kt:36`: `CompatibilityList()` không bao giờ `close()`; đối tượng giữ tài nguyên native.
- `OrtBackend.kt:73`: `allocateDirect` mỗi lần infer cho input uint8.
- Sửa: cache buffer theo session (cùng shape thì dùng lại); dùng `CompatibilityList().use { }`.
- Ưu tiên: P2.

### 7. `eglTerminate` trên display dùng chung — P2 (độ ổn định nhiều hơn leak)
- `pipeline/.../looks/LookSurfaceProcessor.kt:77`. `EGL_DEFAULT_DISPLAY` được dùng chung trong process; nếu `GlDevelop` hoặc một processor khác còn sống (ví dụ khi đổi look, hoặc `LookController.release()` chạy lúc process vẫn còn editor), `eglTerminate` có thể làm hỏng context của chúng hoặc buộc khởi tạo lại.
- Sửa: bỏ `eglTerminate` (`GlDevelop.release` đã đúng cách: chỉ `eglReleaseThread`).
- Ưu tiên: P2.

### 8. Rủi ro nhỏ — P3
- `DevelopActivity.kt:384`: `CoroutineScope(Dispatchers.Default).async { loader.loadProxy(...) }` không gắn lifecycle. Thoát editor sớm thì job vẫn decode proxy và giữ `loader`, tức là giữ Activity, tới khi xong. Sửa: dùng `async` trong `coroutineScope` hiện có.
- `LooksRepository.kt:33`: HashMap LUT không giới hạn. Look có sẵn khoảng 12 × 431 KB (33³), ổn; user look thì không giới hạn. Sửa: dùng LruCache theo byte.
- `AiMaskProvider.kt:30`: cache mask float trên mỗi Activity (≤512², khoảng 1 MB/mask), không giới hạn trong phiên. Chấp nhận được; có thể giới hạn bằng LRU.
- Native JNI: không có `Get*ArrayElements` nào thiếu `Release`, lock/unlock bitmap đều cân bằng (`retouch_jni.cpp:30-35`, `ai_ops.cpp:37-60`, `look_apply.cpp:148-170`), `Burst` có `nativeReleaseBurst` và được dùng qua `use` (`MultiFrameCaptureController.kt:275,357,418`). `libraw_jni.cpp` giải phóng `libraw_close` và `libraw_dcraw_clear_mem` đầy đủ.

## Đã kiểm, ổn
- Sensor, orientation và thermal: `AssistController.kt:65-92` (theo resume/pause), `MotionMeter` (`CameraActivity.kt:558-559`), `GyroSensor` và `OrientationEventListener` trong `VideoModesActivity.kt:226-259`, `CameraViewModel.kt:158-162` (`awaitClose`).
- `CameraViewModel.onCleared` (`1181-1190`) unbind controller, release LookController, MultiFrame và sounds.
- `OverlayHost.detach` hủy composition, lifecycle owner và scope của Recomposer; các singleton (`SkinRepository`, `LooksRepository`, `MlRuntime`) đều giữ `applicationContext`.
- `MultiFrameCaptureController`: ImageProxy RAW đóng trong `finally` (`352`), burst đóng khi timeout hoặc lỗi; `framesThatFit` giới hạn theo `availMem`.
- Đếm object trong mọi lần đo: `Activities` 1–2, `AppContexts` 5–8. Không thấy Activity tích luỹ sau 15 vòng mở/đóng camera.

## Hạn chế
- Gauguin bị một agent khác dùng liên tục trong suốt phiên audit (force-stop và mở `DevelopActivity` khoảng mỗi 30–45 s; xem `am_kill ... due to from pid 18552/19184/20345/21402/22683`). Vì vậy các vòng lặp 10–20 lần cho từng kịch bản (đổi mode, skin Glass↔Origin, look, HDR/RAW, export) không đo sạch được. Số liệu editor là đo thụ động trên phiên retouch của agent đó, chỉ đọc, cộng thêm GC qua `kill -10`.
- Không build hay cài LeakCanary vì máy không có cửa sổ trống để chạy vòng lặp; không có bản audit nào cần gỡ. Đã force-stop mọi package `dev.opencamera.app*` và nhấn Home khi xong.
- Chưa tách được native heap giữa ORT arena, LiteRT delegate và bitmap. Cần thêm `setCPUArenaAllocator(false)` hoặc `releaseAll()` trong một bản debug rồi đo lại để định lượng mục 1.

## Bước tiếp theo đề xuất
1. Sửa mục 1 và 2, rồi đo lại editor theo kịch bản: mở ảnh có stack retouch → object removal → export → back, 10 vòng.
2. Khi có cửa sổ dùng máy riêng: chạy LeakCanary debug build cho các vòng camera (mode, skin, look, HDR/RAW).
