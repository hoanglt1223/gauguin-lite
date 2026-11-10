# Đặc tả chức năng: app camera "film look" tham chiếu

Ngày 2026-11-09. Người đọc: nhóm phát triển open-camera (fork Aperture, Apache-2.0).

## Provenance

- Tài liệu phân tích app camera port bên thứ ba ("app tham chiếu", package `com.kobbin.leica.wmrebuild`) từ cây decompile `miui-ports/leica/jadx-small/sources/com/codex/**` và asset `miui-ports/leica/extract/assets/`. Dev open-camera được đọc mã decompile để lấy ý tưởng và logic, nhưng **mã của open-camera là mã tự viết**: không chép code, không đưa weights model, dữ liệu LUT/curve/bảng tham số hay artwork (watermark, logo, ảnh mẫu) vào repo.
- Tham chiếu lớp dạng `rearlens.FixedStops` nghĩa là `com.codex.rearlens.FixedStops` trong cây trên.
- Tên tính năng trung tính: **Classic CCD** (= M9), **Classic CCD Plus** (= M9+), **Rangefinder Neutral** (= M10-R), **Silver Mono** (= M3). Film preset tự đặt tên, không dùng tên hãng phim/máy.
- Công cụ: lượt 1 dùng cây decompile + báo cáo trước (`plans/reports/leica-261109-1514-port-rebuild.md`, `leica-261109-1848-apk-slim.md`). Lượt 2 (REA CLI 6.3 + Ghidra headless cho `.so` ARM64, parser header ONNX tự viết) bổ sung §2.5, §4.2, §4.3, §6, §8.6 và file **`spec-leica-native-pipeline.md`** (pipeline native, tham số, khác biệt look, ONNX I/O, fallback). Evidence: appendix cuối file.

Ký hiệu nguồn phụ thuộc: **[APP]** thuần app-side (Camera2 công khai), **[VTAG]** cần vendor tag, **[HAL]** cần khả năng HAL/vendor riêng, **[NPU]** cần DSP/HTP độc quyền.

---

## 1. Device profile và lens catalog

**Mục đích.** Hiện đúng chip zoom (0.6x/1x/2x/3x...) và mở đúng camera vật lý trên mọi máy, kể cả máy giấu camera id hoặc chỉ lộ logical camera.

**Hành vi người dùng.**
- Lần mở đầu: app tự nhận máy, hiện nút nổi "Device profile / <tên máy>". Hộp thoại chọn profile: danh sách máy (tìm theo tên/alias/mã), mục "Auto detect", hiển thị "Current: ...".
- Thanh zoom chỉ hiện các stop đã được xác minh mở được; stop chọn được highlight, nhãn dạng "0.6", "1x", "2".

**Inputs.**
- `Build.BRAND`, `Build.MODEL`, `Build.DEVICE` (chuẩn hóa: lowercase, bỏ khoảng trắng/ký tự đặc biệt).
- Camera2 characteristics của mọi id liệt kê, cộng **thăm dò id ẩn** theo số (0..~127, có giới hạn) khi profile cho biết máy có nhiều ống hơn số id lộ ra: `LENS_FACING`, `LENS_INFO_AVAILABLE_FOCAL_LENGTHS`, `SENSOR_INFO_PHYSICAL_SIZE`, `SENSOR_INFO_ACTIVE_ARRAY_SIZE`/`PIXEL_ARRAY_SIZE`, `CONTROL_ZOOM_RATIO_RANGE`, `SCALER_AVAILABLE_MAX_DIGITAL_ZOOM`, `REQUEST_AVAILABLE_CAPABILITIES` (LOGICAL_MULTI_CAMERA, RAW, ULTRA_HIGH_RESOLUTION), `getPhysicalCameraIds()`, `SCALER_STREAM_CONFIGURATION_MAP`, `LENS_INFO_MINIMUM_FOCUS_DISTANCE`.
- Database profile đóng gói (JSON, ~260 máy).

**Schema profile (ngữ nghĩa, không phải dữ liệu).**
- Gốc: `schema` (version), `scope`, `source_date`, `routing_policy` (chính sách chung), `profiles[]`.
- Mỗi profile: `id` (`brand/slug`), `brand`, `name`, `year`, `codes[]` (mã model/codename để khớp), `ambiguous_codes[]` (mã dùng chung nhiều máy, cần xác minh thêm), `aliases[]`, `source`/`sources` (URL thông số công khai), `audit_date`, `note`, `binding_policy`.
- `lenses[]`: `role` (`main`/`ultra`/`tele`), `mm` (tiêu cự tương đương 35mm), `ratio` (stop hiển thị so với main), `max_mm`/`max_ratio` (tele zoom liên tục), `ratio_origin` (nguồn của ratio: suy ra / zoom quang hãng công bố / quy ước UI / cần đo lúc chạy), `focal_status` (đã công bố hay cần metadata lúc chạy), `mm_source`.
- `auxiliary_lenses[]`: macro/depth/mono — dùng để **loại** camera phụ (độ phân giải thấp, vd ≤3MP) khỏi danh sách stop.
- `routing_policy`: giới hạn id thăm dò, số lần thử lại xác minh sensor (vài lần), chính sách khi thiếu tiêu cự (dùng metadata), khi nhiều sensor không rõ (giữ các stop đo được khác nhau), chỉ cache thành công khi đã xác nhận danh tính sensor.

**Pipeline (nguyên lý).**
1. **Chọn profile:** nếu người dùng chưa chọn → khớp brand trước, rồi model/device với `codes`/`aliases`; mã mơ hồ thì cần thêm xác minh bằng sensor. Lưu lựa chọn vào SharedPreferences (key "selected" = profile id; rỗng = auto).
2. **Catalog:** với mỗi camera back, tính tiêu cự tương đương = `focal_min / đường chéo sensor vật lý × 43.27` (đường chéo full-frame). Ratio = mm / mm_main, làm tròn 0.1, tối thiểu 0.1.
3. **Logical camera:** nếu camera logic có `CONTROL_ZOOM_RATIO_RANGE` lower < 1 thì stop <1x đi qua logic camera (zoom ratio). Physical children được liệt kê qua `getPhysicalCameraIds()` và có thể mở trực tiếp hoặc qua `setPhysicalCameraId`.
4. **Khớp target ↔ candidate:** hàm chi phí = |log(mm_cand/mm_target)| + trọng số × |log(ratio_cand/ratio_target)|; vượt ngưỡng thì loại (chi phí "vô cực"). Gán greedy theo chi phí nhỏ nhất, role macro bỏ qua.
5. **Dedup/merge:** bỏ lens trùng id, bỏ ratio không hợp lệ; nhiều candidate gần 1x (±5%) thì chọn sensor diện tích lớn nhất làm main. Sắp xếp theo ratio.
6. **Route cho mỗi stop:** một stop có thể có nhiều đường mở: `DIRECT` (mở id vật lý), `LOGICAL` (logic camera + zoom ratio), `PHYSICAL` (logic camera + physical stream), `OEM` (qua extension/vendor session). Route có `base`, `min`, `max`; zoom cục bộ = clamp(zoom_user / ratio_stop × base, min, max). Stop không có ống riêng (vd 2x trên máy chỉ có main) → **crop số trên main** (bản port gốc thiếu cái này, đã phải vá).
7. **Xác minh lúc chạy (SensorVerifier):** sau khi mở route, đọc `CaptureResult.LENS_FOCAL_LENGTH` (và `LENS_APERTURE`) từ vài frame; so với tiêu cự kỳ vọng (sai lệch log nhỏ). Sai → thử route thay thế (tối đa vài lần, cách nhau >~1s, chỉ khi app đang foreground), sau đó đánh dấu route bị từ chối. Đúng → cache id đã xác nhận vào SharedPreferences theo key máy+profile.
8. **Session query:** dùng `CameraDevice.isSessionConfigurationSupported` nếu HAL có; HAL không hỗ trợ thì tạo session có bảo vệ (try/fallback).

**Hiệu năng.** Quét catalog và reflection **phải chạy ngoài main thread**, không giữ lock mà main thread cần (app tham chiếu bị ANR lần đổi ống đầu vì lock giữ trong lúc reflection chậm). Mục tiêu: chip hiện <300 ms sau mở camera, đổi ống <500 ms.

**Fallback.** Không khớp profile → profile tự sinh từ metadata. Không mở được route → quay về main id + zoom số. Mọi stop chưa xác minh không hiện chip.

**Phụ thuộc.** [APP] toàn bộ; thăm dò id ẩn phụ thuộc HAL có cho mở id không liệt kê (MIUI/Qualcomm thường có).

---

## 2. Chế độ chụp

### 2.1 Essential (chụp nhanh, look áp sẵn)
- Preview có tone xem trước (shader/LUT nhẹ); nút chọn look; chụp JPEG từ ISP rồi áp look.
- **Auto exposure riêng cho look**: bias EV theo cảnh (đọc ISO/exposure từ result, tính bias mục tiêu) để giữ highlight cho look CCD; EV người dùng cộng thêm.
- **Low light**: phát hiện tối khi ISO×exposure vượt ngưỡng hoặc exposure ≥ ~20 ms. Khi đó giới hạn exposure (≈1/30 s, ≈1/60 s nếu zoom ≥5x), bù bằng ISO; bật MFNR session parameter nếu HAL quảng bá [VTAG]; ISO cao giữ AE và đặt NR/EDGE mode phù hợp.
- **Burst đa khung (software merge):** số khung 1–5 tăng theo ISO và exposure (và theo noise profile `SENSOR_NOISE_PROFILE` nếu có); ống đang dùng là logic thì lấy khung từ physical sensor đang active (`LOGICAL_MULTI_CAMERA_ACTIVE_PHYSICAL_ID`). Bản hiện tại dùng input là JPEG ISP của physical sensor ("ISP input"); đường RAW (black level, white level, WB gains, lens shading map, tone curve từ result) có nhưng tắt.
- Có thể ghi **Ultra HDR (JPEG_R)** khi stream hỗ trợ; nếu không giữ JPEG.

### 2.2 Pro (chụp và quay thủ công)
- Điều khiển: **ISO** (theo `SENSOR_INFO_SENSITIVITY_RANGE`), **Shutter** (theo `SENSOR_INFO_EXPOSURE_TIME_RANGE`, hiển thị giây dạng 1/x hoặc x.x s), **EV** (±, theo `CONTROL_AE_COMPENSATION_RANGE`×step), **WB** (preset AWB + nhiệt độ màu Kelvin; Kelvin thủ công qua `COLOR_CORRECTION_GAINS`/`TRANSFORM` [APP] hoặc vendor manual-WB tag [VTAG]), **AF/MF** (focus distance theo diopter, `LENS_INFO_MINIMUM_FOCUS_DISTANCE`), zoom theo stop.
- Phụ trợ: hẹn giờ 3/5/10 s, lưới 1/3, khung tham chiếu 16:9, histogram/tick view, color card (palette: contrast, saturation, temperature, tint, sharp, soft, grain, vignette), chọn film preset (LUT).
- **RAW/DNG**: khi có capability RAW, lưu DNG song song JPEG (`DngCreator`), thông báo "RAW / DNG saved"; nếu RAW không có thì báo "RAW unavailable" và chỉ lưu JPEG. Có hỗ trợ `SENSOR_PIXEL_MODE` max-resolution khi sensor có.
- **Pro video**: MediaRecorder H.264 (`video/avc`), chọn độ phân giải/fps theo encoder capabilities; lỗi encoder/recorder giữ file nguồn và báo lỗi, không mất clip.
- Lưu: MediaStore `DCIM/<AppPro>/`, dùng `IS_PENDING` rồi finalize.
- Một UI Pro thứ hai được nạp từ APK phụ đóng gói (UI gốc của hãng) — open-camera **không** cần, tự làm UI.

### 2.3 Styles mode (áp style lên ảnh có sẵn) — xem §4.

### 2.4 Chế độ khác
- Video thường + filter video (gói filter giả lập "hoài cổ"), video watermark.
- "Legend/experiment" mode chạy model trên HTP (NPU) — không có đường CPU, đã ẩn [NPU]. Bỏ qua.
- Không thấy Night/Portrait riêng của app tham chiếu ngoài phần MIUI gốc; Portrait chỉ có ở dạng film look với bảo vệ da (§3.5).

### 2.5 Hàng đợi render nền ("Perfect/Full Classic CCD")
- **Mục đích:** look nặng (model AI full-res) chạy vài giây/ảnh; không chặn người chụp, không mất ảnh khi app đóng.
- **Điều kiện vào hàng đợi** (`fullm9.BackgroundCapture.eligible/reserve`, executor 1 luồng): format JPEG và look Classic CCD. Rơi về xử lý đồng bộ khi: URI do app ngoài cấp (intent capture), Live Photo, service không chạy, nguồn không đầy đủ, input > 256 MB.
- **Job store = SQLite** (`fullm9.PhotoJobStore`): `noBackupFilesDir/m9-photo-jobs/jobs.db`, WAL + `synchronous=FULL`. Bảng `jobs`: `seq` (autoincrement, thứ tự FIFO), `id` UNIQUE, `state`, `created`, `snapshot` (JSON), `input_hash`/`output_hash` (SHA-256), `output_size`, `uri`, `error` ("Lớp: message"), `attempts`, `notified`. Mỗi job 3 file: `<id>.json` (manifest `{schema:1, snapshot, input_hash, input_size}`), `<id>.source` (JPEG gốc), `<id>.jpg` (kết quả).
- **Ghi atomic** (`DurablePhotoFiles.write`): `X.part` → `FileDescriptor.sync()` → `Os.rename` → fsync thư mục. Đọc lại từ chối khi sai size/hash.
- **Snapshot lúc chụp** (`CaptureSnapshot`, JSON `schema:1`): pipeline id, lux, CCT, zoom, provenance, width/height, orientation, focal, aperture, exposure ns, ISO, location (address, latlng), watermark id. Render nền dùng snapshot này thay cho capture result.
- **State machine:** `RESERVED → READY → PROCESSING → ENCODED → PUBLISHING → DONE`; phụ: `NO_INPUT` (RESERVED quá 120 s không có nguồn), `FAILED` (cập nhật có điều kiện `state != DONE`). Vào PROCESSING thì `attempts+1`. `next()` = seq nhỏ nhất trong READY.
- **Resume** (`PhotoJobStore.recover(retry)`): RESERVED có manifest hợp lệ → READY (không hợp lệ: giữ, log); PROCESSING/dở → ENCODED nếu đã có `output_hash` + `.jpg` (không render lại), ngược lại READY; FAILED chỉ quay lại hàng khi service được start với `retry=true` (người dùng mở lại camera). **Không có backoff hay giới hạn số lần** — `attempts` chỉ để chẩn đoán. Dọn file `.part`.
- **Service** (`PhotoProcessingService`): `startForeground(id, notif, type)` với type `mediaProcessing` (SDK ≥ 35) hoặc `dataSync`; partial WakeLock; executor 1 luồng; vòng `recover → next → render → encoded → publish`; pump 500 ms; **startup lease 15 s** (không stopSelf trong 15 s đầu để đón job đến muộn); hết job → `stopSelfResult` + thông báo cuối không ongoing.
- **Notification:** kênh importance LOW, không âm; tiêu đề "đang chờ"/"đang render"; nội dung `<stage> · còn N ảnh`, progress 0–100, `onlyAlertOnce`, category `progress`; bấm mở app. Kết thúc: "đã lưu vào thư viện" hoặc "một số ảnh chưa xong, mở camera để thử lại". Phần trăm theo stage (`PhotoProgress`): denoise input 3, tone 7, tone+NR output 80, texture 84, watermark 88, HDR+encode 92, ghi gallery 96, publish 99, xong 100.
- **Quyền thông báo** (`NotificationPermission`): xin `POST_NOTIFICATIONS` sau 1 s, chỉ khi window focus, đã có quyền camera, không có dialog quyền khác; từ chối vẫn render.
- **Publish idempotent** (`PhotoMediaPublisher.publish`): `MediaStore.Images` volume `external_primary`; `RELATIVE_PATH=DCIM/Camera/`, `DISPLAY_NAME` = tiền tố + `dateTaken` 13 chữ số + `seq` 20 chữ số + id, `MIME_TYPE=image/jpeg`, `IS_PENDING=1`, `DATE_TAKEN` = thời điểm chụp từ snapshot. Tìm dòng cũ theo `uri` đã lưu, rồi theo display name + relative path; tồn tại mà SHA-256 khác → lỗi ("ảnh bị sửa ngoài app"). Ghi `openFileDescriptor("rwt")` → `sync()` → đọc lại kiểm byte → `IS_PENDING=0` → DONE; thông báo một lần (`notified`).
- **Chẩn đoán** (`BackgroundStatus`): log vòng 48 KB + file last-render/last-error; dialog liệt kê 12 job gần nhất, nút copy.
- **Yêu cầu open-camera:** cùng mô hình (SQLite/Room + file atomic + state machine + publish idempotent theo hash); thêm backoff có trần (vd 3 lần) mà app tham chiếu thiếu; foreground service type `mediaProcessing` (A15+) / `dataSync`.
- App tham chiếu còn có **cloud offload** (upload ảnh tới server riêng xử lý rồi tải về) — **không làm** (plan cấm cloud).

---

## 3. Looks (tone/style)

Tất cả look nhận ảnh sRGB 8-bit đã qua ISP (JPEG decode) hoặc YUV, xuất JPEG 8-bit + tùy chọn gain map HDR. Không look nào xử lý RAW tuyến tính trong cấu hình mặc định.

### 3.1 Classic CCD (M9)
- **Ý đồ:** giả lập ảnh máy rangefinder CCD đời đầu: màu bão hòa sâu, đỏ/xanh lá đậm, da hơi ấm, tương phản trung tâm cao, vùng sáng cuộn mềm, bóng hơi nâng, cảm giác "dày màu".
- **Pipeline:**
  1. Đo cảnh: lux index (kiểu Qualcomm, **lớn = tối**) và CCT từ snapshot/vendor tag [VTAG], fallback ước lượng từ EXIF (N, t, ISO) [APP]. `low` model chỉ khi lux > 260 **và** CCT < 4692 (tối + ánh ấm), còn lại `high`.
  2. **Style net** trên ảnh thấp 1024×768 (pad 1120×864, 3 màu + 1 mask, [-1,1]).
  3. **Colorfix net chạy full-res theo tile** 512 (+halo 16, input 6 kênh = style upsample ×4 + gốc) trên canvas 4096×3072 — đây là bước lên full-res, không phải guided upsampling.
  4. 3D LUT 17³ + vignette luma-only có sigmoid độ sáng, tham số nội suy theo lux/CCT/zoom.
  5. Denoise output, texture recovery có gate theo σ, sharpen thích ứng, encode Display-P3 + gain map. **Không grain.**
  - Chi tiết công thức, địa chỉ hàm: `spec-leica-native-pipeline.md` §1–2.
- Biến thể **"Distilled"** (Full M9 Distilled): model nhỏ hơn, chạy tile ở độ phân giải cao hơn (canvas tối thiểu ~256 px cạnh ngắn, giữ chi tiết tới ~1024), kết quả cache theo CRC input.
- Biến thể **net 2 nhánh**: tile 512×512 chồng lấn 64 px, trộn feather tuyến tính; mỗi tile kèm thumbnail toàn cục 256×256 làm context (đảm bảo màu nhất quán giữa tile).
- **Texture recovery:** sau style, khôi phục chi tiết cao tần từ ảnh gốc (detail layer = gốc − blur(gốc), cộng lại có trọng số); thất bại thì giữ output không recovery.
- **Fallback:** SNPE/DSP (chỉ Qualcomm) → runner CPU ở process con → Distilled → ORT style-only (giữ tần cao gốc) → LUT thuần. Quy tắc: `spec-leica-native-pipeline.md` §3, §5.
- **open-camera:** tự thiết kế 3D LUT + curve (miễn phí, nhanh) làm baseline; model AI tùy chọn tự huấn luyện (vd HDRNet/bilateral grid, giấy phép mở).

### 3.2 Classic CCD Plus (M9+)
- Cùng net và chuỗi fallback như M9; khác: warm filter EV −1.3 / warmth 0.5 (M9: −0.95 / 0.3), rồi boost saturation ×1.25, lệch ấm R+4%/B−4%, contrast ×1.1 quanh 128, JPEG q100 (`donor120.LeicaEngine`). "snapshot" vs "preview" là bộ tham số ảnh chụp vs xem trước, không phải M9 vs M9+.

### 3.3 Rangefinder Neutral (M10-R)
- **Ý đồ:** trung tính, độ bão hòa vừa, tông da tự nhiên, tương phản thấp hơn M9, dải động rộng.
- **Pipeline:** thử LUT thuần trước, sau đó style net + warm filter với bộ tham số riêng (EV −0.95, warmth 0.3); mọi nhánh kết bằng shader vignette+grain 0.3 (vignette tránh vùng sáng, grain ở vùng tối). Bản sửa: **có dùng model** khi có NPU/CPU runner. open-camera: làm bằng LUT + curve là đủ.

### 3.4 Silver Mono (M3)
- **Ý đồ:** đen trắng kiểu phim bạc: kênh trộn nghiêng đỏ/xanh lá (trời tối hơn), tương phản S-curve mạnh, đen sâu, grain theo độ sáng (mạnh ở trung tính, yếu ở đen/trắng).
- **Pipeline:** RGB → luma `0.54R+0.40G+0.06B` → curve S có fade (đen 10, trắng 246, pha smoothstep 0.42) → grain lưới nhiễu cell `W/1400` px, biên độ `13·(0.3+0.7·4l(1−l))` (`donor120.M3Mono`). Đường native dùng runner mono riêng rồi luôn ép xám thật. Không model AI.

### 3.5 Portrait film (bảo vệ da)
- Model **SepLUT-style** (separable 1D LUT + 3D LUT nhỏ ~17³, dự đoán theo ảnh, công bố công khai, huấn luyện trên MIT-Adobe FiveK): mạng nhỏ nhìn thumbnail, xuất tham số 1D curves và 3D LUT, áp lên full-res (rẻ).
- Bảo vệ da: phát hiện mặt/da (FaceDetector) → giảm cường độ look ở vùng da.

### 3.6 Film presets (~20 LUT)
- Giả lập các cuộn phim/hãng máy (negative ấm, slide bão hòa, tungsten lạnh, xanh "Nordic"...). Định dạng: file LUT nhị phân riêng (header + 3D grid). Áp trong sRGB gamma (không linear), có thanh cường độ.
- Palette chỉnh trên look: temperature, tint, saturation, contrast, sharpness, softness (glow), grain, vignette; lưu riêng theo look.
- **open-camera:** dùng `.cube` tự tạo, đặt tên trung tính.

### 3.7 Thành phần dùng chung
- **HDR gain map** (Ultra HDR): tạo gain plane từ khác biệt SDR/HDR, ghi JPEG_R; nếu decoder không hỗ trợ thì giữ SDR.
- **Night highlights / HDR repair:** sửa clip highlight khi look làm cháy (blend lại từ gốc theo mask luminance).
- **Quality pass** (sau look): chroma denoise, spatial sharpen thích ứng, encoder JPEG chất lượng cao (95–100).
- **EXIF:** giữ EXIF gốc, cập nhật orientation, thêm tên look vào software/user comment.

| Look | Model AI | LUT/curve cổ điển | Ghi chú |
|---|---|---|---|
| Classic CCD | Có (style + colorfix) | Fallback LUT | Nặng, chạy nền |
| Classic CCD Plus | Có | Có | Nặng |
| Rangefinder Neutral | Có (style, khi có runner) | Có + shader | Nhanh nếu chỉ LUT |
| Silver Mono | Không | Có | Nhanh |
| Portrait film | Có (nhỏ) | — | Vừa |
| Film presets | Không | Có | Nhanh |

---

## 4. Styles editor, watermark, composition, aesthetic

### 4.1 Styles editor ("áp look cho ảnh có sẵn")
- Mode riêng trên thanh chọn mode: mở picker ảnh → preview look → chỉnh palette → export.
- Export: tạo bản mới trong MediaStore `DCIM/Camera/` với tên tiền tố riêng + timestamp; không ghi đè gốc. Báo lỗi rõ khi ảnh rỗng/không giải mã/không ghi được.
- Import style: không thấy định dạng import style từ ngoài; preset palette lưu nội bộ (SharedPreferences/JSON). **open-camera:** thêm import/export `.cube` + JSON palette (tính năng mới, không phải sao chép).

### 4.2 Watermark/frame
- **Template = cây layout khai báo bằng JSON** (giống Android view tree): node `Layout` (orientation, width/height, gravity, margin, background), `ImageView` (ảnh gốc hoặc logo), `TextView` (text có placeholder EXIF). Mỗi template có `metadata`: id, tên i18n, vị trí (`out` = khung ngoài ảnh / `in` = đè lên ảnh), giới hạn độ dài tên, mode không hỗ trợ (front, pano, doc...), độ ưu tiên; file `i18n.json` per template.
- Nhóm template: classic, film, standard, tag (nhãn nhỏ), tem/branding. Font + bảng phạm vi glyph (emoji fallback).
- **Renderer:** app tham chiếu không tự tính layout; nó gọi engine template gốc của MIUI qua reflection (`leicaapp.OriginalWatermark.applyBeforeHdrLast`), sau khi style và **trước** HDR/encode cuối. Input: bitmap đã xoay upright + focal, aperture, exposure (ưu tiên snapshot), ISO, location, tên máy tùy chỉnh; xong xoay ngược theo EXIF. Lỗi → giữ ảnh đã style, toast báo, không mất ảnh. Kiểm renderer không đổi color space.
- **Vị trí** = key của `layout_group`: `outer_border_left/right`, `top`, `bottom`, `center` (mở rộng canvas ngoài ảnh); `inner_border_*` (viền trong); lưới 9 ô `top_left`…`bottom_right` (overlay trong ảnh). Node có `optional`/`setting_optional_type` (người dùng bật/tắt từng dòng).
- **Đơn vị:** `dp` của template tính trên **chiều rộng tham chiếu 1080** (giới hạn tỉ lệ nhân ×1080); suy ra scale = cạnh ngắn/1080 (chưa thấy dòng code xác nhận). Giá trị điển hình (thang 1080): padding viền 48 (~4.4% cạnh ngắn), thanh dưới 150–186 (~14–17%), icon 104, chữ 20–22 (khoảng 13–36). Text dài: bề rộng tối đa 0.444/0.54/0.8 × 1080, tối đa 2 dòng (`StaticLayout`); tên tùy chỉnh ≤ 0.4; độ dài tên theo `name_length_limitation`.
- **Định dạng EXIF:** mẫu mặc định `"{focal}mm  f/{aperture}  {speed}s  ISO{iso}"` (focal = mm tương đương, số nguyên); **thiếu bất kỳ trường nào → bỏ cả dòng**. Thời gian theo khóa i18n kiểu `yyyy_MM_dd_HH_mm` (có biến thể kèm thứ). Tên máy tùy chỉnh ≤ 40 ký tự, rỗng = mặc định (`refine80.WatermarkV2`, `TextRules`).
- **HDR gain map** (`OriginalWatermark.renderGainmap`, `cameralook.HdrWatermark`, `WatermarkGainMath`): render watermark lên 3 carrier (gain map thu ≤1024 px, nền đen, nền trắng); so đen/trắng ra mask phủ; vùng phủ tính lại gain trong log domain (sRGB→linear, log ratio trộn theo coverage, chuẩn hóa [ratioMin, ratioMax], mũ 1/gamma, ×255); dựng gain map full-res nội suy song tuyến, ngân sách 0.7 × heap trống; lỗi → giữ SDR có watermark.
- **EXIF ghi lại** (`leicaapp.JpegMetadata.copyExif`, `cameralook.ToneExif`): copy APP1 gốc, cập nhật ImageWidth/Length + PixelX/YDimension, `Orientation=1` (pixel đã xoay thật), `ColorSpace=1`; giữ/mở rộng APP2 MPF để gắn gain map. Không ghi XMP. (App tham chiếu còn ghi EXIF giả máy hãng — **không làm**.)
- Watermark video: overlay tương tự trên frame video.
- **open-camera:** làm "Film border" và "EXIF strip" không logo, cùng mô hình JSON layout (thiết kế lại schema của mình).

### 4.3 Composition assist
- Bật/tắt bằng nút cạnh thanh zoom. Khi bật: lấy mẫu preview (PixelCopy, ~448 px) liên tục mỗi ~200 ms trong ~1 s quét.
- **Điều kiện lấy mẫu:** preview là SurfaceView, đã có mẫu rotation vector; `PixelCopy` → ARGB 448×448 (kéo giãn, không giữ tỉ lệ); inference trên executor riêng, đổi `generation` hủy kết quả cũ (`RunOptions.setTerminate`).
- **Composition model** (`AiVisualReference.detectCandidates`): 448→224 bilinear, NCHW `[1,3,224,224]`, `(v/255 − mean)/std` ImageNet. Output `crop [1,4]` = `[x0,y0,x1,y1]` chuẩn hóa (clamp [0,1], loại nếu không hữu hạn hoặc w/h < 0.1) và `attention [1,1,224,224]` (heatmap saliency).
- **Crop theo saliency** (`AiCropCandidates.choose`): nếu heatmap phương sai < 4e-4 → dùng hộp model. Ngược lại integral image của `max(0, heat − mean)`; quét scale {0.45…0.95, 1.0} × lưới 11×11; giữ cửa sổ chứa ≥ 90% saliency dương; cost `s² + 0.02·dist(tâm, tâm hộp model)` → crop nhỏ nhất giữ 90% saliency.
- **Ứng viên:** khung gốc (index 0), hộp model, hộp saliency, và hộp saliency ở cạnh 0.55/0.70/0.85; tất cả ép **vuông**, cạnh ≥ `minFrac = startZoom/zoomMax` (không vượt zoom tối đa), tâm clamp trong ảnh.
- **Bảo vệ mặt:** `FaceDetector(224,224,8)` trên RGB_565, confidence ≥ 0.4; hộp mặt = tâm mắt ±2d ngang, −2d/+2.5d dọc (d = khoảng cách mắt); ứng viên không chứa trọn mọi mặt bị loại.
- **Aesthetic** (`AiVisualReference.score`): crop ứng viên trên bitmap 448 → 224, NHWC `v/127.5 − 1`; điểm = Σ(i+1)·p_i, ngoài [1,10] → lỗi; cache điểm theo tọa độ.
- **Chọn** (`AiAestheticChoice.choose`): mặc định khung gốc; ứng viên chỉ thắng nếu `score ≥ score_gốc + 0.05` và lớn hơn best. Gộp nhiều mẫu trong 1 s quét: giữ điểm cao nhất. Zoom đích = `clamp(startZoom/max(w,h), startZoom, zoomMax)`; đích khóa vào world frame bằng rotation matrix.
- **Dẫn hướng** (`AiDirectionTarget`, `AiCompositionGate`, `AiCropTransition`): chiếu đích qua rotation matrix với nửa FOV `tan = 0.65/zoom`; đích sau lưng → ẩn mũi tên. Chuyển động khi > 0.08 rad/s; mẫu cũ > 150 ms → reset. Kích hoạt khi lệch tâm ≤ ngưỡng liên tục ≥ 350 ms (một lần/lượt quét); khóa 120 ms → zoom 650 ms ease smoothstep trong log-zoom, bỏ nếu Δzoom ≤ 0.03. Overlay: vòng tâm, vòng đích, làm tối ngoài khung (fade 600 ms).
- **UI:** vẽ khung đích + mũi tên hướng di chuyển máy + vòng tâm nhịp thở; khi người dùng đưa máy khớp (sai lệch tâm < ~8% khung) thì **tự zoom mượt** tới crop (≤6 s), dùng rotation vector sensor để bù chuyển động; ép màn 60 Hz khi đang dẫn hướng. Sau khi chụp, chế độ liên tục tự quét lại sau ~5 s.
- **Runtime:** ORT CPU 1–2 thread hoặc XNNPACK 2 thread; hủy khi rời màn.
- **open-camera:** NIMA (idealo, Apache-2.0) dùng được; composition model phải tự huấn luyện (CACNet không rõ giấy phép).

---

## 5. AI runtime, threading, bộ nhớ

- **Thứ tự backend:** NPU (QNN/SNPE DSP, chỉ chip có HTP) → ONNX Runtime **XNNPACK** → ORT **CPU**. SM7225 không có HTP → luôn CPU/XNNPACK.
- **Tự hiệu chỉnh (auto-tune):** lần đầu chạy model, thử vài cấu hình (CPU 4 thread, CPU 6 thread, XNNPACK all cores), mỗi cấu hình 3 lần, lấy median; **kiểm output khớp** cấu hình chuẩn (sai số float nhỏ, pixel 8-bit giống nhau ngoài biên tile) trước khi chấp nhận. Lưu winner vào file properties, key = model hash + ORT version + ABI + kernel + số core; hết hạn sau 7 ngày. Có giới hạn bộ nhớ khi hiệu chỉnh.
- **Threading:** một executor riêng cho render (1 job tại một thời điểm), session ORT giữ ấm và **release sau 60 s idle**; lock render toàn cục để không chạy 2 model nặng song song.
- **Bộ nhớ:** chạy model ở độ phân giải thấp/tile; full-res chỉ cho bước áp transform. Model ~15–30 MB mỗi cái; tổng asset AI vài trăm MB (app tham chiếu 420–530 MB).
- **Kiểm toàn vẹn asset:** hash manifest cho thư mục model; copy asset ra storage nội bộ lần đầu (marker `.ready`).
- **Thời gian:** chưa đo được trên máy (phone đang dùng bởi agent khác). Ước lượng từ kích thước model: style+colorfix ở ~1 MP trên A76 ×2 + A55 ×6: vài giây/ảnh → lý do có hàng đợi nền. open-camera đặt ngân sách: preview look <16 ms/frame (GPU shader LUT), still look cổ điển <500 ms, AI look <8 s nền.

---

## 6. Camera2/HAL usage

- **API:** Camera2 thuần, hook vào UI camera gốc; Pro mode có session riêng.
- **Request keys dùng:** `CONTROL_ZOOM_RATIO`, `SCALER_CROP_REGION`, `SENSOR_EXPOSURE_TIME`, `SENSOR_SENSITIVITY`, `SENSOR_FRAME_DURATION`, `CONTROL_AE_MODE`, `CONTROL_AE_EXPOSURE_COMPENSATION`, `CONTROL_AE_TARGET_FPS_RANGE`, `CONTROL_AE_PRECAPTURE_TRIGGER`, `CONTROL_AWB_MODE`/`LOCK`, `COLOR_CORRECTION_MODE/GAINS/TRANSFORM`, `CONTROL_AF_MODE/TRIGGER/REGIONS`, `LENS_FOCUS_DISTANCE`, `LENS_OPTICAL_STABILIZATION_MODE`, `NOISE_REDUCTION_MODE`, `EDGE_MODE`, `TONEMAP_CURVE`, `CONTROL_POST_RAW_SENSITIVITY_BOOST`, `CONTROL_CAPTURE_INTENT`, `CONTROL_ENABLE_ZSL`, `JPEG_QUALITY`, `JPEG_ORIENTATION`, `SENSOR_PIXEL_MODE`, `SCALER_ROTATE_AND_CROP`, `STATISTICS_FACE_DETECT_MODE`, `STATISTICS_LENS_SHADING_MAP_MODE`, `FLASH_MODE`.
- **Vendor tags [VTAG] (chỉ đọc/ghi nếu có trong `getAvailableCaptureRequestKeys`/session keys):** MFNR session parameter (Qualcomm), manual WB color temperature (Qualcomm), lux index / AEC lux, AWB CCT, zoom smooth-transition/user zoom ratio, session client name / function mask (Xiaomi). Mọi tag đều có đường lùi khi vắng.
- **Session:** `SessionConfiguration` + session parameters; operating mode có thể là vendor mode cho một số route OEM. Khi HAL từ chối → thử cấu hình thay thế, cuối cùng quay về session JPEG chuẩn.
- **Camera extensions:** dùng `createExtensionSession` (extension AUTOMATIC) khi máy quảng bá, cho route OEM; chuyển EV/WB qua extension nếu extension hỗ trợ key đó, không thì bỏ qua (log "Film EV unavailable").
- **Stream:** preview SurfaceTexture; still JPEG kích thước lớn nhất của stream map (hoặc map MAXIMUM_RESOLUTION khi `SENSOR_PIXEL_MODE` max); RAW_SENSOR khi có capability; JPEG_R khi có; ImageReader YUV/private (maxImages 2) cho burst.
- **Full-res:** chọn size lớn nhất trong `SCALER_STREAM_CONFIGURATION_MAP`; physical stream cho ống vật lý trong logical camera. Trên gauguin: 1x 3472×4624, 0.6x 2448×3264 (đo từ ảnh đã chụp).
- **ZSL/reprocess:** không tạo reprocessable session; request reprocess của HAL được chuyển nguyên; ZSL chỉ xuất hiện ở chỗ burst tắt nó (`ENABLE_ZSL=false`). Chi tiết per-mode: §8.6.
- **Android 17 compat:** app tham chiếu (code MIUI) gọi constructor ẩn cũ của `StreamConfigurationMap` đã đổi chữ ký ở A17 → crash; repo đã có vá framework (`miui-ports/compat-port/`). open-camera dùng API công khai thì không gặp. Lưu ý thêm: foreground service type bắt buộc (A14+), quyền `POST_NOTIFICATIONS` (A13+).

---

## 7. Gap list: vendor-only → thay thế mở

| Tính năng | Phụ thuộc | Thay thế mở cho open-camera |
|---|---|---|
| Chạy model trên NPU (HTP) | [NPU] QNN/SNPE | LiteRT GPU delegate / NNAPI / ORT XNNPACK |
| MFNR của ISP | [VTAG] Qualcomm session param | Burst YUV + align/merge tự làm (Halide/OpenCV) |
| Lux index, AWB CCT từ 3A | [VTAG] | Ước lượng lux từ exposure×ISO×aperture; CCT từ `COLOR_CORRECTION_GAINS`/AWB |
| Manual WB Kelvin vendor | [VTAG] | `COLOR_CORRECTION_MODE=TRANSFORM_MATRIX` + gains tự tính (CCT→gains) |
| Smooth zoom chuyển ống | [VTAG]/[HAL] | Logical camera `CONTROL_ZOOM_RATIO` hoặc chuyển session có cross-fade |
| Mở camera id ẩn | [HAL] (MIUI cho phép) | Chỉ id công khai + physical id; profile quirks |
| Night/HDR/Bokeh OEM | [HAL] extensions | CameraX Extensions khi có; không thì pipeline đa khung riêng |
| Model look gốc (.minn/.onnx) | Độc quyền | Tự làm LUT/curve; AI look tự huấn luyện (bilateral grid) |
| Watermark/logo hãng | Nhãn hiệu | Film border/EXIF strip trung tính |
| UI Pro gốc nạp từ APK phụ | Độc quyền | UI Pro tự viết (Compose) |
| Cloud render | Server bên thứ ba | Không làm |
| Composition model (CACNet) | Giấy phép không rõ | Heuristic (rule of thirds + saliency) rồi model tự huấn luyện |

## 8. Logic cụ thể và tham chiếu mã

### 8.1 Lens/profile
- Profile: `modelmatch.Profiles` (prefs `camera_model_profiles_v1`, key `selected`; `detected()` khớp `Build.BRAND` rồi `Build.MODEL`/`Build.DEVICE` đã normalize). UI: `modelmatch.ProfileUi`.
- Tiêu cự tương đương: `rearlens.CameraCatalog.equivalent()` = `min(focal_lengths) / hypot(sensorW, sensorH)`; nhân `43.2666` ra mm. Ratio = `max(0.1, round(mm/mm_main × 10)/10)` (`modelmatch.RouteMath`, `MatchPolicy`).
- Chi phí khớp (`modelmatch.MatchPolicy.cost`): `|ln(mm_c/mm_t)| + 0.65·|ln(ratio_c/ratio_t)|`; đầu vào không hợp lệ → 100. Discovery (`rearlens.Discovery`) nhận candidate thăm dò khi cost < 0.4, bỏ role `macro`.
- Main: candidate có |ratio−1| < 0.05 và diện tích sensor lớn nhất (`CameraCatalog`).
- Route kinds (`rearlens.LensPlan`): DIRECT=0, LOGICAL=1, PHYSICAL=2, OEM=3. `Route.local(zoom, ratio) = clamp(zoom/ratio × base, min, max)`. Chip: `rearlens.FixedStops` chọn index = stop lớn nhất có `ratio ≤ zoom + 1e-4`.
- Xác minh sensor (`rearlens.SensorVerifier`): so `LENS_FOCAL_LENGTH` result với kỳ vọng theo `|ln(a/b)| < tol`; phân biệt sensor khác khi mm lệch > 1.2–7.5%. Retry khi ≥12 frame sai và sai liên tục ≥1.1 s, giới hạn `sensor_retry_limit` = 4. Cache id thành công trong prefs.
- `routing_policy` trong `device-profiles.json`: thăm dò id tới 127, cache chỉ khi đã xác nhận sensor.

### 8.2 Burst và low light
- Số khung (`leicaapp.RawBurstPolicy.frames(iso, expNs, manual)`): manual → 1; ISO ≥1200 hoặc exp ≥30 ms → 5; ISO ≥600 hoặc ≥15 ms → 4; ISO ≥200 hoặc ≥8 ms → 3; ISO <100 và <4 ms → 1; còn lại 2. Nâng thêm theo noise profile: `max(S·0.02 + O)` trên 4 kênh, `ceil(max/4e-6)` khung, trần 5. `useIspInput()` = true → `SoftwareRaw.remember` return trước bước burst: **thực tế chỉ 1 JPEG ISP, đa khung do HAL MFNR**. Nhánh noise profile có `return` trong vòng lặp (chỉ xét kênh đầu) — lỗi, đừng chép. Flash FIRED → 1 khung.
- Tối (`leicaapp.LowLightPolicy.dark`): `ISO × max(100, x) ≥ 80000` hoặc exp ≥ 20 ms. Trần exposure: 33.3 ms, hoặc 16.7 ms khi zoom ≥5x. Bù: `ISO_new = ISO × exp / exp_cap`, bỏ nếu vượt ISO max. MFNR session param bật khi HAL quảng bá (`leicaapp.LowLightCapture`).
- RAW develop (tắt): `leicaapp.SoftwareRaw.render` dùng black level, white level, WB gains, lens shading map, tone curve từ result.

### 8.3 Looks
- Classic CCD style net (`assets/fullm9/styletrans_params.json`): style input `[1,864,1120,4]` → output `[1,864,1120,3]`; colorfix `[1,544,544,6]` → `[1,544,544,3]`; lượng tử tf16 offset −128, delta 1/127.5 (tức [-1,1]). Chọn model: `low` khi lux index > 260 và CCT < 4692 K, còn lại `high` (lux index lớn = tối). Bản ONNX opset 17 (`fullm9/conversion-validation.json`). Engine: `fullm9.FullM9Engine`, graph/tile: `fullm9.M9Graph`, fallback ORT `donor120.M9OrtFallback`, CPU native `donor120.M9CpuFallback`.
- Distilled (`donor120.M9Distill`): canvas tối thiểu 256 cạnh ngắn, giữ 1024; tile + cache CRC32.
- Net 2 nhánh (`donor120.Lm9Net`): tile 512, overlap 64, ramp tuyến tính `i/64`; input local `[1,3,512,512]` + global `[1,3,256,256]`; ảnh < 512 thì upscale.
- Portrait (`donor120.PortraitFilm`): SepLUT, LUT 3D 17³ + 1D curves.
- Silver Mono: `donor120.M3Mono`. Rangefinder Neutral/M9 param: `model120.LegendaryPostProcessor`, `leicaapp.MadridLegendary` (file param nhị phân per look — không mang sang).
- Film preset LUT: `nonrootpro.ProLut` (đọc `cameralook/tone-*.lut`, kiểm header/size/domain). Palette keys: `prostyles.PaletteValues` (contrast, grain, saturation, sharp, soft, temperature, tint, vignette).
- Hàng đợi nền: `fullm9.BackgroundCapture`, `PhotoJobStore`, `PhotoProcessingService`, `PhotoMediaPublisher`; kênh thông báo `m9-photo-processing`.

### 8.4 Runtime
- `fullm9.M9CpuPolicy`: candidate `CPU:min(4,cores)`, `CPU:min(6,cores)`, `XNNPACK:cores` (cores ≤8); 3 mẫu/cấu hình, median; khớp output `|Δ| ≤ 1e-4` và pixel 8-bit (`v·127.5+128`) ngoài biên; cache `noBackupFiles/fullm9-cpu-<model>.properties`, TTL 604800000 ms (7 ngày).
- Composition (`leicaapp.AiVisualReference`): `cacnet.onnx` input `[1,3,224,224]` chuẩn hóa mean/std; `nima-aesthetic.onnx` input `[1,224,224,3]` `(v/127.5)−1`, 10 bin, điểm hợp lệ 1–10; ORT threads 1–2, XNNPACK 2 thread; `FaceDetector(224,224,8)`, hộp mặt mở rộng 2.5× khoảng cách mắt xuống dưới.
- Composition UI (`leicaapp.AiCompositionController`): mẫu 448×448 mỗi 200 ms trong 1 s; ngưỡng lệch tâm 0.08; tự zoom ≤6 s, lệnh zoom cách ≥30 ms, smoothing `1−exp(−dt/65ms)`; rescan 5 s sau chụp; sensor `TYPE_ROTATION_VECTOR`; ưu tiên 60 Hz.

### 8.5 Camera2 sequence (route OEM/thường)
1. `CameraManager.getCameraCharacteristics` mọi id (+ thăm dò) → `LensPlan`.
2. `openCamera(route.openId)` → `SessionConfiguration(type, outputs)` + `setSessionParameters` (vendor keys nếu có) → `rearlens.LensSession`; lỗi → `LensSession` thử alternative route, cuối cùng session JPEG chuẩn.
3. OEM route: `createExtensionSession(ExtensionSessionConfiguration(EXTENSION_AUTOMATIC, ...))` (`leicaapp.OemExtensionSession`); EV/WB chỉ đặt khi extension hỗ trợ key.
4. Repeating preview với `CONTROL_ZOOM_RATIO` = `Route.local`; verifier đọc result.
5. Still: `CONTROL_CAPTURE_INTENT=STILL_CAPTURE`, AE/AWB lock khi cần, burst N khung, JPEG/JPEG_R reader.

### 8.6 Camera2 theo mode (request keys)

| Mode/route | Template | Keys và giá trị | Nguồn |
|---|---|---|---|
| Preview thường | PREVIEW; route pin physical → `createCaptureRequest(PREVIEW, {physicalId})` | `CONTROL_ZOOM_RATIO = Route.local`, hoặc `SCALER_CROP_REGION` khi không có zoom ratio range | `rearlens.StandardSession`, `LensSession.createRequest`, `LensControl` |
| Session | type gốc; route OEM/vendor dùng operating mode vendor | session params (MFNR key nếu có) | `LensSession` |
| Essential still | STILL_CAPTURE | Reset WB vendor; `AWB_MODE=AUTO`, `COLOR_CORRECTION_MODE=FAST`; gắn look + snapshot preview result (≤1 s) vào request để render sau | `leicaapp.LegendaryPostProcessor.buildRequest` |
| WB cố định theo look | — | vendor WB temperature = CCT, `AWB_MODE=OFF`, `AWB_LOCK=false`, `CC_MODE=FAST` [VTAG] | `applyFixedWhiteBalance` |
| JPEG | — | `JPEG_QUALITY=100` (Essential module chính và Pro) | `quality.NativeQuality`, `ProActivity.apply` |
| Low light (mọi still) | giữ | MFNR session param =1 khi key có trong cả capture keys và session keys; OIS=ON nếu có | `LowLightCapture.apply/session` |
| Low light + `dark` | STILL | `NR_MODE=HIGH_QUALITY`. ISO ≥ 800: `EDGE_MODE=OFF`, FPS [10,30], giữ AE. ISO < 800 và AE converged/locked, flash off, có MANUAL_SENSOR: `AE_MODE=OFF`, exp = cap (33.3 / 16.7 ms khi zoom ≥5), ISO bù, `FRAME_DURATION=max(33.3 ms, exp)`; khôi phục request cũ ở lần build sau | `LowLightCapture.apply` |
| OEM extension (AUTOMATIC) | PREVIEW/STILL | Chỉ copy key extension hỗ trợ, **trừ** exposure/ISO/frame duration/tonemap/AWB/CC/WB vendor; ép `AE_MODE=ON`, `AWB_MODE=AUTO`; EV = `M9CaptureTuning.exposureCompensation`; WB sáng tạo áp sau JPEG | `OemExtensionSession.request` |
| Pro | PREVIEW / RECORD / STILL | `ROTATE_AND_CROP=NONE`, `CONTROL_MODE=AUTO`. Manual khi đặt ISO hoặc shutter: `AE_MODE=OFF`, giá trị thiếu lấy từ lần đo gần nhất (mặc định ISO 100 / 10 ms), `FRAME_DURATION=min(max, max(exp, 33.3 ms))`; còn lại AE ON + EV clamp. Focus thủ công: `AF_MODE=OFF` + `LENS_FOCUS_DISTANCE`, không thì CONTINUOUS_PICTURE → AUTO → OFF. Tap focus: `AF_REGIONS` + trigger START→IDLE. Face detect chỉ khi cần. Still: `JPEG_ORIENTATION`, q100 | `nonrootpro.ProActivity.apply/setupSession` |
| Burst (code có, đang tắt) | STILL | copy mọi key `android.*`; `AE_MODE=OFF` với exp/ISO/frame duration từ physical result; flash OFF; AF/AE trigger IDLE; `AF_MODE=OFF` focus cố định; `AWB_MODE=OFF`, `CC_MODE=TRANSFORM_MATRIX` + gains/transform từ result; `ENABLE_ZSL=false`; `LENS_SHADING_MAP_MODE=ON`. Chụp N−1 khung `captureBurst`, deadline 3.5 s, giữ ≤6 result | `SoftwareRaw.remember/supplement` |

- **Định dạng:** Essential = JPEG; JPEG_R (Ultra HDR) khi API 34+ và extension AUTOMATIC báo hỗ trợ size đó (lỗi → JPEG). Pro = JPEG (maxImages 2) + RAW_SENSOR lớn nhất khi bật RAW (ghép Image với TotalCaptureResult → DNG); YUV_420_888 ≤ 640×480 chỉ cho analysis (histogram). Đường RAW Essential (RAW ≤16 MP, chỉ session thường) đang tắt.
- **EV bias cho Classic CCD** (`M9AutoExposure.update`): chỉ khi ISO ≤ 250 và exp ≤ 8 ms. Thumbnail preview, luma Rec.709; bật "bảo vệ highlight" khi mean ≥ 0.32, mean vùng giữa ≥ 0.28, tỉ lệ pixel > 0.65 ≥ 15% và tỉ lệ gần clip (max kênh ≥ 0.975; khi đang bật: 0.88) ≥ 1.5% (khi đang bật: 0.4%). Hysteresis: bật sau 1.5 s, tắt sau 3 s. Bias = −2/3 EV khi bảo vệ, −1/3 EV khi không; `steps = user − round(bias/step)`, clamp. (JADX decompile lỗi một phần, cần kiểm lại.)
- CCT/lux hợp lệ: CCT ∈ [1000, 20000], lux ∈ [0, 10000]; nguồn: capture result → preview → mặc định 5500 K / 200.

## Câu hỏi mở

1. Chưa đo thời gian render thật trên gauguin (cấm adb trong lượt này) — cần một lượt đo riêng.
2. Đặc tả chi tiết đường RAW merge (đang tắt trong app tham chiếu) có cần không, hay open-camera dựa hoàn toàn trên Phase 4 của plan?
3. Ba ONNX low/high/colorfix của đường ORT, `lm9_net.onnx`, `seplut_fivek.onnx` không có trong APK → chưa kiểm được header; nhánh Lm9Net/Portrait luôn fallback trên bản cài này.
4. Hệ số dp→pixel của watermark (giả định cạnh ngắn/1080) và hàm format shutter (1/x) chưa thấy trong mã; `OemExtensionSession.isReprocessable()` chưa đọc.
5. Công thức `restoreTexture`/`outputDenoise` tóm từ hằng số Ghidra, chưa trace hết.

## Appendix: REA evidence index

REA 6.3 CLI trên `miui-ports/leica/leica-installed.apk` (JADX headless). REA không phân tích được ELF ARM64 trên Windows (`provider_unavailable`), nên evidence native là địa chỉ hàm Ghidra headless trong `libfullm9.so`. Output thô: `miui-ports/leica/rea-out/` (không commit). ID rút gọn 16 hex đầu.

| Evidence | Đối tượng | Dùng cho |
|---|---|---|
| `ev_cefe5b9bb45d8c6a` | inspect-android-package (APK) | manifest, service, quyền |
| `ev_67e953de3b3d7bf2` | inspect-artifact `libfullm9.so` | native pipeline (native §1) |
| `ev_62887e0d656187d0` | class `fullm9.M9Graph` | style/colorfix, tile, ORT, calibration |
| `ev_fa416695d5ca994d` | class `fullm9.LeicaParams` | format param LUT/shading |
| `ev_8e09ebefbf5600ee` | class `fullm9.M9CpuPolicy` | auto-tune CPU |
| `ev_8707d096de6f894a` | class `donor120.LeicaEngine` | chọn look, chuỗi fallback |
| `ev_62f238980b360d83` | class `donor120.M9OrtFallback` | ORT style-only + detail |
| `ev_3a17810afc6ad110` | class `donor120.M3Mono` | Silver Mono |
| `ev_385ae81f1c858f86` | class `model120.MadridShader` | vignette/grain |
| `ev_b6923582e0b9f80a` | class `fullm9.PhotoJobStore` | job store, state machine (§2.5) |
| `ev_5e0a9fe00a6acc19` | class `fullm9.PhotoProcessingService` | service, notification |
| `ev_b8001ca0d9a7fb7a` | class `fullm9.PhotoMediaPublisher` | MediaStore publish |
| `ev_0f7943c83c138000` | class `leicaapp.OriginalWatermark` | watermark, gain map (§4.2) |
| `ev_662fff9ba4afe895` | class `leicaapp.AiVisualReference` | composition/aesthetic I/O (§4.3) |
| `ev_e92302001cd6ab71` | class `leicaapp.AiCropCandidates` | crop saliency |
| `ev_37373502c782a469` | class `leicaapp.AiAestheticChoice` | chọn ứng viên |
| `ev_ce5dfc5c770bf8e4` | class `leicaapp.LowLightCapture` | low light keys (§8.6) |
| `ev_d12f43c9b1dfb2eb` | class `leicaapp.SoftwareRaw` | burst, format |
| `ev_e322385a0cd1e75e` | class `leicaapp.OemExtensionSession` | extension session |
| `ev_602a4012b744dcde` | class `leicaapp.M9AutoExposure` | EV bias |
| `ev_491f1c0fc6429b40` | class `nonrootpro.ProActivity` | Pro request |
| Ghidra `libfullm9.so` | `0x135be4` frameCreate, `0x13c9a8` prepare, `0x13cdb0`/`0x13cf4c` style I/O, `0x13d0e0`/`0x13d314` tile I/O, `0x13b4f0` recover, `0x13b75c`/`0x13d4c0` LUT+shading, `0x134610` outputDenoise, `0x139280` restoreTexture | native pipeline |
| Script | `miui-ports/leica/scripts/onnx_header.py`, `scripts/DecompileByName.java` | ONNX I/O, decompile |
