---
title: Giao diện trình chỉnh ảnh (Glass + Origin)
status: proposed
created: 2026-11-11
depends_on: [../261111-1419-camera-ui-skins/plan.md, ../261109-2101-open-camera-app/phase-11-retouch-editor.md, ../261109-2101-open-camera-app/phase-12-photo-editor.md]
---

# Giao diện trình chỉnh ảnh

Thay giao diện chỉnh ảnh/retouch tạm thời bằng một trình chỉnh thống nhất, dùng chung `SkinTokens` với màn hình camera. Hai skin: **Glass** (mặc định, ảnh tràn viền, thanh công cụ dạng viên nang mờ) và **Origin** (dock nền đặc, ảnh có khung, nhấn màu cam). Bố cục và hành vi giống hệt nhau; skin chỉ thay token.

Mockup: `mockups/index.html` (chọn skin / xem song song), `mockups/glass-editor.html`, `mockups/origin-editor.html`. Dùng `../261111-1419-camera-ui-skins/mockups/assets/base.css` + `mockups/assets/editor.css` + `mockups/assets/editor-mock.js`. Ảnh mẫu là gradient placeholder (không cần mạng). Nút EN/VI đổi ngôn ngữ chuỗi giao diện.

## Tham chiếu (lấy ý, không sao chép)

- iOS 26 Photos: thước kẻ (ruler dial) vạch đều, kim giữa, điểm 0 có chấm, viên nang mờ nổi.
- Lightroom Mobile: Masks (AI Sky/Subject/Background + Brush/Linear/Radial), Curves, Color grading 3 bánh xe, lịch sử.
- Snapseed: vuốt để đổi công cụ, nhấn giữ để so sánh.
- VSCO: lưới look có thumbnail + cường độ.
- vivo/iQOO Album, Xiaomi Gallery: tab icon-trên-chữ, dock nền đặc, Xóa vật thể nhiều kết quả.

## Bố cục màn hình (dọc, 360×800dp tham chiếu)

| Vùng | Glass | Origin |
|---|---|---|
| Thanh trên (48dp, top 40) | Hủy · Hoàn tác · Làm lại · RAW · Lịch sử · So sánh · **Xong** (nút nhấn màu) | như Glass, nền trong suốt, nút bo 8dp |
| Ảnh | tràn viền `inset 0` | `inset 96/12/236/12`, bo 6dp |
| Dock (236dp) | gradient tối, thanh danh mục là viên nang mờ cách lề 12dp | nền `#121214`, viền trên 1dp |
| Panel ngữ cảnh | nằm trên thanh danh mục: giá trị → thước → chip | như Glass |

Danh mục (thứ tự cố định, cuộn ngang, snap giữa): **Auto, Adjust, Looks, Crop, Retouch, Masks, Color, Export**.

### Từng màn hình

1. **Home / Adjust** — chip: Exposure, Brilliance, Highlights, Shadows, Contrast, Saturation, Vibrance, Warmth, Tint, Sharpness, Noise, Vignette. Chip đã chỉnh có chấm nhấn. Giá trị hiện trên thước (`Exposure +12`), vạch tô từ 0 đến giá trị.
2. **Auto** — một chạm áp Auto, toast xác nhận, chip phụ Auto tone / Auto WB / Bỏ Auto. Ghi một mục lịch sử.
3. **Looks** — hàng thumbnail 64dp render bằng proxy thật, thước cường độ 0–100. "Match" = color match (chọn ảnh tham chiếu).
4. **Crop** — khung + lưới 1/3, che ngoài 50%; thước Straighten ±45° bước 0,5°; chip tỷ lệ Free/Original/1:1/4:5/16:9, Rotate, Flip, Perspective (dọc/ngang, dùng cùng thước).
5. **Retouch** — chip công cụ: Remove, Spot, Skin, Red-eye, Teeth, Eyes, Reshape (Reshape ẩn mặc định theo phase 11). Cọ: Size, Hardness, Tap-select. Sau "Remove ▸": lưới 4 kết quả (2–4 tùy model) + thanh chia trước/sau kéo được; chạm ô để chọn.
6. **Masks** — danh sách mask: AI Sky/Subject/Background, Brush, Linear, Radial, Invert; thao tác Add/Subtract/Show overlay/Adjust (mở lại panel Adjust trong phạm vi mask). Lớp phủ đỏ 35%.
7. **Color** — segmented: Curves (điểm kéo, kênh RGB/R/G/B), HSL (8 chấm màu × Hue/Sat/Lum), Grade (3 bánh xe Shadows/Midtones/Highlights + Blending/Balance).
8. **History** — bottom sheet, mới nhất ở trên, các bước "tương lai" mờ 40%; chạm để nhảy.
9. **Export** — sheet: định dạng JPEG/HEIF/PNG/DNG, kích thước Full/4096/2048/1080, chất lượng, Xóa vị trí & metadata (bật sẵn), Giữ ảnh gốc (bật sẵn), Lưu.
10. **RAW** — huy hiệu `RAW` trên thanh trên khi nguồn là DNG; Adjust có thêm WB nhiệt độ K thật và độ phơi sáng EV.
11. **Ngang / tablet** — ảnh bên trái, thanh trên thành cột dọc 56dp bên trái, dock thành cột phải 292dp. Tablet ≥600dp dùng bố cục ngang ở cả hai hướng.

## Cử chỉ

| Cử chỉ | Hành vi | Haptic |
|---|---|---|
| Chụm / kéo trên ảnh | zoom 1–8×, pan khi >1× | — |
| Chạm đúp trên ảnh | 1× ↔ 2,5× | — |
| Nhấn giữ ảnh (280ms) hoặc giữ nút So sánh | hiện ảnh gốc + nhãn "Ảnh gốc" | TICK |
| Kéo thước | 2px = 1 bước; snap tại 0 | CLOCK_TICK mỗi 10 bước, CONFIRM khi qua 0 |
| Chạm đúp thước | đặt lại 0, ghi lịch sử | CONFIRM |
| Vuốt ngang vùng panel (ngoài thước/chip) | công cụ kế/trước | TICK |
| TalkBack | thước là `Slider` với `progressRangeInfo`, tăng/giảm bằng swipe dọc | — |

## Thành phần Compose (dùng chung `SkinTokens`)

Tất cả nhận màu/bo góc/cỡ chữ/motion từ `LocalSkinTokens`; không hardcode màu.

| Component | Ghi chú |
|---|---|
| `EditorScaffold(state, skin)` | đặt `EditorTopBar`, `EditorCanvas`, `EditorDock`; chọn bố cục dọc/ngang theo `WindowSizeClass` |
| `EditorTopBar` | dùng lại `SkinIconButton` của camera (48dp) + `SkinPillButton` |
| `EditorCanvas` | `AndroidView(GLSurfaceView)` render proxy; `transformable` cho zoom/pan; `pointerInput` long-press → `compare=true` |
| `CategoryBar` | `LazyRow` + `SnapFlingBehavior`; Glass: nền `tokens.surface` + blur (API 31+ `RenderEffect`, dưới 31 dùng alpha 0.85 đặc) |
| `RulerDial(value, range, step, onChange, onCommit)` | vẽ bằng `Canvas` (không tạo view mỗi vạch), `draggable` + `semantics { setProgress }` |
| `ParamChipRow` | chip + chấm "dirty" |
| `LookThumbRow` | thumbnail 128px render một lần từ proxy, cache LRU |
| `CropOverlay`, `StraightenDial` (= `RulerDial`) | |
| `CurveEditor`, `HslMixer`, `ColorWheel` | |
| `BrushOverlay` | con trỏ cọ + mask stroke vào `Bitmap` ALPHA_8 |
| `ResultGrid` + `SplitCompare` | 2–4 ô; thanh chia kéo được |
| `MaskList` | |
| `HistorySheet`, `ExportSheet` | dùng `SkinSheet` của camera |
| `EditorToast` | |

State: `EditorViewModel` giữ `EditStack` bất biến (list `EditOp`, con trỏ `at`); slider chỉ commit khi thả tay (giá trị tạm trong `mutableFloatState`).

## Hiệu năng

- Kéo thước: chỉ cập nhật uniform cho shader trên proxy GPU (≤ 1440px cạnh dài, dùng `GlLookProgram` hiện có). Không chạm CPU/bitmap trong lúc kéo; mục tiêu 60 fps, ≤ 8ms/frame GPU.
- Full-res chỉ render khi export hoặc khi zoom >1× (render tile vùng nhìn thấy, debounce 150ms).
- Retouch/AI mask chạy trên `Dispatchers.Default`, có spinner trên ô kết quả; hủy được.
- Thumbnail Looks render nền một lần khi mở editor.

## Không bao giờ crash (fallback)

| Lỗi | Fallback |
|---|---|
| GL context lỗi / không có ES 3 | render CPU proxy 720px qua `ColorMatrix`, ẩn Curves/Grade nâng cao, toast |
| OOM khi decode | giảm `inSampleSize` lặp tới 512px; vẫn mở được |
| RAW decode lỗi | mở JPEG nhúng, ẩn huy hiệu RAW, báo "Mở bản xem trước" |
| Model AI (mask/remove) thiếu/lỗi | ẩn chip AI, giữ Brush/Linear/Radial; Remove dùng inpaint cổ điển, 1 kết quả |
| Blur không hỗ trợ (API<31) | nền đặc alpha 0.85 |
| Export lỗi định dạng (HEIF) | rơi về JPEG + toast |
| Lỗi bất kỳ trong op | bỏ op đó khỏi stack, giữ các op khác, log |
Mọi tính năng đều bọc `runCatching`; không có đường nào ném exception ra UI.

## Truy cập

- Mọi vùng chạm ≥ 48dp (chip, nút, chấm HSL, ô kết quả).
- `contentDescription` song ngữ theo locale; thước đọc "Phơi sáng, cộng 12"; bước lịch sử đọc tên op.
- Tương phản: chữ trên dock ≥ 4.5:1 (Glass có lớp gradient tối 55% dưới chữ; Origin nền đặc). Màu nhấn chỉ dùng cho trạng thái, luôn kèm hình (chấm, viền, gạch).
- Tôn trọng "Remove animations": tắt chuyển động panel, thay bằng crossfade 1ms.
- So sánh có nút riêng (không chỉ nhấn giữ) cho người dùng không làm được cử chỉ.

## Tiêu chí nghiệm thu

- [ ] Hai skin đổi được trong Cài đặt, áp cho cả camera và editor, không khởi động lại.
- [ ] Đủ 8 danh mục; vuốt panel đổi công cụ; nút So sánh và nhấn giữ đều hoạt động.
- [ ] Kéo thước 60 fps trên thiết bị đích (gauguin) với ảnh 50MP (đo bằng `FrameMetrics`, ≤ 5% frame trễ).
- [ ] Chạm đúp thước đặt lại 0 và ghi lịch sử; Undo/Redo/History nhất quán.
- [ ] Remove cho 2–4 kết quả + thanh chia trước/sau; chọn kết quả ghi lịch sử.
- [ ] Export: JPEG/HEIF/PNG/DNG, chọn cỡ, xóa metadata mặc định bật, giữ ảnh gốc.
- [ ] Ngang và tablet đúng bố cục cột.
- [ ] TalkBack đi hết các màn hình; không vùng chạm < 48dp.
- [ ] Mọi fallback ở bảng trên kiểm thử bằng cách tiêm lỗi; không force-close.
- [ ] Chuỗi UI có EN + VI, dấu tiếng Việt hiển thị đúng.

## Câu hỏi còn mở

- Số kết quả Remove (2 hay 4) phụ thuộc thời gian chạy model trên thiết bị — cần đo.
- Reshape có hiện trong danh sách (ẩn sau cài đặt) hay bỏ hẳn khỏi UI mặc định?
