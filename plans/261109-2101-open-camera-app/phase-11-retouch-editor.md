---
phase: 11
title: "Editor retouch: làm đẹp, xóa vật thể, tự động cải thiện, chỉnh hình học"
status: pending
effort: 10w
depends_on: [3, 5]
---

# Phase 11: Editor retouch

## Bối cảnh

Phase 5 chỉ có beauty lúc chụp bằng MediaPipe face mesh. Phase 10 có xóa người qua đường bằng median đa khung, chỉ dùng được lúc chụp. Phase này thêm một editor để sửa ảnh đã chụp (ảnh của app và ảnh chia sẻ vào app), dùng lại runtime `:ml` của phase 5 và hàng đợi nền, LUT, shader của phase 3. Nguồn và giấy phép từng ứng viên: `plans/reports/researcher-261111-0827-open-source-retouch.md`.

Nguyên tắc chọn: thuật toán cổ điển tự viết trước (nhanh, không thêm model), model nhỏ giấy phép dễ dãi sau, model lớn chỉ là gói tải thêm. Mọi thao tác không phá hủy (lưu danh sách bước chỉnh, ảnh gốc giữ nguyên) và tuân theo nguyên tắc không crash của plan: thiếu model, hết bộ nhớ hay GPU delegate lỗi thì lùi về thuật toán đơn giản hơn hoặc ẩn công cụ, báo người dùng lý do.

## Yêu cầu

### 1. Khung editor

- `EditorActivity` mở từ thư viện của app hoặc qua intent `ACTION_EDIT`/`ACTION_SEND`. Xem trước trên ảnh thu nhỏ (cạnh dài 2048), xuất ở độ phân giải gốc qua hàng đợi nền phase 3.
- Lịch sử chỉnh dạng danh sách thao tác (`EditStack`, JSON) có undo/redo, lưu cạnh ảnh để sửa lại; xuất bản mới vào MediaStore, không ghi đè gốc trừ khi người dùng chọn.
- So sánh trước/sau (giữ để xem bản gốc), thanh cường độ cho mọi công cụ.
- Markup (bút, chữ, mũi tên, sticker): dùng hoặc tham khảo PhotoEditor (MIT).

### 2. Làm đẹp mặt (mở rộng beauty phase 5, nay chạy trong editor)

- Mask: MediaPipe Face Landmarker (478 điểm) cho vùng mắt, môi, răng, lông mày; Selfie Multiclass Segmenter cho da mặt/da thân/tóc (sau khi kiểm model card). Không có model thì mask theo ngưỡng màu da YCrCb trong đa giác face mesh, cuối cùng là không mask (công cụ tắt).
- Làm mịn da: frequency separation (lớp thấp tần bằng guided filter, giữ lớp cao tần với hệ số giảm), chỉ trong mask da, tránh mắt, lông mày, môi, tóc. Mặc định nhẹ để giữ texture da.
- Xóa mụn/đốm: chạm một điểm thì phát hiện đốm (difference of Gaussian trong bán kính nhỏ), vá bằng OpenCV `inpaint` Telea cho đốm nhỏ; vùng lớn hơn dùng PatchMatch tự viết (healing brush, lấy mẫu từ da xung quanh, khớp độ sáng theo Poisson blending).
- Làm trắng răng: mask răng từ landmark vòng môi trong và ngưỡng độ sáng, giảm b* (vàng) trong Lab và tăng nhẹ L*, giới hạn để không trắng xám.
- Sáng mắt: tăng nhẹ độ sáng và local contrast vùng mống mắt, không đổi màu mắt.
- Khử mắt đỏ: vùng con ngươi từ landmark mống mắt, phát hiện pixel đỏ (R / (G+B) vượt ngưỡng), thay bằng độ sáng trung tính, làm mềm biên. Công cụ thủ công: chạm vào mắt.

### 3. Chỉnh hình mặt/thân (tắt mặc định)

- Warp mesh từ landmark (Moving Least Squares hoặc tam giác hóa face mesh + warp affine từng tam giác trên GPU): gọn mặt, to mắt, gọn mũi; thân: chỉ công cụ liquify thủ công (đẩy, phình, co).
- Đạo đức: không bao giờ bật tự động, không có preset "đẹp" mặc định, giới hạn cường độ tối đa (ví dụ to mắt ≤ 10%, gọn mặt ≤ 8%), ghi `Software` và XMP `photoshop:History` hoặc tag riêng cho biết ảnh đã chỉnh hình dạng. Không áp lúc chụp.
- Bảo vệ nền: kiểm tra đường thẳng nền bị cong (độ lệch Hough trước/sau) và giảm bán kính warp nếu méo.

### 4. Xóa vật thể/người (inpainting)

- Người dùng tô mask (brush, tự động gợi ý mask người/vật từ segmentation phase 5 khi chạm).
- Bậc xử lý: đốm nhỏ dưới 1% diện tích dùng Telea; vùng vừa dùng MI-GAN 512 (ONNX pipeline, MIT) trên crop quanh mask, ghép lại ở độ phân giải gốc với feather; gói tải thêm big-lama (Apache-2.0, ONNX 512, khoảng 200 MB) cho vùng lớn, người dùng chọn chất lượng cao.
- Crop quanh mask được scale về 512, vá, rồi phóng lại và chỉ thay pixel trong mask (giãn vài pixel), giữ chi tiết ngoài vùng.
- Lùi: MI-GAN lỗi hoặc thiếu bộ nhớ thì PatchMatch, PatchMatch quá thời gian thì Telea.

### 5. Tự động cải thiện và màu

- Auto-enhance: HDRNet (Apache-2.0) huấn luyện lại trên dữ liệu giấy phép rõ, xuất TFLite, grid slicing chạy trên shader; trước khi có model thì auto bằng thống kê (auto levels theo percentile, gamma theo trung vị độ sáng, vibrance có bảo vệ da). Kết quả hiển thị như các thanh trượt thường để người dùng sửa.
- Cân bằng trắng: chạm điểm trung tính, gray-world/white-patch, rồi FFCC port từ MATLAB sang C++ (Apache-2.0). Không dùng Deep White Balance (cấm thương mại).
- Không dùng Zero-DCE (CC BY-NC 4.0).

### 6. Bầu trời, nền, ánh sáng

- Thay/tăng cường bầu trời: mask trời từ segmenter (lớp sky của DeepLab/MediaPipe nếu có, nếu không thì ngưỡng màu + gradient, tinh chỉnh bằng guided filter); tăng cường = tăng độ bão hòa và gradient; thay trời bằng ảnh trời CC0 của dự án, khớp màu tiền cảnh bằng color transfer của phase 10.
- Nền: làm mờ hoặc thay nền trong editor dùng lại bokeh phase 5 (mask người + disc blur).
- Relight chân dung: normal xấp xỉ từ face mesh, thêm nguồn sáng ảo (Lambert + mềm), chỉ áp trong mask người. Không có model relight mở có weights dùng được.

### 7. Chi tiết và độ phân giải

- Denoise và làm nét trong editor: dùng lại NAFNet phase 5; làm nét = unsharp mask có ngưỡng và giới hạn halo.
- Upscale: dùng lại Real-ESRGAN phase 5 (`realesr-general-x4v3` nhẹ cho máy yếu). Không dùng SwinIR (chậm trên GPU di động).
- Phục hồi mặt: không làm trong phase này. CodeFormer phi thương mại, GFPGAN có rủi ro giấy phép weights và bịa chi tiết.

### 8. Hình học

- Méo ống kính: dùng `LENS_DISTORTION`/`LENS_INTRINSIC_CALIBRATION` của Camera2 lưu trong metadata lúc chụp (ảnh của app); ảnh ngoài app dùng thanh trượt thủ công. Không dùng Lensfun (LGPL, dữ liệu CC BY-SA).
- Phối cảnh: chỉnh dọc/ngang thủ công (homography) và tự động từ đường thẳng (LSD/Hough, tìm điểm tụ).
- Tự cân: ước lượng góc đường chân trời/đường dọc chủ đạo, xoay và crop giữ khung chữ nhật lớn nhất.

## Tệp và module

- `editor/` (module mới, Kotlin): `EditorActivity.kt`, `EditStack.kt`, `tools/{Beauty,Blemish,Reshape,Erase,Enhance,WhiteBalance,Sky,Relight,Geometry,Markup}Tool.kt`.
- `pipeline/src/main/cpp/retouch/`: `guided_filter`, `freq_sep`, `patchmatch`, `poisson_blend`, `mls_warp`, `redeye`, `perspective`, `horizon`.
- `ml/models/{migan,lama,hdrnet,face_landmarker,selfie_multiclass}/model.json` (nguồn, giấy phép, SHA-256); big-lama qua `ModelDownloader`.
- `licenses/models.md`: thêm mỗi model mới.

## Các bước (theo giá trị/công sức)

1. Khung editor, `EditStack`, xuất qua hàng đợi nền; benchmark guided filter, Telea, MI-GAN trên gauguin.
2. Hình học: crop, xoay, tự cân, phối cảnh (thuần OpenCV, rủi ro thấp).
3. Cân bằng trắng (chạm điểm, gray-world) và auto-enhance thống kê.
4. Xóa vật thể: Telea → MI-GAN → PatchMatch lùi; gợi ý mask từ segmentation.
5. Làm đẹp: mask mặt, làm mịn da, xóa mụn, mắt đỏ, trắng răng, sáng mắt.
6. Nền và bầu trời (dùng lại bokeh và color transfer), denoise/làm nét/upscale từ phase 5.
7. Chỉnh hình mặt/liquify với giới hạn đạo đức.
8. FFCC port, HDRNet huấn luyện lại, big-lama gói tải thêm, relight.
9. Markup.

## Kiểm thử và tiêu chí chấp nhận

Mục tiêu thời gian trên gauguin (SM7225), ảnh 12MP, đo ở chế độ release, trung vị 10 lần:

| Thao tác | Xem trước (2048 px) | Xuất 12MP |
|---|---|---|
| Làm mịn da (guided filter + freq sep) | < 150 ms | < 1.5 s |
| Xóa mụn một điểm (Telea) | < 50 ms | < 200 ms |
| Mắt đỏ, trắng răng, sáng mắt | < 100 ms | < 500 ms |
| Warp mặt (GPU) | ≥ 30 fps khi kéo thanh | < 1 s |
| Xóa vật thể MI-GAN (crop 512) | < 1.5 s | < 2.5 s |
| Xóa vật thể big-lama (crop 512, CPU) | < 8 s | < 10 s |
| Auto-enhance thống kê / HDRNet | < 100 ms / < 200 ms | < 1 s |
| Tự cân + phối cảnh | < 200 ms | < 1 s |
| Upscale x2 general-x4v3 tiled | không áp dụng | < 30 s, có thanh tiến trình, hủy được |

- Đường lùi: GPU delegate lỗi thì CPU; model thiếu thì thuật toán cổ điển; hết bộ nhớ khi xuất thì xử lý theo tile, vẫn lỗi thì báo và giữ ảnh gốc. Test bằng cách xóa file model, ép backend lỗi, giả lập `OutOfMemoryError`: app không crash, công cụ báo lý do.
- Không phá hủy: ảnh gốc giữ nguyên byte (so SHA-256) sau mọi thao tác; mở lại `EditStack` cho cùng kết quả (PSNR > 45 dB).
- Chất lượng: xóa vật thể trên bộ 30 ảnh thử có điểm đánh giá mắt tốt hơn Telea; làm mịn da giữ texture (năng lượng cao tần trong mask da không giảm quá 50% ở mức mặc định).
- Chỉnh hình: tắt mặc định, không thể vượt giới hạn cường độ, ảnh đã chỉnh có tag metadata.
- Giấy phép: CI REUSE xanh, `licenses/models.md` có MI-GAN, LaMa, HDRNet, MediaPipe; không có weights Zero-DCE, Deep WB, CodeFormer, GFPGAN.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| LaMa dùng FFT, GPU delegate không hỗ trợ, CPU chậm | Chỉ là gói tải thêm, chạy CPU nền có tiến trình; mặc định MI-GAN |
| Giấy phép weights MI-GAN chưa rõ ràng | Ghi nguồn và hash, kiểm lại trước mỗi release; đường lùi PatchMatch không cần model |
| Model card MediaPipe multiclass khác Apache-2.0 | Kiểm trước khi đóng gói; lùi về mask theo face mesh + ngưỡng màu |
| Làm mịn da và warp gây phản cảm, chuẩn đẹp ép buộc | Tắt mặc định, giới hạn cường độ, gắn tag metadata |
| Bộ nhớ khi xuất 12MP+ trên máy 6 GB | Xử lý theo tile, giải phóng bitmap sớm, chỉ vá crop quanh mask |
| Dữ liệu huấn luyện HDRNet (FiveK, FFHQ) không phân phối lại được | Chỉ dùng auto thống kê cho tới khi có dataset giấy phép rõ |
| Vô tình chép code GPL (darktable, RawTherapee, G'MIC) | Chỉ đọc paper và tài liệu thuật toán, PR template có checkbox nguồn gốc |

## Rollback

Module `editor` sau feature flag; tắt flag thì ẩn nút chỉnh sửa, phần chụp không đổi.

## Quyết định đã chốt (2026-11-11)

- **Xóa vật thể:** làm cả hai backend. MI-GAN đi kèm APK làm mặc định; big-lama (~200 MB) là gói tải thêm tùy chọn. Trình chỉnh có chế độ **so sánh nhiều bản**: chạy cùng một vùng chọn qua MI-GAN, big-lama (nếu đã tải), PatchMatch và Telea, hiện các kết quả cạnh nhau để người dùng chọn bản giữ lại. Bản nào lỗi hoặc quá thời gian thì bỏ khỏi lưới so sánh, không crash.
- **Phục hồi khuôn mặt:** được phép nếu có model giấy phép sạch, nhưng luôn tắt mặc định, ghi rõ "tạo thêm chi tiết", và cũng dùng màn so sánh nhiều bản (gốc, làm mịn cổ điển, từng model phục hồi) để người dùng chọn. Ảnh dùng model sinh chi tiết được gắn metadata đánh dấu.
- Màn so sánh dùng chung cho các tính năng có nhiều cách xử lý (auto-enhance, cân bằng trắng, khử nhiễu, tăng độ phân giải): lưới 2–4 ô, chạm để phóng to, thanh trượt trước/sau.