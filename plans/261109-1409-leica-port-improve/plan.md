# Cải thiện Leica Port 8.9 trên gauguin

- Trạng thái: Phase 0 xong (2026-11-09). Phase 1 xong bằng cách 4 (vá APK, ký lại), Phase 4 xong (dịch tiếng Anh), Phase 2 xong một phần (ẩn màn thử HTP; chưa đo thời gian M9), Phase 3 chưa làm. Chi tiết: `plans/reports/leica-261109-1514-port-rebuild.md`.
- Bản dựng: `miui-ports/leica/out/leica-gauguin-en.apk`, dựng lại bằng `miui-ports/leica/scripts/build-leica-gauguin.ps1` từ APK gốc (giữ nguyên để quay lại).

- [x] Phase 1: profile gauguin trong `device-profiles.json` + tự chọn khi chưa lưu lựa chọn; chip 0.6x / 1x / 2x
- [ ] Phase 2: đo thời gian M9 / 完整版 M9 trên CPU (chưa làm); [x] ẩn nút màn thử QNN/HTP
- [ ] Phase 3: lọc logcat lỗi API A17 khi chụp Pro và quay video
- [x] Phase 4: dịch toàn bộ chuỗi tiếng Trung hiển thị (smali, resources, manifest, hộp thoại tác giả, danh mục máy)
- Gói: `com.kobbin.leica.wmrebuild`, versionName 8.0.0, versionCode 680020067, targetSdk 36, file `miui-ports/leica/leica-installed.apk` (532 MB, 32 file dex).
- Thiết bị: gauguin (`ro.product.model` = M2007J17G, `ro.product.brand` = Xiaomi), SDK 37, camera id 0 = IMX682 64MP, có ultrawide, macro, depth, không có tele.

## Công cụ và sản phẩm phụ của Phase 0

- Giải nén chỉ dex, `assets/*.json`, `lib/arm64-v8a` vào `miui-ports/leica/extract/` (không chạy gì từ đây).
- Bảng chuỗi dex: `miui-ports/leica/strings/classesN.txt`, tạo bằng `miui-ports/leica/tools/dexstrings.py`.
- jadx 1.5.3 tải về `miui-ports/leica/tools/bin/jadx/`. Mã dịch ngược: `miui-ports/leica/jadx-small/` (classes11 đến classes32, mã của người port, gói `com.codex.*`) và `miui-ports/leica/jadx-big/` (classes2, classes10, mã MIUI gốc).
- Các thư mục trên là dữ liệu phân tích cục bộ, không nên commit.

## Kết quả Phase 0

### 1. Nhận diện máy (机型适配)

- Không dùng `FeatureParser`, không đọc `device_features/*.xml`, không tra máy chủ. Mã port nằm trong `com.codex.modelmatch` (classes30.dex).
- `Profiles.init(Context)` đọc `assets/device-profiles.json` (schema 2, 261 profile: oppo 94, vivo 88, redmi 47, xiaomi 32, đời 2022 đến 2026). Không có profile nào cho gauguin, Mi 10T Lite hay Redmi Note 9 Pro 5G.
- `Profiles.detected()` so `Build.MODEL` và `Build.DEVICE` (đã chuẩn hóa về chữ thường, bỏ ký tự không phải chữ số) với trường `codes`, sau đó với `aliases`/`name`. `Profiles.matchesBrand()` dùng `Build.BRAND`. Không có prop `ro.product.*` riêng nào để giả mạo.
- Profile đang chọn lưu trong SharedPreferences `camera_model_profiles_v1`, khóa `selected` (giá trị là `id`, ví dụ `redmi/redmi-note-12-pro`). `Profiles.select()` ghi khóa này.
- Nút "机型适配" không phải popup: `ProfileUi.mount(Activity)` luôn gắn một `TextView` nổi 88x42dp ở góc trên phải, chữ `机型适配\n<trạng thái>` (`自动识别` khi chưa chọn profile). Bấm vào mở `ProfileUi.brands()` → `models()` → `confirm()` → `apply()`.
- Chuỗi `ro.product.device`/`FeatureParser` trong classes2.dex thuộc mã MIUI Camera gốc, không tham gia dựng chip của port.

### 2. Chip zoom 0.6, 0.6, 0.9, 0.9, 1x

- Chuỗi gọi: `CameraCatalog.scan(CameraManager)` → `Discovery.beforeBuild()` → `CameraCatalog.build()` → `ProfileRouter.apply(CameraCatalog)`; chip được vẽ bởi `FixedStops.render(ZoomRatioToggleView, float)` từ `RearLens.plan.lenses` (lớp `LensPlan`).
- Khi chưa chọn profile, `ProfileRouter.applyInternal()` thoát ngay (`status = "自动识别"`), nên danh sách chip chính là kết quả của `CameraCatalog.build()`.
- `CameraCatalog.build()` lấy mọi camera sau có `LENS_FACING = BACK`, không có capability MONOCHROME/SECURE và có stream YUV/JPEG/PRIVATE. Tỉ lệ mỗi ống = `equivalent(id) / equivalent(main)` làm tròn 0.1, với `equivalent = minFocal / đường chéo SENSOR_INFO_PHYSICAL_SIZE`. Chỉ khử trùng theo camera id, không khử trùng theo cảm biến, không loại macro/depth.
- Đối chiếu với `dumpsys media.camera` trên máy, khớp đúng 5 chip:

| id | Tiêu cự | Cảm biến (mm) | Tỉ lệ tính ra | Ghi chú |
|---|---|---|---|---|
| 0 | 5.43 | 7.40 x 5.56 | 1.0 | IMX682, main |
| 3 | 1.65 | 3.66 x 2.74 | 0.6 | ultrawide |
| 6 | 1.65 | 3.66 x 2.74 | 0.6 | ultrawide lộ thêm một id |
| 2 | 1.93 | 2.80 x 2.10 | 0.9 | macro hoặc depth, có BACKWARD_COMPATIBLE |
| 4 | 1.933 | 2.80 x 2.10 | 0.9 | macro hoặc depth, có BACKWARD_COMPATIBLE |
| 5 | logical [0, 4] | | | con đã được tính riêng |
| 1, 7 | | | | camera trước, bị loại |

- Khi chọn một profile, `ProfileRouter.applyInternal()` gom ứng viên, gán nhóm cho các id cùng tiêu cự và cùng diện tích cảm biến (id 3 và 6 thành một nhóm), rồi `MatchPolicy.assign()` khớp theo vai trò: `main` cần tỉ lệ 0.76 đến 1.28, `ultra` cần tỉ lệ dưới 0.88, `tele` cần trên 1.3, vai trò `macro` không bao giờ khớp. Ống 0.9 (macro/depth) không khớp ultra vì 0.9 ≥ 0.88 và thua id 0 ở vai main. Vì vậy một profile Xiaomi/Redmi chỉ có `ultra` + `main` sẽ cho 0.6x / 1x.
- Profile phù hợp có sẵn trong APK, ví dụ `redmi/redmi-note-12-pro` (ultra và main đều để "实机识别", tức đo trên máy) hoặc `xiaomi/xiaomi-12s` (ultra 15mm, main 24mm; gauguin đo được khoảng 15.6mm và 25.4mm, nằm trong sai số log 0.18).
- Mã riêng cho `nezha` (`CameraCatalog.direct()`, `NezhaLensConfig`) chỉ chạy khi `Build.DEVICE` là nezha, không ảnh hưởng gauguin.

### 3. Backend AI

- Phía Java không chọn HTP. QNN chỉ được gọi rõ ràng trong `com.codex.leicaapp.LegendExperimentActivity` (màn thử nghiệm, chạy `liblegend85_probe.so` với `ADSP_LIBRARY_PATH`).
- M9 (`com.codex.donor120.LeicaEngine.processM9`) tự lùi theo thứ tự: `LegendaryPostProcessor.processM9` (native) → `M9CpuFallback` (khi `allowCpuFallback`, `ModelPort` luôn truyền `true`) → `M9Distill` → `M9OrtFallback` (`assets/donor120/m9fb_styletrans_high.onnx`) → LUT thuần. Log tag `Engine`, chuỗi "M9 降级纯 LUT" nghĩa là mọi đường đã hỏng.
- 完整版 M9 (`com.codex.fullm9.M9Graph`, `M9CpuPolicy`) chỉ chạy ONNX Runtime FP32 trên CPU hoặc XNNPACK; `M9CpuPolicy.Config` ném lỗi nếu backend khác CPU/XNNPACK. Cấu hình đo được lưu ở `getNoBackupFilesDir()/fullm9-cpu-<tên>.properties`. Log tag `FullM9`, dòng `backend=... (FP32 CPU only)` và `style_ms=... color_ms=...`.
- Style transfer kiểu MIUI (`libmialgo_styletrans`, `libzxalgo_styletrans`, `libd12lgo_styl`) chọn backend trong native theo `assets/leica-v4/styletrans_params.json` (`"snpe": {"runtime": "dsp"}`) và nạp model `.minn` (context QNN đã biên dịch). Các thư viện này có cả `libQnnCpu.so`/`libzxnCpu.so`/`libd12Cpu.so`, nhưng `.minn` biên dịch cho HTP không chạy được trên backend CPU, nên đổi `runtime` sang `cpu` gần như chắc chắn không có tác dụng. Không có công tắc prop nào.
- Kết luận: không cần ép CPU cho M9/完整版 M9 vì đã CPU sẵn; với 百变徕卡/style transfer dùng `.minn`, trên SM7225 chỉ có thể ẩn hoặc chấp nhận đường lùi.

### 4. Kiểm tra chữ ký

- Mã của người port (`com.codex.*`) không đọc chữ ký gói. Các lệnh `MessageDigest` chỉ băm asset/model (`ModelAssetCheck`, `PackedWeights`, `ProNative`), không băm chứng chỉ.
- Chuỗi `signatures`/`signingInfo` chỉ có trong mã MIUI gốc và thư viện Google (classes, 2, 3, 10: "could not get caller signatures", "empty trusted signatures"), dùng để kiểm tra gói gọi đến, không kiểm tra chính app.
- `assets/certificate_info.json` là dữ liệu khung chụp giấy tờ (kích thước thẻ căn cước), không phải chứng chỉ. `assets/authpack/authpack.bin` là gói khóa của FaceUnity SDK (gói `com.faceunity` trong classes3), thường gắn với tên gói chứ không gắn chữ ký.
- APK hiện đã được ký bằng khóa của người port (`signatures:[38a371a9]`), tức mã MIUI gốc đã chạy được với chữ ký không phải Xiaomi. Ký lại bằng khóa riêng gần như chắc chắn không làm hỏng app; cái giá là phải gỡ cài đặt (mất dữ liệu app) và không cập nhật đè được bản của tác giả. Sửa asset sẽ làm lệch băm trong `ModelAssetCheck` nếu đó là file được kiểm tra.

### 5. Tương thích Android 17

- `com.xiaomi.protocol.ICustomCaptureResult.toTotalCaptureResult()`: với SDK > 33 gọi `CaptureResultExtras` 13 tham số `(int,int,int,int,long,int,int,String,long,long,long,boolean,long)`. Đây là constructor hiện hành của A17, không cần patch `captureresultextras-legacy-ctor.patch` cho port này (patch đó vẫn cần cho MIUI Camera). Hàm này lấy constructor `TotalCaptureResult` đầu tiên có trên 2 tham số rồi gọi với 8 tham số; thứ tự `getDeclaredConstructors()` không được bảo đảm, nên nếu gặp `null capture result!` trong log thì đây là chỗ cần xem.
- `Tp.c.a()` (classes10, tag `CameraConstructCompat`): với SDK > 35 gọi constructor `StreamConfigurationMap` 21 tham số (18 mảng, HighSpeed, ReprocessFormatsMap, boolean). Constructor này có sẵn trong A17 (dòng 159 của `miui-ports/compat-port/framework/StreamConfigurationMap.java`), nên không cần thêm patch.
- `CameraCatalog.scan()` gọi `CameraManager.getCameraIdListNoLazy` qua phản chiếu, có bắt lỗi; nếu bị chặn chỉ mất phần dò id ẩn.
- Phần phản chiếu còn lại của `com.codex.*` nhắm vào lớp đã làm rối của chính app (`g2.a`, `r2.m`, `i9.f`...), không phụ thuộc framework.
- Lỗi `ImageReader.setName` thấy trong logcat hiện có thuộc tiến trình `com.android.camera` (MIUI Camera, tag `ImageReaderHelper`), không thuộc Leica port; trong dex của port không có tag này.
- Buffer logcat hiện tại không có dòng nào của `com.kobbin.leica.wmrebuild`.

## Phase 1. Sửa chip zoom (giá trị cao, công sức thấp)

Thứ tự ưu tiên, dừng ở cách đầu tiên đạt tiêu chí:

1. **Chọn profile trong app, không sửa gì.** Bấm nút "机型适配" → 红米 REDMI → Redmi Note 12 Pro → 应用机型. Nếu không ưng tỉ lệ đo được, thử Xiaomi 12S. Kết quả mong đợi: `MatchPolicy.assign()` chỉ giữ id 3 (hoặc 6) làm ultra và id 0 làm main.
2. **Ghi sẵn lựa chọn bằng root** (khi cần dựng sẵn cho ROM hoặc sau khi xóa dữ liệu app): tạo `/data/data/com.kobbin.leica.wmrebuild/shared_prefs/camera_model_profiles_v1.xml` có `<string name="selected">redmi/redmi-note-12-pro</string>`, chủ sở hữu và SELinux context giống các file prefs khác của app, rồi buộc dừng app.
3. **Sửa ở tầng HAL/ROM** (có lợi cho mọi app camera): ẩn id 6 (ultrawide trùng) và id 2/4 (macro, depth) khỏi danh sách camera công khai, hoặc bỏ `BACKWARD_COMPATIBLE` khỏi depth. Việc này đụng camera provider đang được thử ở phiên khác, chỉ làm sau khi phiên đó xong.
4. **Vá smali** (phương án cuối): thêm profile gauguin vào `assets/device-profiles.json` với `"codes": ["gauguin", "M2007J17G", "M2007J17C", "M2007J17I"]`, `"lenses"` gồm ultra và main, `"auxiliary_lenses": [{"role": "macro"}]` để `Profiles.detected()` tự nhận; hoặc trong `CameraCatalog.build()` bỏ ống có tỉ lệ trùng hoặc từ 0.88 đến 0.99. Cần ký lại APK.

Tiêu chí: chip chỉ còn 0.6x và 1x (zoom số vẫn trượt được tới 10x); bấm 0.6x thì `dumpsys media.camera` cho thấy id 3 hoặc 6 đang mở; nút "机型适配" hiện tên profile đã chọn thay cho `自动识别`; logcat tag `LeicaModelMatch` không có "Retain existing catalogue".

## Phase 2. Thuật toán AI trên máy không có HTP (giá trị cao, công sức trung bình)

1. Không cần ép backend cho M9 và 完整版 M9 vì đã chạy CPU. Việc cần làm là đo: chụp mỗi chế độ, lọc logcat tag `FullM9` (dòng `style_ms`/`color_ms`/`graph_ms`) và `Engine` (dòng "接管"/"降级").
2. Với 百变徕卡 và các style dùng `.minn`, xác nhận bằng log rằng native báo lỗi backend (`Unable to load backend`, `Backend Create failed`) rồi app có lùi về đường khác không. Không thử đổi `runtime` trong `styletrans_params.json` vì model `.minn` là context HTP.
3. Nếu một chế độ chỉ ra LUT thuần ("M9 降级纯 LUT"), mất trên 5 giây mỗi ảnh hoặc bị OOM, ẩn nút đó bằng smali (chỉ khi đã quyết định ký lại APK ở Phase 1 hoặc Phase 4).

Tiêu chí: mỗi chế độ hoặc cho ra ảnh có hiệu ứng thật kèm thời gian xử lý ghi trong log, hoặc được ghi nhận là chỉ chạy LUT/bị ẩn có chủ đích.

## Phase 3. Lỗi API A17 (giá trị trung bình, công sức thấp)

1. Phân tích tĩnh không thấy lỗi phản chiếu nào cần patch framework mới cho port này (xem mục 5).
2. Khi phiên thử HAL xong, chạy app, chụp ảnh, Pro, quay video, rồi lọc logcat `CameraConstructCompat|ICustomCaptureResult|NoSuchMethod|NoSuchField|UnsatisfiedLink`. Chỉ thêm patch vào `miui-ports/compat-port/framework/` khi có dòng lỗi thật.

Tiêu chí: logcat sạch các lỗi trên khi chụp ảnh, Pro và quay video.

## Phase 4. Chuỗi và nút 机型适配 (giá trị thấp, công sức thấp)

1. Nút "机型适配" luôn hiện theo thiết kế (`ProfileUi.mount`). Sau Phase 1 nó chỉ đổi chữ thành tên profile. Muốn ẩn hẳn phải vá `ProfileUi.mount()` trả về sớm, tức phải ký lại APK; không đáng làm riêng.
2. Chuỗi tiếng Trung của người port (`ProfileUi`, `ProfileRouter`, `LeicaEngine.Style`) là chuỗi cứng trong mã, không nằm trong `resources.arsc`, nên RRO không dịch được. Chỉ dịch được bằng vá smali.

## Rủi ro

- Ký lại APK buộc phải gỡ bản hiện tại (mất dữ liệu app) và không nhận cập nhật từ tác giả. Không thấy kiểm tra chữ ký chặn việc này.
- Ẩn id camera ở HAL ảnh hưởng mọi app camera; cần kiểm tra lại MIUI Camera và camera của LineageOS.
- Nguồn APK không chính thức; chỉ phân tích tĩnh, không chạy mã từ thư mục giải nén.

## Câu hỏi chưa giải quyết

- id 2 và id 4 cái nào là macro, cái nào là depth? Cần biết nếu chọn hướng sửa HAL ở Phase 1.
- Thời gian xử lý thực của M9 CPU trên SM7225 bao nhiêu? Cần chạy app sau khi phiên thử HAL xong.
- `Discovery.beforeBuild()` và `RoutePolicy.order()` có loại đường mở id 3/6 trên gauguin không? Chỉ xác nhận được khi chạy.
