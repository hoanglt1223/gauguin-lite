# Audit main thread / jank / ANR — Open Camera

Ngày: 2026-11-11 (Asia/Saigon). Chỉ đọc code, không sửa file nào.
Phạm vi: `D:\Projects\open-camera` (main). Main đã chứa code của ui-skins (`OverlayHost`, `CameraOverlay`, `SkinRepository`), phase11 (`RetouchActivity`) và phase12 (`develop/*`). Grep các worktree `open-camera-wt\{ui-skins,phase12-editor,phase11-retouch}` cho thấy cùng các điểm nóng (`VendorBridge.commit()`, `StillProcessor` decode...), không có điểm block mới nào riêng ở worktree. Số dòng bên dưới tính theo main.

Chi phí ước lượng là số liệu điển hình trên SoC tầm Snapdragon 8 Gen x, chưa đo trên máy. Phải xác nhận bằng Perfetto/StrictMode (xem mục 0).

## 0. Tooling: không có StrictMode, không có ANR watchdog — P1

- Grep `StrictMode|ANRWatchDog` trên toàn repo: 0 kết quả.
- Fix: trong `ApertureApplication.onCreate()` (chỉ build debug) bật
  `StrictMode.setThreadPolicy(ThreadPolicy.Builder().detectDiskReads().detectDiskWrites().detectCustomSlowCalls().penaltyLog().build())`.
  Thêm một watchdog nhẹ: thread daemon cứ 1 s post một `Runnable` lên main `Handler`, nếu 2 s chưa chạy thì log `Looper.getMainLooper().thread.stackTrace`. Hoặc dùng `ApplicationExitInfo` (API 30+) để đọc ANR trace ở lần mở sau.

## 1. Bảng tổng hợp

| # | Ưu tiên | Vị trí | Bị chặn bởi gì | Triệu chứng |
|---|---|---|---|---|
| 1 | P0 | CameraActivity.kt:1771-1779 + collectors :1183,1191,1198,1205,1210,1214,1220,2466,2670 | Bật tắt một tính năng là `unbind()` rồi bind lại toàn bộ trên main | Bấm Flash/Night/Creative/Motion/Pre-shot/Look/Pro bị khựng, preview mờ đen |
| 2 | P0 | ai/AiController.kt:118 | `viewFinder.bitmap` (PixelCopy full size, đồng bộ) chạy trên main, mỗi 66 ms | Bật Live Portrait thì cả UI giật; scene/composition giật mỗi 1-1.5 s |
| 3 | P0 | video/VideoModesActivity.kt:294-418, 347, 1043-1045, 316-328 | Chuỗi bind fallback, `MediaCodecList`, probe đều chạy trên main mỗi lần đổi option | Đổi mode/option trong "More modes" đơ 0.3-2 s, có thể ANR |
| 4 | P0 | video/VideoModesActivity.kt:922-926 | `LooksRepository.params()` (parse `.cube`) trên main | Bấm stop Pro video LOG thì app đơ (vài giây khi cache trống) |
| 5 | P1 | CameraActivity.kt:3112-3117 | `PreviewView.bitmap` full size + scale trên main | Mở sheet Glass (More/Settings) bị trễ |
| 6 | P1 | CameraActivity.kt:2794 + :3046, :3051-3054; CameraOverlay.kt:151 | Mỗi lần `uiState` đổi là recompose cả overlay | Pinch zoom và lúc quay video thấy giật, các nút phản hồi chậm |
| 7 | P1 | processing/ProcessingService.kt:63, 91-118, 282; ProcessingQueue.kt:122,148,152; LookController.kt:142; CameraActivity.kt:1657 | SQLite quét cả bảng trên main, poll mỗi 250 ms | Chụp liên tiếp hoặc burst khựng, mở app chậm |
| 8 | P1 | ui/views/CapturePreviewLayout.kt:109,114; CameraActivity.kt:2413 | Decode JPEG full-res trên main | Chụp qua intent (app khác gọi camera): màn xác nhận đơ 0.3-1 s, có thể OOM |
| 9 | P1 | processing/LooksRepository.kt:36-45; CameraViewModel.kt:234,1102; CameraActivity.kt:2445 | Parse JSON từ asset và đọc thư mục trên main lúc cold start | Mở app chậm, onResume khựng |
| 10 | P1 | CameraActivity.kt:849 | Bind đầu tiên chờ preload LUT tối đa 1200 ms | Preview lên chậm tới 1.2 s khi đang chọn look |
| 11 | P1 | CameraViewModel.kt:2312-2347, 1226 | Tap bị bỏ qua khi state khác IDLE (tryLock gần như vô dụng) | Bấm flip/aspect/quality "không ăn", người dùng cảm nhận là lag |
| 12 | P1 | video/GyroSensor.kt:34 | Callback gyro 200 Hz chạy trên main looper | Hyperlapse/Panorama giật UI |
| 13 | P2 | vendor-bridge/VendorBridge.kt:32,65; CameraActivity.kt:2195 | `SharedPreferences.commit()` trên main mỗi lần bind | Thêm 5-30 ms mỗi lần bind trên máy có vendor tag |
| 14 | P2 | repositories/CameraRepository.kt:43,50,111; CameraActivity.kt:2071 | `Future.get()` trong lazy, có thể bị gọi lần đầu từ main | Có rủi ro ANR nếu thứ tự init thay đổi |
| 15 | P2 | CameraActivity.kt:2814, 2957-2985 | `syncLegacyControls()` chạy ở mỗi lần global layout | Thêm tải nền mỗi frame có layout |
| 16 | P2 | capture/MotionMeter.kt:31 | Gyro 50 Hz trên main, `TripodDetector` bị đọc chéo thread | Tải nhỏ, có data race |
| 17 | P2 | develop/ui/compose/EditorScreen.kt:446,490-491; DevelopDialogs.kt:150,190-193; DevelopActivity.kt:95 | I/O file preset trong composition và trên main | Mở panel preset trong Editor bị khựng |
| 18 | P2 | modes/ColorMatchActivity.kt:284; video/VideoModesActivity.kt:466 | Build chuỗi `CubeWriter` và `getCameraCharacteristics` trên main | Khựng nhỏ |
| 19 | P2 | CameraActivity.kt:1898 + 1862-1894 | `require(IDLE)` ném lỗi, rơi vào nhánh fallback baseline và đánh dấu OEM failed nhầm | Rebind 2-3 lần kèm toast "fallback" sai |

## 2. Chi tiết

### #1 P0 — Bật tắt tính năng là rebind toàn bộ camera trên main
- **Ở đâu:** `rebindIfAnalysisChanged()` (CameraActivity.kt:1771) được gọi từ collectors của `multiFrame.setting` (:1183), `creative.mode` (:1191), `motionPhoto` (:1198), `preShot` (:1205), **`flashMode` (:1210)**, `configCap` (:1214), `fullResNotice` (:1220), `lookId` (:2466) và `onManualExposureChanged` của Pro (:2670). Khi `boundStreamsKey` đổi, hàm gọi `bindCameraUseCases()` và chạy đồng bộ trên main: `previewBlurView.freeze()` (:1903), `cameraController.unbind()` (:1907), dựng `ResolutionSelector`, `getExtensionEnabledCameraSelector`, rồi `setEnabledUseCases()` + `bindToLifecycle()` (:1742-1743, :2090-2091). `bindWithFallback` có thể thử 3-4 bước liên tiếp.
- **Chi phí:** mỗi `bindToLifecycle` của CameraX tính surface combination và cấu hình use case trên main, khoảng 30-150 ms. Mỗi bước fallback thất bại cộng thêm chừng đó. Đóng/mở session camera (bất đồng bộ) làm preview đen/mờ thêm 300-1000 ms. `boundStreamsKey` gọi `desiredStreamConfig()`, hàm này gọi `resolveExtensionMode()` hai lần (đọc prefs) và `lookController.hasLook` (cấp phát list descriptors).
- **Triệu chứng:** đúng phàn nàn của người dùng: bấm Flash, Night/HDR, Creative, Motion photo, Pre-shot, chọn Look, chỉnh Pro thủ công thì UI khựng rồi preview mờ gần 1 s.
- **Fix:**
  1. Bỏ `flashMode` khỏi danh sách trigger. Hoặc chỉ rebind khi chuyển giữa ON/SCREEN và các giá trị còn lại (`StreamPolicy` chỉ quan tâm `flashOff`). Đặt `distinctUntilChanged { a, b -> a.isForced() == b.isForced() }` trước `collectLatest`.
  2. Gộp mọi trigger vào một flow có debounce, để chạm nhanh nhiều lần chỉ rebind một lần:
     ```kotlin
     merge(mf.setting, creative.mode, motion, preShot, flash, cap, lookId, proChanges)
         .map { boundStreamsKey(currentConfig) }.distinctUntilChanged()
         .debounce(150).collectLatest { awaitFrame(); bindCameraUseCases(cfg) }
     ```
  3. Cập nhật UI (text nút, `uiState`) ngay khi tap, rồi `awaitFrame()` trước khi bind, như collector `cameraConfiguration` ở :852 đang làm.
  4. Về lâu dài: giữ ImageAnalysis luôn bind ở độ phân giải thấp cho motion/pre-shot và chỉ đổi analyzer. Khi đó chỉ full-res mới cần rebind.

### #2 P0 — Live AI lấy bitmap preview trên main
- **Ở đâu:** `AiController.loop()` chạy trong `lifecycleScope` (Main), dòng 118 `viewFinder.bitmap`. `PreviewView.getBitmap()` ở PERFORMANCE mode (layout không đặt `implementationMode`, `activity_camera.xml:16`) dùng `PixelCopy` đồng bộ trên main, cấp phát bitmap full size (1080x2400 ARGB khoảng 10 MB). Ở COMPATIBLE mode thì là `TextureView.getBitmap()` full size, cũng readback GPU.
- **Chi phí:** 8-30 ms mỗi lần, chu kỳ `LIVE_FRAME_MS = 66` khi bật Live Portrait (khoảng 15 lần/s), tức 15-45% thời gian main thread. GC churn khoảng 150 MB/s. Scene detection: 1 lần/s. Composition: 1 lần/1.5 s.
- **Triệu chứng:** bật Portrait live preview thì mọi thao tác (zoom, nút, animation) giật. Kể cả khi tắt Portrait, scene chip (bật mặc định) vẫn gây khựng nhỏ mỗi giây.
- **Fix:** lấy frame từ `ImageAnalysis` (đã có `multiFrame.analysisExecutor`) ở 480 px (`LIVE_LONG_SIDE`). Nếu cần giữ PreviewView thì làm như `PreviewBlurView.freeze()`: `PixelCopy.request(surfaceView, smallBitmap, cb, bgHandler)` với bitmap 480 px tái sử dụng, callback chạy trên `HandlerThread`. Sau đó chuyển `withContext(Default)` thành pipeline chạy hoàn toàn ngoài main, chỉ `post` kết quả về.

### #3 P0 — VideoModesActivity bind, probe và fallback đều trên main
- **Ở đâu:**
  - `setupCamera()` (:274-290, chạy trong `lifecycleScope` Main): `VideoCapsProbe.facts()` (`Recorder.getVideoCapabilities`) và `VideoCapsProbe.caps()`.
  - `bindMode()` (:294): `unbindAll()`, sau đó `bindRecorder()` lặp qua `RecordPlan.attempts` (:394-416), mỗi attempt gọi `bindToLifecycle` rồi `unbindAll` nếu hỏng. `bindSlowMotion()` (:420-461) có thể chạy high-speed bind, rồi `HighSpeedSession.configs` (:466, `getCameraCharacteristics`), rồi lại toàn bộ `bindRecorder`.
  - `hevcAvailable()` (:347-351) tạo `MediaCodecList(REGULAR_CODECS)` **mỗi lần** `bindRecorder`, mất 20-100 ms.
  - `update(rebind = true)` (:1043-1045): mỗi tap option (quality/fps/HDR/LOG/stabilization) gọi `settings.save()` rồi `bindMode()`.
  - `dropCurrentMode()` (:316-328) gọi đệ quy `bindMode()` cho mode tiếp theo, vẫn đồng bộ trên main. Máy yếu có thể ANR (>5 s).
- **Chi phí:** 100-400 ms mỗi lần bind thành công. Chuỗi fallback 4-6 attempt cộng mode-drop có thể vượt 2-5 s.
- **Triệu chứng:** "More modes" vào chậm, đổi chất lượng/fps đơ, Slow motion có thể treo.
- **Fix:** cache `hevcAvailable` vào biến `by lazy` và tính trên `Dispatchers.Default` lúc `onCreate`. Chuyển `VideoCapsProbe.facts/caps` sang `withContext(Default)` (CameraActivity.kt:2829 đã làm vậy). Giữa các attempt bind thì `yield()`/`awaitFrame()` để main còn vẽ. Debounce `update(rebind)` 200 ms. Đổi `dropCurrentMode` từ đệ quy sang vòng lặp có `awaitFrame()`.

### #4 P0 — Parse LUT trên main khi kết thúc Pro video LOG
- **Ở đâu:** `postProcess()` (:886-919) chạy `job()` trong `lifecycleScope.launch` (Main). `proJob()` (:922-926) gọi `LooksRepository.get(this).params(...)` ngay trên main. Chính KDoc của `params()` ghi "Blocking; call off the main thread" (LooksRepository.kt:56), và comment ở :67 nói parse `.cube` mất vài giây. Thêm vào đó là `LogProfile.gradeCube()`.
- **Triệu chứng:** dừng quay Pro video có LOG thì app đơ, cache LUT trống có thể ANR.
- **Fix:** `val job = withContext(Dispatchers.IO) { proJob() }` trước `runPost`. Hoặc đổi `proJob` thành `suspend` và bọc phần `params` bằng `withContext(IO)`.

### #5 P1 — `previewSnapshot()` full size trên main mỗi lần mở sheet
- **Ở đâu:** CameraActivity.kt:3112-3117, gọi từ `Sheets.kt:167` bên trong `LaunchedEffect` (Main). `viewFinder.bitmap` full size rồi `createScaledBitmap(1/4)`.
- **Chi phí:** 15-40 ms cộng với cấp phát 10 MB, ngay frame đầu của animation mở sheet.
- **Fix:** dùng lại logic `PreviewBlurView.freeze()`: `PixelCopy` bất đồng bộ vào bitmap 1/4 size. Đổi API thành `suspend fun previewSnapshot(): Bitmap?` dựa trên `suspendCancellableCoroutine` và `PixelCopy.request(..., bgHandler)`.

### #6 P1 — Recomposition storm của overlay Compose
- **Ở đâu:** `val s by uiState.collectAsState()` ở root (CameraActivity.kt:2794), sau đó `CameraOverlay(s, ...)` truyền nguyên `state` cho `TopBar`, `LensRow`, `ModeCarousel`, `BottomRow`, `Sheets`, `PreviewChrome`... (CameraOverlay.kt:151-216). `CameraUiState` là data class chứa `Map`/`List`, không có `@Immutable` (CameraUiState.kt:80-119). Mỗi `copy()` tạo instance mới nên mọi composable con nhận `state` đều recompose.
- **Nguồn emit tần số cao:** `zoomState` (:3051, khoảng 60 Hz khi pinch), `videoRecordingDuration` (:3046), `screenRotation` (:3042), `previewRect` (:2816), `syncLegacyControls` (:2814).
- **Chi phí:** 4-12 ms mỗi lần recompose cả cây. Khi pinch zoom hoặc đang quay dễ vượt budget 16 ms.
- **Fix:** tách state theo nhóm. Truyền lambda/`State<T>` cho phần đổi nhanh, ví dụ `zoomRatio: () -> Float`, đọc trong `graphicsLayer`/`drawBehind`/`Text` của riêng `ZoomRing`. Đánh dấu `@Immutable` cho `CameraUiState`, `LegacyControl`, `LensChipUi`, `LookItem` và dùng `kotlinx.collections.immutable`. Đưa `recordingNanos` ra một `StateFlow` riêng chỉ `RecordingPill` collect. Trước khi sửa, bật Compose compiler metrics để xem composable nào restartable nhưng không skippable.

### #7 P1 — Hàng đợi SQLite chạy trên main thread của app
- **Ở đâu:**
  - `ProcessingService.scope = Dispatchers.Main.immediate` (:63). `runQueue()` gọi `queue.recover()`, `claimNext()`, `nextDueAt()`, `markFailed()` và `pendingCount()` trên main. Vòng `delay(BURST_POLL_MS = 250)` (:98-103) gọi `claimNext()` cộng `nextDueAt()` 4 lần/s suốt thời gian burst đang merge.
  - `ProcessingQueue.claimNext/pendingCount/nextDueAt` dùng `store.all()`, tức quét cả bảng và materialize mọi row, kể cả DONE/FAILED được giữ 24 h (`keepFinishedMs`). Chụp nhiều trong ngày thì bảng lớn dần.
  - `LookController.onPhotoSaved()` (:142) gọi `ProcessingService.enqueue`: `findBySource` + `insert` + `startForegroundService` trên main sau **mỗi** ảnh. Callback `onImageSaved` chạy trên `getMainExecutor` (CameraViewModel.kt:1397/1404).
  - `ProcessingService.resumeIfPending()` (CameraActivity.kt:1657) chạy lúc startup trên main: mở DB (`getWritableDatabase`, có thể kèm migrate), quét thư mục burst orphan, `pendingCount()`.
- **Chi phí:** 2-20 ms mỗi call, tăng theo số row. Mở DB lần đầu 10-50 ms.
- **Fix:** đổi scope thành `Dispatchers.Default.limitedParallelism(1)` (chuỗi đã được serialize bởi `@Synchronized`), chỉ `startForeground`/`notify` mới cần main. Thêm query có `WHERE state IN (...) ORDER BY next_attempt_at LIMIT 1` và `SELECT COUNT(*)` thay cho `all()`. Đánh index `(state, next_attempt_at)`. Trong `onPhotoSaved`, bọc `enqueue` bằng `scope.launch(Dispatchers.IO)`. Chạy `resumeIfPending` trong `lifecycleScope.launch(Dispatchers.IO)`.

### #8 P1 — Decode JPEG full-res trên main (single-capture intent)
- **Ở đâu:** `CapturePreviewLayout.startPreview()`: `imageView.setImageURI(uri)` (:109) decode full ảnh 12-50 MP trên main. `BitmapFactory.decodeStream(inputStream)` (:114) full size. `CameraActivity.kt:2413` decode full size chỉ để thu xuống 256 px.
- **Chi phí:** 200-800 ms mỗi lần, có thể OOM với 50 MP (khoảng 200 MB ARGB).
- **Fix:** decode trên IO với `inSampleSize` (theo kích thước view, hoặc 256 cho inline result) qua `ImageDecoder.setTargetSize`. Có thể dùng `coil3` (đã là dependency, CameraActivity.kt:2244) cho `imageView`.

### #9 P1 — LooksRepository làm I/O khi init/resume trên main
- **Ở đâu:** `builtIn` lazy (LooksRepository.kt:36-39) đọc `index.json` cộng N file `look.json` từ assets và parse JSON. `descriptors` gọi `userLooks.list()` ở lần đầu (đọc thư mục). Lần chạm đầu tiên rơi vào main: `CameraViewModel.init` → `lookController.preload()` (:1102) → `repository.descriptor()`. Sau đó còn `refreshLookPicker()` trong `onResume` (CameraActivity.kt:2445), `hasLook` trong `desiredStreamConfig` (CameraViewModel.kt:234) mỗi lần tính `boundStreamsKey`, và `PresetRepository { looks.descriptors }` trong Editor. Constructor còn gọi `getPackageInfo` (:30-32), một binder call.
- **Chi phí:** 10-60 ms cold start. Mỗi lần gọi `descriptors` về sau đều cấp phát list mới (`builtIn + user`).
- **Fix:** khởi tạo `LooksRepository` và tính `descriptors` trên IO trong `preload()`. Lưu kết quả vào `@Volatile val descriptorsCache: List`. `hasLook` chỉ so `prefs.lookId != NONE`.

### #10 P1 — Bind đầu tiên chờ preload LUT
- **Ở đâu:** CameraActivity.kt:849 `awaitPreload(LOOK_PRELOAD_WAIT_MS = 1200)`. Không block thread, nhưng chặn bind tới 1.2 s khi đang chọn look và cache LUT nhị phân chưa có (cài mới, update app vì `appVersion` nằm trong tên cache).
- **Fix:** giảm xuống khoảng 300 ms. Bind trước, khi LUT xong thì gắn effect: `setEffects` vẫn cần rebind, nhưng người dùng thấy preview sớm. Có thể sinh sẵn `.bin` cho built-in LUT lúc build để tránh parse `.cube` trên máy.

### #11 P1 — Tap bị bỏ qua: logic "rebind lock" và `canRestartCamera`
- **Ở đâu:** `updateConfiguration()` (CameraViewModel.kt:2312-2347) không suspend và chạy trọn trên main, nên `rebindMutex.tryLock()` gần như không bao giờ thất bại. Nhánh `pendingConfigurationUpdate` thực tế là dead code. Chỉ `setCameraMode` (:1749) truyền `retry`. Đường làm rơi tap thật sự là `canRestartCamera()` (:1226): khi `cameraState != IDLE` (đang chụp, merge burst, best-shot, timer) thì `flipCamera`, aspect, quality, fps, dynamic range... trả `false` mà không có phản hồi gì.
- **Triệu chứng:** người dùng bấm nhiều lần thấy "không ăn", rồi cảm nhận đó là lag.
- **Fix:** khi `!canRestartCamera()`, lưu request mới nhất (`pendingConfigurationUpdate = retry`) và chạy lại khi `cameraState` trở về IDLE (`cameraState.first { it == IDLE }`). Truyền `retry` cho mọi caller. Nếu không muốn hoãn thì ít nhất phải có haptic/toast báo "đang xử lý". Bỏ `Mutex` vì nó không bảo vệ gì trên một thread duy nhất.

### #12 P1 — Gyro 200 Hz chạy trên main looper
- **Ở đâu:** `GyroSensor.start()` (:34) gọi `registerListener(callback, s, 5_000)` không truyền `Handler`, nên callback chạy trên main looper. KDoc ở :15 ghi "on the sensor thread" là **sai**. Listener (VideoModesActivity.kt:142-145) gọi `gyroPath.add` và `sweepGuide.onGyro`.
- **Chi phí:** 200 message/s trên main, mỗi cái khoảng 20-50 µs cộng overhead looper. Làm frame bị trễ khi main đang bận.
- **Fix:** `HandlerThread("gyro")` rồi `registerListener(callback, s, 5_000, Handler(thread.looper))`. `gyroPath` đã được đọc từ thread post-process, nên cần thread-safe (copy-on-read hoặc lock nhỏ).

### #13 P2 — `commit()` đồng bộ trên main
- `VendorBridge.beginTagWrite()` (:65) gọi `commit()` (fsync) mỗi lần `applyVendorTags` (CameraActivity.kt:2195, coroutine Main) sau mỗi bind trên máy có vendor tag. Constructor (:32) commit khi init lazy từ ViewModel.
- `commit()` là cố ý (crash marker phải xuống đĩa trước khi ghi tag), nên giữ đồng bộ nhưng chuyển sang thread khác: `withContext(Dispatchers.IO) { bridge.beginTagWrite(...) }`. Thứ tự vẫn được đảm bảo vì coroutine chờ IO xong mới gọi `addCaptureRequestOptions`.

### #14 P2 — `Future.get()` trong lazy của CameraRepository
- `cameraProvider` (:41-44) gọi `ProcessCameraProvider.getInstance(context).get()`. `extensionsManager` (:49-51) gọi `getInstanceAsync(...).get()` (vendor extension init trên Xiaomi có thể mất 200-800 ms). Hiện tại hai lazy này được kích hoạt lần đầu trong flow `.flowOn(IO)`. `getExtensionEnabledCameraSelector` gọi từ main (CameraActivity.kt:2071) thường đã được init, nhưng `lazy` là synchronized: nếu IO đang init dở thì main phải chờ. Lời gọi đó lại có IPC tới vendor extension service, 5-50 ms mỗi lần bind.
- **Fix:** đổi sang `suspend` + `await()` (kotlinx-coroutines-guava đã có). Có thể cache selector theo `(cameraId, mode)`.

### #15 P2 — `syncLegacyControls()` trên mọi global layout
- CameraActivity.kt:2814 `addOnGlobalLayoutListener { syncLegacyControls() }` dựng map 14 phần tử, `text.toString()` rồi `uiState.update`. Global layout xảy ra rất thường xuyên (đồng hồ quay video, zoom text). `StateFlow` có dedupe theo `equals`, nhưng chi phí dựng map vẫn tốn mỗi lần.
- **Fix:** bỏ global-layout listener, chỉ dùng `sync()` đã có (:3010) ở những collectors cụ thể.

### #16 P2 — MotionMeter
- `registerListener(this, gyroscope, SENSOR_DELAY_GAME)` (MotionMeter.kt:31) chạy trên main, khoảng 50 Hz. `detector.state()` được đọc từ thread capture/merge, nên có data race trên `TripodDetector`.
- **Fix:** dùng `HandlerThread` giống #12 và cho `TripodDetector` publish snapshot `@Volatile`.

### #17 P2 — Editor (phase12): preset I/O trên main
- `EditorScreen.kt:446` gọi `remember { a.presets.all() }` ngay trong composition: `listFiles` + `readText` + decode từng preset (Presets.kt:150-152), cộng `looks.descriptors`.
- `EditorScreen.kt:490-491` và `DevelopDialogs.kt:150,190-193` (`save/rename/move/delete`) ghi file trên main.
- **Fix:** `produceState(emptyList()) { value = withContext(IO) { a.presets.all() } }`. Bọc các thao tác ghi bằng `lifecycleScope.launch(IO)`.
- `DevelopEngine` thì ổn: GL chạy trên `HandlerThread("develop-gl")`, các đoạn `synchronized` (:206, :224, :267) rất ngắn.

### #18 P2 — Linh tinh
- `ColorMatchActivity.kt:284`: `CubeWriter.write(bakedLut())` dựng chuỗi khoảng 36k dòng trên main (20-50 ms). Nên chuyển vào `withContext(IO)` ngay sau đó.
- `VideoModesActivity.kt:466`: `HighSpeedSession.configs()` gọi `getCameraCharacteristics` trên main (cache được).
- `VideoPostProcessor.kt:113`: `withContext(Dispatchers.Main)` hợp lệ vì Transformer cần Looper, nhưng `SingleColorLut.createFromCube` chạy trên main (vài ms). Chấp nhận được.
- `CameraViewModel.kt:1111-1116`: poll `zoomState` mỗi 500 ms trên main. Rẻ, nhưng có thể thay bằng `zoomState.asFlow()`.

### #19 P2 — `require(IDLE)` biến thành fallback sai
- Collector `cameraConfiguration` (CameraActivity.kt:847-853) chờ `awaitPreload` (≤1.2 s) cộng `awaitFrame()`. Nếu người dùng bấm chụp trong khoảng đó, `bindCameraUseCasesOrThrow` ném lỗi ở `require(... IDLE)` (:1898). Lỗi bị `bindCameraUseCases` bắt như "bind failed": gọi `markOemFailed` (OEM bị tắt cả session một cách nhầm), bind lại, rồi bind baseline kèm toast. Hậu quả là 2-3 lần bind thừa.
- **Fix:** kiểm tra `cameraState.value == IDLE` trước khi gọi. Nếu chưa IDLE thì `cameraState.first { it == IDLE }` rồi mới bind. Không để `IllegalArgumentException` từ precondition đi vào nhánh fallback.

## 3. Đã kiểm tra, không có vấn đề
- `runBlocking`, `GlobalScope`, `Thread.sleep`: không có trong code main.
- `LookSurfaceProcessor`: GL chạy trên `HandlerThread("LookGl")`, đúng.
- `PreviewBlurView.freeze()`: đã dùng `PixelCopy` bất đồng bộ ở 1/4 size, đúng (riêng nhánh TextureView vẫn đồng bộ nhưng nhỏ).
- QR analyzer chạy trên `cameraExecutor`. Multi-frame analyzer chạy trên `analysisExecutor`. `VideoModesActivity.analyze` chạy trên `analysisExecutor`. Không có analyzer nào gắn vào main executor.
- `MlRuntime.run()` dùng `Future.get` có timeout, nhưng mọi caller (AiController.analyze, BestShotCapture, AiSettingsFragment benchmark) đều đã ở `Dispatchers.Default/IO`.
- `DeviceProfileRepository.refresh()` tự chuyển sang `Dispatchers.Default`.
- `MotionPhoto.embed`, `BestShotCapture` scoring/save, `ColorMatchActivity` decode/build, `DevelopActivity` load: đều ở IO/Default.
- `SharedPreferences.apply()` (nhiều chỗ) không block trực tiếp. Nó chỉ chờ trong `QueuedWork` lúc `onPause`/`onStop`, ảnh hưởng nhỏ.

## 4. Thứ tự sửa đề xuất
1. #2 (AiController bitmap) và #4 (proJob LUT): sửa nhỏ, hiệu quả lớn.
2. #1: bỏ trigger flash, debounce, awaitFrame.
3. #3: cache `hevcAvailable`, probe chạy nền, debounce.
4. #7 và #5: chuyển queue khỏi main, PixelCopy bất đồng bộ.
5. #6: tách state Compose.
6. #0: bật StrictMode trong debug để bắt những chỗ còn sót.

## Câu hỏi chưa giải quyết
- Kotlin/Compose compiler có bật strong skipping không? Mức độ của #6 phụ thuộc vào đó. Grep `*.kts` không thấy cấu hình compose compiler.
- Cảnh báo "lag khi bấm" có tập trung ở màn chính (CameraActivity) hay ở "More modes" (VideoModesActivity)? Cần biết để chốt ưu tiên giữa #1/#2 và #3.
- Có cần giữ `commit()` của VendorBridge đồng bộ trước khi gửi request không? Nếu có thì chỉ chuyển sang IO như #13 đề xuất.
