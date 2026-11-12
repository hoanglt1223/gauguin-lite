# Open Camera: độ mượt, hoàn thiện và đưa lên F-Droid

Trạng thái: chưa làm. Chạy trên VM 104 sau lượt `vm-run` hiện tại (HDR, blur thật, ZSL, Ultra HDR, crash log, beta1 ký chuẩn, ROM).

## Mục tiêu

Mọi thao tác chính cảm giác tức thì và không giật trên gauguin (SM7225, máy yếu nhất cần hỗ trợ), và app có mặt trên F-Droid chính thức.

## Tiêu chí nghiệm thu (đo trên gauguin, bản release, sau khi dexopt)

| Thao tác | Ngưỡng |
|---|---|
| Mở app nguội → khung ngắm đầu tiên | ≤ 700 ms |
| Đổi chế độ không cần đổi use case (Ảnh ↔ Chân dung ↔ Night ↔ Pro) | không bind lại; khung ngắm không tắt; frame p95 ≤ 16,7 ms |
| Đổi Ảnh ↔ Video (phải bind lại) | chạm → khung ngắm mới ≤ 400 ms; không frame nào > 50 ms trên main thread; có hiệu ứng chuyển che khoảng chờ |
| Mở Cài đặt, bộ lọc, bảng Pro, thư viện, trình sửa ảnh | phản hồi chạm ≤ 100 ms, animation 60 fps, p95 ≤ 16,7 ms |
| Kéo thanh trượt (Pro, sửa ảnh) | p95 ≤ 16,7 ms (hiện 27–28 ms) |
| Đổi ống kính 0.6× ↔ 1× | có chuyển cảnh mượt; ghi rõ phần trễ do phần cứng |
| Bấm chụp → nút sẵn sàng chụp tiếp | ≤ 300 ms ở chế độ Ảnh |
| Không ANR, không crash | 30 phút monkey trên gói debug: 0 crash, 0 ANR |
| Bộ nhớ | không rò rỉ sau 50 lần đổi chế độ và 20 lần mở/đóng trình sửa (LeakCanary bản debug: 0 leak) |

## Giai đoạn

### 1. Đo nền tự động
- Module `macrobenchmark` (Jetpack Macrobenchmark + UiAutomator) cho các thao tác ở bảng trên; xuất JSON vào `benchmarks/`.
- Baseline Profile sinh tự động từ chính các kịch bản này và đóng gói vào bản release.
- Script chạy lại toàn bộ và so với lần trước; dùng làm cổng cho mọi giai đoạn sau.

### 2. Đổi chế độ không bind lại
- Gom use case: một lần bind Preview + ImageCapture + VideoCapture (hoặc theo chuỗi fallback) khi thiết bị cho phép, để Ảnh ↔ Video chỉ đổi trạng thái; nếu thiết bị không đủ, giữ bind lại nhưng chạy nền và che bằng ảnh mờ khung cuối.
- Chế độ chỉ khác xử lý hậu kỳ (Chân dung, Night, Pro, bộ màu) không đụng tới camera.
- Đặt trước cấu hình kế tiếp khi người dùng bắt đầu vuốt thanh chế độ.

### 3. Main thread và bố cục
- Bỏ mọi I/O, decode, đọc SharedPreferences/DataStore đồng bộ khỏi main thread (StrictMode bật trong debug, lỗi là fail test).
- Dựng sẵn (lazy nhưng prewarm khi rảnh) bảng Pro, bộ lọc, Cài đặt; tránh layout lại toàn cây khi đổi chế độ; cố định kích thước khung ngắm theo tỷ lệ để không đo lại.
- Thanh trượt: gộp cập nhật theo frame (Choreographer), chỉ vẽ lại vùng cần.

### 4. Hiệu ứng và phản hồi
- Hiệu ứng chuyển thống nhất (mờ dần + trượt pill) cho đổi chế độ, đổi ống kính, mở bảng; rung nhẹ khi đổi chế độ và chụp.
- Nút chụp phản hồi ngay khi chạm (animation chạy trên RenderThread), lưu ảnh chạy nền với chỉ báo ở ảnh thu nhỏ.

### 5. Hoàn thiện
- Rà toàn bộ luồng (Glass và Origin): nhãn, căn lề, chế độ tối, xoay máy, khả năng tiếp cận (TalkBack, cỡ chữ lớn, vùng chạm ≥ 48 dp).
- Monkey 30 phút + LeakCanary + kiểm tra ANR; sửa hết lỗi tìm thấy.
- Test trên iQOO trong giới hạn cho phép (cài, mở, logcat, chụp màn hình).

### 6. F-Droid
- Build tái lập: khớp hash giữa hai lần build sạch; không có thư viện độc quyền (Play Services, Firebase, ML Kit bản đóng); kiểm tra bằng `fdroid scanner`.
- Model AI: F-Droid không cho tải nhị phân không có nguồn trong build; giữ tải theo yêu cầu người dùng (đã có hỏi trước khi tải), khai báo anti-feature `NonFreeNet` nếu cần, ghi nguồn và giấy phép từng model.
- LibRaw và mã native: build từ nguồn trong recipe (NDK phiên bản cố định).
- `metadata/dev.opencamera.app.yml`, fastlane metadata (mô tả tiếng Anh và tiếng Việt, ảnh chụp màn hình, changelog), tag phiên bản và `versionCode` tăng đều.
- Chạy `fdroid build` cục bộ trong container của fdroidserver cho tới khi thành công, rồi mở merge request vào `fdroiddata` trên GitLab. Mở MR là đăng công khai: hỏi người dùng trước khi gửi.
- Nếu muốn có ngay: repo F-Droid riêng (tự host trên GitHub Pages) như phương án tạm.

## Rủi ro
- Bind chung Preview + ImageCapture + VideoCapture có thể không được hỗ trợ trên gauguin ở 16 MP; giữ fallback hiện tại.
- F-Droid duyệt có thể mất vài tuần; yêu cầu sửa recipe là bình thường.

## Câu hỏi còn mở
- Tài khoản GitLab để mở MR vào `fdroiddata` (người dùng tự tạo/đăng nhập).
