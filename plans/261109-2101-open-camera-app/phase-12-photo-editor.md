---
phase: 12
title: "Editor hậu kì ảnh: chỉnh toàn cục, cục bộ, preset, RAW develop, xuất ảnh"
status: pending
effort: 10w
depends_on: [3, 5, 11]
---

# Phase 12: Editor hậu kì ảnh

## Bối cảnh

Phase 11 dựng khung editor (`EditorActivity`, `EditStack`, màn so sánh nhiều bản) và các công cụ retouch (làm đẹp, xóa vật thể, cân bằng trắng, hình học). Phase này biến editor đó thành công cụ hậu kì đầy đủ kiểu Lightroom Mobile/Snapseed: chỉnh toàn cục, đường cong, HSL, color grading, mask cục bộ (brush, gradient, mask AI), preset, RAW develop và xuất ảnh. Pipeline GPU dùng chung shader LUT/look của phase 3 để ảnh chỉnh trong editor khớp với ảnh chụp có look. Mask AI dùng runtime `:ml` của phase 5. Công cụ retouch của phase 11 trở thành các tool trong cùng ngăn xếp chỉnh.

Báo cáo nguồn, best practice và giấy phép thư viện: `plans/reports/researcher-261111-1307-camera-app-best-practices.md`.

Nguyên tắc: không phá hủy, không crash. Ảnh gốc không bao giờ bị ghi đè trừ khi người dùng chọn rõ ràng. Mọi tool có đường lùi: GPU lỗi thì CPU (Halide/OpenCV), model mask thiếu thì ẩn mask AI và giữ brush/gradient, hết bộ nhớ thì xử lý theo tile.

## Yêu cầu

### 1. Edit stack không phá hủy

- Định dạng lưu: JSON riêng của app (`EditStack` v2, có `schemaVersion`, danh sách tool theo thứ tự cố định của pipeline, tham số, mask tham chiếu file). Lưu trong thư mục riêng của app (`filesDir/edits/<MediaStore id>-<SHA-256 ảnh gốc 16 byte đầu>.json`) để không cần quyền ghi file của người khác và không phụ thuộc đường dẫn.
- Khóa liên kết: MediaStore `_ID` + hash nội dung; nếu `_ID` đổi (ảnh bị di chuyển, khôi phục) thì tìm lại theo hash.
- Ảnh xuất mang XMP: `xmp:CreatorTool`, `photoshop:History` tóm tắt, và namespace riêng `opencamera:EditStack` (JSON nén base64) để mở lại chỉnh tiếp từ chính ảnh xuất. Không ghi `crs:` (Camera Raw Settings) vì ngữ nghĩa thanh trượt khác Adobe; chỉ xuất sidecar `.xmp` tương thích một phần (exposure, contrast, temperature/tint, crop) khi người dùng chọn "Xuất XMP cho Lightroom".
- Revert: một nút "Về ảnh gốc" xóa stack; bản xuất trước đó vẫn là file riêng trong MediaStore. Ghi đè gốc chỉ khi người dùng chọn, qua `MediaStore.createWriteRequest` (API 30+) hoặc `RecoverableSecurityException` (API 29), có bản gốc lưu trong thư mục ẩn của app để hoàn tác 30 ngày.
- History: undo/redo không giới hạn trong phiên, gộp các thay đổi liên tiếp của cùng một thanh trượt thành một bước; snapshot đặt tên được.

### 2. Pipeline GPU

- OpenGL ES 3.0 (minSdk 26 có sẵn), render offscreen vào texture RGBA16F; Vulkan không cần ở phase này. Dùng chung module shader với phase 3 (`pipeline/src/main/glsl/`), LUT 3D 33³ hoặc 65³ dạng texture 3D.
- Thứ tự cố định theo chuẩn scene-referred: decode → linear (bỏ sRGB/Display-P3 transfer) → WB (temperature/tint trong không gian LMS/Bradford) → exposure → tone (highlights/shadows/whites/blacks, contrast) → clarity/texture/dehaze (local, cần pyramid) → HSL/color mixer → color grading → tone curve → look/LUT (phase 3) → mask cục bộ (mỗi mask là một nhánh tham số áp theo alpha) → sharpening/NR → vignette → grain → encode output.
- Proxy: ảnh xem trước 12 MP thu về cạnh dài 2048–3072 tùy RAM; pyramid cho clarity/dehaze tính một lần và cache khi tham số đầu vào không đổi.
- Chỉ render lại từ bước đầu tiên bị thay đổi (cache texture trung gian sau các bước nặng).
- Xuất full-res: cùng shader, chia tile 2048² có lề chồng theo bán kính lớn nhất của bộ lọc local, chạy trong hàng đợi nền phase 3 (WorkManager foreground).
- Màu: làm việc trong linear Display-P3 khi ảnh nguồn P3 (đọc ICC qua `ColorSpace` của `Bitmap`), ngược lại linear sRGB; giữ ICC khi xuất. Ảnh Ultra HDR đầu vào: chỉnh trên base SDR và tính lại gain map khi xuất (hoặc bỏ gain map, có cảnh báo).

### 3. Chỉnh toàn cục

- Ánh sáng: exposure (±5 EV), contrast, highlights, shadows, whites, blacks. Highlights/shadows dùng local tone mapping bằng guided filter hoặc bilateral grid (tránh halo), không chỉ đường cong toàn cục.
- Màu: temperature/tint (Kelvin khi ảnh có metadata WB, tương đối khi không), vibrance (bảo vệ tông da), saturation.
- Tone curve: RGB và từng kênh R/G/B, spline đơn điệu (Fritsch–Carlson) để không đảo tông; parametric curve (highlights/lights/darks/shadows) cho người mới.
- HSL / color mixer: 8 dải màu (đỏ, cam, vàng, lục, lam ngọc, lam, tím, hồng) chỉnh hue/saturation/luminance, trọng số mềm theo hue; chạm vào ảnh để chọn dải (targeted adjustment).
- Color grading: ba bánh xe shadows/midtones/highlights + global, blending và balance.
- Chi tiết: clarity (local contrast tần số trung), texture (tần số cao), dehaze (dark channel prior có giới hạn, He et al. 2009; thuật toán công khai), sharpening (amount/radius/detail/masking theo cạnh), noise reduction luminance/color (cổ điển: bilateral/non-local means nhanh; nút "AI denoise" gọi NAFNet phase 5).
- Hiệu ứng: vignette (sau crop, có roundness/feather/highlight protect), grain (dùng lại grain phase 3 nhưng ổn định theo độ phân giải: kích thước hạt tính theo cạnh ảnh, seed cố định để xem trước và xuất khớp).

### 4. Crop, xoay, hình học

- Dùng lại hình học phase 11 (tự cân, phối cảnh, méo ống kính); thêm crop với tỉ lệ (tự do, gốc, 1:1, 4:5, 3:2, 16:9, 9:16, 65:24), xoay 90°, lật, straighten ±45° với tự động mở rộng crop để không lộ viền.
- UI tham khảo hành vi của uCrop/Android-Image-Cropper (Apache-2.0); có thể dùng trực tiếp CanHub Android-Image-Cropper nếu tùy biến đủ, nếu không thì tự viết trên cùng canvas GL.

### 5. Auto

- One-tap Auto: thống kê trên proxy (histogram luminance, percentile 0.5/99.5 cho blacks/whites, trung vị cho exposure, gray-world có ngưỡng cho WB, saturation trung bình cho vibrance), ghi kết quả vào các thanh trượt thường để người dùng sửa.
- Tùy chọn ML: HDRNet của phase 11 khi có; kết quả ánh xạ ngược về thanh trượt không làm được thì áp như một lớp "Auto (AI)" có cường độ.
- Auto từng nhóm: Auto WB, Auto tone, Auto straighten.

### 6. Preset

- Preset tích hợp: các look phase 3 (Classic CCD, Rangefinder Neutral, Silver Mono, Vivid, Natural) + vài preset tham số (B&W tương phản, Matte, Warm film).
- Preset người dùng: lưu tập con tham số đang chỉnh (chọn nhóm nào được lưu), đặt tên, sắp xếp, thanh cường độ preset (nội suy tham số và trộn LUT).
- Import/export: `.cube` (1D/3D, kiểm kích thước và giá trị, từ chối file lỗi không crash), JSON preset của app (`.ocpreset`), chia sẻ qua `ACTION_SEND`.
- Copy/paste chỉnh sửa giữa ảnh (chọn nhóm), áp hàng loạt nhiều ảnh qua hàng đợi nền với tiến trình và hủy được.
- Preset từ color match: kết quả "copy màu từ ảnh mẫu" của phase 10 lưu thành preset LUT.
- Xem trước preset dạng thumbnail render trên proxy nhỏ (256 px), tính lười.

### 7. Chỉnh cục bộ (mask)

- Loại mask: brush (kích thước, feather, flow, xóa), linear gradient, radial gradient, luminance range, color range, và mask AI: subject, sky, person (toàn thân, tóc, da mặt nếu model hỗ trợ), background = đảo subject.
- Mask AI dùng segmenter của phase 5/11 qua `:ml`, chạy một lần trên proxy, nâng độ phân giải bằng guided filter theo ảnh gốc khi xuất. Thiếu model hoặc lỗi backend: các nút mask AI ẩn, có thông báo lý do.
- Phép cộng/trừ/giao mask; mỗi mask có bộ tham số con (exposure, contrast, highlights, shadows, temperature, tint, saturation, clarity, sharpness, NR, dehaze).
- Lưu mask: tham số hình học dạng vector trong JSON; brush lưu dạng stroke (điểm + bán kính) để render lại ở mọi độ phân giải; mask AI lưu PNG 8-bit ở độ phân giải proxy kèm hash model.

### 8. Retouch phase 11 như tool

- Healing/blemish, xóa vật thể, mắt đỏ, làm đẹp, trắng răng nằm trong cùng `EditStack` (bước dạng raster patch có tham chiếu file patch), thứ tự: sau geometry, trước tone.
- Dùng chung màn so sánh nhiều bản của phase 11.

### 9. Trước/sau và lịch sử

- Giữ để xem gốc, chế độ chia đôi kéo được, so với snapshot bất kỳ.
- Bật/tắt từng nhóm và từng mask để xem ảnh hưởng.
- Histogram live (RGB + luminance) và cảnh báo cháy sáng/mất chi tiết tối.

### 10. RAW develop

- Mở DNG (của app từ phase 7 và DNG ngoài app): đọc bằng parser DNG tự viết cho tập con phổ biến (uncompressed, lossless JPEG 92), tag `ColorMatrix1/2`, `ForwardMatrix`, `AsShotNeutral`, `BlackLevel`, `WhiteLevel`, `OpcodeList2/3` (GainMap cho lens shading). Tham khảo Adobe DNG SDK (giấy phép riêng dễ dãi, có thể dùng mã khi giữ thông báo) để kiểm tính đúng.
- Demosaic trong `:pipeline` (Halide): bilinear cho xem trước nhanh, Malvar-He-Cutler cho xuất; AHD/RCD chỉ khi tự viết từ paper, không lấy từ darktable/RawTherapee (GPL).
- Camera profile: matrix từ DNG, nội suy theo nhiệt độ màu; "Adobe Standard" không được dùng (độc quyền). Look phase 3 áp sau khi về scene-linear.
- RAW nằm ngoài tầm (CR3, NEF, ARW...): không hỗ trợ trong bản này, báo định dạng không hỗ trợ. Không dùng LibRaw trừ khi chấp nhận tuân thủ LGPL-2.1/CDDL (xem báo cáo).

### 11. Xuất và chia sẻ

- Định dạng: JPEG (chất lượng 50–100, mặc định 92), HEIF (`HeifWriter` androidx, có khi máy có encoder HEVC), AVIF (API 34+ qua `Bitmap.CompressFormat` nếu có; nếu không thì ẩn lựa chọn), PNG, JPEG Ultra HDR (API 34+ khi nguồn có gain map), DNG giữ nguyên (chỉ copy).
- Kích thước: gốc, cạnh dài 4096/2048/1080, tùy chỉnh; sharpen khi xuất cho màn hình/in (nhẹ).
- Metadata: giữ toàn bộ (mặc định), xóa vị trí (mặc định bật khi chia sẻ), xóa toàn bộ trừ orientation và màu. EXIF ghi bằng `androidx.exifinterface`; XMP ghi bằng writer nhỏ tự viết (APP1 `http://ns.adobe.com/xap/1.0/`).
- Lưu qua MediaStore với `IS_PENDING` cho tới khi ghi xong, `RELATIVE_PATH` `Pictures/OpenCamera/Edited`. Chia sẻ qua `FileProvider`/content URI, không cần quyền storage.

### 12. Hiệu năng (SM7225, Adreno 619, 6 GB)

| Thao tác | Mục tiêu |
|---|---|
| Kéo một thanh trượt toàn cục, proxy từ ảnh 12 MP | < 50 ms mỗi frame (≥ 20 fps), trung vị 10 lần |
| Thanh trượt cần pyramid (clarity, dehaze, highlights/shadows) | < 50 ms khi pyramid đã cache; tính lại pyramid < 150 ms |
| Mở ảnh 12 MP vào editor tới khung đầu | < 600 ms |
| Mask AI subject/sky trên proxy | < 800 ms |
| Xuất full-res 12 MP JPEG với stack đầy đủ (không có ML) | < 3 s |
| Xuất 50 MP | < 15 s, tile, có tiến trình |
| RAW develop xem trước 12 MP | < 1.5 s tới khung đầu |

### 13. Accessibility và i18n

- Mọi thanh trượt là `Slider` có `contentDescription`, giá trị đọc được, bước điều chỉnh bằng phím âm lượng/D-pad, chạm đôi để về 0. Vùng chạm ≥ 48 dp. Không dùng màu là tín hiệu duy nhất (cảnh báo cháy sáng có cả họa tiết).
- Hỗ trợ TalkBack cho bánh xe color grading (nhập số thay cho kéo), font scale 200%, RTL.
- Chuỗi trong `strings.xml`, có plural; số thập phân theo locale.

## Tệp và module

- `editor/` (module từ phase 11): `EditStack.kt` (v2 + migration v1→v2), `EditStore.kt` (JSON trong `filesDir`, liên kết MediaStore id + hash), `render/GlRenderer.kt`, `render/TileExporter.kt`, `tools/{Light,Color,Curve,Hsl,ColorGrading,Detail,Effects,Crop}Tool.kt`, `mask/{Brush,LinearGradient,RadialGradient,RangeMask,AiMask}.kt`, `preset/{PresetRepository,CubeParser,PresetCodec}.kt`, `export/{Exporter,XmpWriter,MetadataPolicy}.kt`, `raw/{DngReader,RawDevelop}.kt`.
- `pipeline/src/main/glsl/`: shader dùng chung với phase 3 (`tone.glsl`, `hsl.glsl`, `grading.glsl`, `curve.glsl`, `lut3d.glsl`, `local_contrast.glsl`, `vignette.glsl`, `grain.glsl`).
- `pipeline/src/main/cpp/develop/`: `demosaic` (Halide), `dng_opcodes`, `dehaze`, `bilateral_grid`, fallback CPU cho mọi shader.
- `ml/models/`: tái dùng segmenter phase 5/11; nếu thêm model sky riêng thì thêm `model.json` và dòng trong `licenses/models.md`.
- `app/src/test/` và `editor/src/androidTest/`: golden image test.

## Các bước

1. `EditStack` v2, `EditStore`, migration từ v1 của phase 11; undo/redo gộp bước; test khôi phục sau xóa/di chuyển ảnh.
2. `GlRenderer` với thứ tự pipeline cố định, cache bước trung gian, proxy theo RAM; fallback CPU; đo 50 ms trên gauguin trước khi thêm tool.
3. Chỉnh toàn cục ánh sáng + màu + tone curve + HSL + color grading; histogram.
4. Crop/xoay/straighten và tích hợp hình học phase 11.
5. Xuất: `TileExporter`, JPEG/PNG/HEIF/AVIF/Ultra HDR, metadata policy, XMP writer, MediaStore `IS_PENDING`, chia sẻ.
6. Auto một chạm thống kê; nối HDRNet khi phase 11 có.
7. Preset: built-in, người dùng, cường độ, `.cube` import/export, copy/paste, áp hàng loạt qua hàng đợi, preset từ color match.
8. Chi tiết: clarity/texture/dehaze, sharpening, NR, vignette, grain.
9. Mask cục bộ: brush, gradient, range; rồi mask AI subject/sky/person; phép kết hợp mask.
10. Đưa tool retouch phase 11 vào stack và màn so sánh.
11. RAW develop: `DngReader`, demosaic, camera matrix, opcode GainMap.
12. Accessibility, i18n, xuất XMP tương thích một phần, hoàn thiện before/after.

## Kiểm thử và tiêu chí chấp nhận

- Golden image: 40 ảnh thử (12 MP JPEG, 50 MP JPEG, HEIF, Ultra HDR, DNG của app, DNG ngoài) × bộ stack mẫu; xem trước và xuất khớp (PSNR proxy so với bản xuất thu nhỏ > 40 dB); GPU và CPU fallback khớp (ΔE2000 trung bình < 1).
- Không phá hủy: SHA-256 ảnh gốc không đổi sau mọi thao tác; mở lại stack cho kết quả giống (PSNR > 45 dB); stack JSON cũ (v1) mở được.
- Hiệu năng: bảng mục 12 đo bằng Macrobenchmark/trace trên gauguin, chế độ release.
- Không crash: file `.cube` hỏng, DNG lạ, ảnh 200 MP, hết bộ nhớ giả lập, GPU context lost, model mask bị xóa, MediaStore item bị xóa giữa chừng: app báo lỗi rõ ràng, giữ ảnh gốc. Monkey test 30 phút trên editor không crash.
- Metadata: chế độ "xóa vị trí" không còn GPS tag (kiểm bằng exiftool trong CI host test); XMP đọc được bằng exiftool.
- Accessibility: Accessibility Scanner không còn lỗi mức cao; TalkBack điều khiển được mọi thanh trượt.
- Giấy phép: REUSE xanh; không có mã từ darktable, RawTherapee, Snapseed, Fossify; LUT built-in tự tạo.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Adreno 619 không đạt 50 ms với clarity/dehaze trên proxy lớn | Proxy động theo thời gian frame đo được; pyramid cache; hạ proxy khi kéo, render đủ khi thả tay |
| Lệch màu giữa xem trước và xuất (half-float, tile seam) | Cùng shader và độ chính xác RGBA16F; tile chồng lề; golden test |
| Bộ nhớ khi xuất 50–200 MP | Tile, decode theo vùng (`BitmapRegionDecoder`), không giữ full-res bitmap trong RAM |
| Liên kết stack với MediaStore bị mất khi ảnh di chuyển | Khóa kép id + hash; stack nhúng trong XMP bản xuất |
| Người dùng kỳ vọng tương thích preset Lightroom (`.xmp`, `.dng` preset) | Ghi rõ chỉ hỗ trợ `.cube` và preset JSON; xuất XMP chỉ một phần, đánh dấu thử nghiệm |
| Định dạng HEIF/AVIF encoder không có trên máy cũ | Kiểm `MediaCodecList`/API level lúc chạy, ẩn lựa chọn |
| Vô tình dùng mã GPL (darktable, RawTherapee, Fossify Gallery) | Chỉ đọc paper; PR template checkbox nguồn gốc |
| Phạm vi lớn (10w) | Bước 1–5 là bản phát hành được; bước 6–12 thêm dần sau feature flag |

## Rollback

Tool mới nằm sau feature flag `editor_v2`; tắt flag thì editor phase 11 giữ nguyên. Stack v2 có migration một chiều; giữ đọc v1.

## Quyết định đã chốt (2026-11-11)

- **Mạng:** bản chính có quyền INTERNET, nhưng mọi truy cập mạng (tải model, tải hồ sơ máy, cập nhật preset) đều hỏi người dùng tại thời điểm cần, kèm dung lượng và nguồn tải; từ chối thì tính năng lùi về bản không mạng. Không gửi dữ liệu ảnh hay thống kê ra ngoài.
- **RAW gốc máy ảnh (CR3, NEF, ARW, RAF, ORF, RW2, ...):** hỗ trợ qua LibRaw, đóng gói thành thư viện chia sẻ riêng (libopencamera_libraw.so) liên kết động, dùng theo LGPL-2.1: ghi rõ trong NOTICE, kèm mã nguồn LibRaw đúng phiên bản (hoặc link bản phát hành), cho phép người dùng thay thư viện. DNG vẫn đi đường riêng của app.
- **XMP tương thích Lightroom một phần:** xuất/nhập các thông số cơ bản theo namespace crs: (Exposure2012, Contrast2012, Highlights2012, Shadows2012, Whites2012, Blacks2012, Temperature/Tint, Vibrance, Saturation, Clarity2012, Dehaze, ToneCurvePV2012, HSL, Sharpness, LuminanceSmoothing, Vignette, Grain, crop/angle). Chỉ tương thích gần đúng; ghi rõ trong UI và tài liệu những gì không chuyển được (mặt nạ AI, LUT riêng, local adjustments phức tạp).