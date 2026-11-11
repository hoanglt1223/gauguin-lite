---
phase: 10
title: "Chế độ sáng tạo: chụp trăng, copy màu từ ảnh mẫu và các chế độ bổ sung"
status: pending
effort: 8w
depends_on: [3, 4, 5]
---

# Phase 10: Chế độ sáng tạo

## Bối cảnh

Plan hiện có chân dung xóa phông (phase 5), toàn cảnh và tài liệu (phase 6), chụp sao (phase 4), nhập `.cube` (phase 3). Còn thiếu chụp trăng và lấy màu từ một ảnh bất kỳ. Phase này gom các chế độ sáng tạo dựa trên hạ tầng đã có: pipeline đa khung (phase 4), LUT và hàng đợi xử lý (phase 3), segmentation và model nhẹ (phase 5). Mọi chế độ tuân theo nguyên tắc không crash của plan: thiếu khả năng phần cứng thì ẩn hoặc lùi về chụp thường.

## Yêu cầu

### 1. Chụp trăng (Moon mode)

- Phát hiện trăng trong khung: vùng sáng tròn nhỏ trên nền tối (Hough circle trên ảnh preview thu nhỏ, kiểm tra độ tròn và tương phản), gợi ý bật chế độ khi zoom ≥ 2x về phía trời tối.
- Phơi sáng theo trăng: đo sáng điểm trên đĩa trăng, khóa AE/AF, phơi ngắn và ISO thấp để không cháy; lấy nét vô cực.
- Chất lượng thật, không bịa chi tiết: burst 10–30 khung, chọn khung nét nhất (lucky imaging theo Laplacian variance), căn chỉnh và chồng khung (dùng aligner phase 4), deconvolution nhẹ (Richardson–Lucy, số vòng giới hạn) và unsharp mask. Không dùng texture trăng có sẵn hay model sinh chi tiết; ghi rõ trong mô tả chế độ.
- Dùng tele nếu profile có; nếu không, crop từ camera chính + Super Res của phase 4.
- Chân máy: đề xuất hẹn giờ 2 s, cảnh báo rung theo gyro.

### 2. Copy màu từ ảnh bất kỳ (Color match / LUT từ ảnh mẫu)

- Người dùng chọn ảnh mẫu (thư viện hoặc chia sẻ vào app), app tạo look mới và áp cho ảnh khác hoặc cho camera (preview + chụp).
- Thuật toán, theo thứ tự chất lượng tăng dần, đều chạy trên máy:
  1. Thống kê màu trong không gian Lab/Oklab (khớp trung bình và độ lệch chuẩn từng kênh, kiểu Reinhard).
  2. Khớp histogram theo kênh và theo độ sáng, giữ cân bằng sáng của ảnh đích.
  3. Optimal transport / sliced Wasserstein trên mẫu điểm màu, cho kết quả gần nhất với ảnh mẫu.
- Kết quả "nướng" thành LUT 3D 33³ để tái sử dụng: áp realtime trên preview bằng shader phase 3, xuất ra `.cube` để dùng trong Lightroom/DaVinci, nhập lại được.
- Bảo vệ da: mask da (segmentation phase 5 hoặc ngưỡng màu) giảm cường độ biến đổi trên vùng da để tránh da xanh/tím.
- Thanh cường độ 0–100%, so sánh trước/sau, lưu thành look có tên trong bộ look của người dùng.
- Áp hàng loạt cho nhiều ảnh qua hàng đợi phase 3.

### 3. Gợi ý thêm (ưu tiên theo giá trị)

1. **Phơi sáng dài mô phỏng** (nước mịn, vệt đèn xe, light painting): chồng nhiều khung với trung bình hoặc max-blend, không cần ND filter.
2. **Ảnh động (Motion Photo)**: lưu 1–3 s video quanh lúc bấm theo định dạng Motion Photo (JPEG + MP4 nhúng, XMP `GCamera:MotionPhoto`), mở được trong Google Photos.
3. **Xếp nét macro (focus stacking)**: chụp chuỗi khoảng nét, căn và ghép theo độ nét cục bộ; dành cho camera chính lấy nét gần thay cho macro 2MP yếu.
4. **Timelapse sao và hyperlapse**: timelapse đêm dùng merge phase 4 cho từng khung; hyperlapse ổn định bằng gyro.
5. **Chụp liên tiếp thể thao**: burst có bám chủ thể (tracking theo segmentation/IoU), chọn khung đẹp nhất.
6. **Xóa người qua đường**: chồng nhiều khung, lấy median theo pixel để loại vật thể chuyển động (không dùng AI sinh ảnh).
7. **Chụp trước khi bấm (pre-shot buffer)**: giữ ring buffer vài khung, lưu cả khung trước lúc bấm.

## Tệp và module

- `pipeline/src/main/cpp/{moon,colormatch,stack}/` cho xử lý native; Kotlin facade trong `:pipeline`.
- `app/.../modes/{MoonMode,ColorMatchActivity,LongExposureMode,MotionPhoto,FocusStack}.kt`.
- Look người dùng lưu chung kho look của phase 3 (`looks/user/<id>/look.json` + `lut.cube`).

## Các bước

1. Color match (giá trị cao, phụ thuộc ít): Reinhard Lab → histogram → sliced OT, bake LUT, UI chọn ảnh mẫu, xuất/nhập `.cube`.
2. Moon mode: phát hiện, phơi sáng, lucky imaging + stack + deconvolution.
3. Phơi sáng dài mô phỏng, xóa người qua đường (dùng chung bộ chồng khung).
4. Motion Photo, pre-shot buffer.
5. Focus stacking, timelapse sao/hyperlapse, burst thể thao.

## Kiểm thử và tiêu chí chấp nhận

- Color match: ΔE trung bình giữa histogram ảnh kết quả và ảnh mẫu giảm ≥ 50% so với ảnh gốc trên bộ ảnh thử; LUT xuất ra mở được trong DaVinci Resolve; preview và ảnh lưu khớp nhau (ΔE < 2).
- Moon: trên gauguin và một máy có tele (iQOO 13), ảnh trăng có chi tiết miệng núi lửa rõ hơn ảnh đơn, không bị cháy; không có chi tiết bịa (so với ảnh đơn cùng điều kiện).
- Mọi chế độ: thiếu tele/RAW/stream cần thiết thì chế độ tự ẩn hoặc lùi về chụp thường, không crash.

## Rủi ro

- Deconvolution quá tay tạo viền ringing: giới hạn số vòng, có thanh cường độ.
- Optimal transport tốn CPU trên SM7225: chạy trên ảnh thu nhỏ, chỉ bake LUT rồi áp LUT trên GPU.
- Motion Photo cần buffer video liên tục, tốn pin và có thể vượt giới hạn số stream: chỉ bật khi người dùng chọn, có đường lùi.
