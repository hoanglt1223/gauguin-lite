---
title: Open Camera — hệ thống skin giao diện camera
status: draft
created: 2026-11-11
depends_on: plans/261109-2101-open-camera-app/plan.md
---

# Open Camera: hệ thống skin giao diện

## Kết quả mong muốn

Giao diện máy ảnh không còn trông như AOSP. Có 4 skin gốc, tự thiết kế (lấy cảm hứng từ cách bố trí, không chép tài sản): **Glass**, **Origin**, **One**, **Classic**. Người dùng đổi skin trong Settings mà không phải khởi động lại, preview giữ nguyên fps, và nếu skin lỗi thì app tự lùi về skin mặc định thay vì crash.

**Đề xuất mặc định: Origin.** Skin này hợp nhất với hai máy test (iQOO Neo 11 và gauguin), cho thấy rõ nhất là app "không phải AOSP" nhờ pill gradient và chuyển động lò xo. Nó cũng không phụ thuộc blur: nền là mảng đặc, nên chạy đều trên Adreno 619 mà không cần đường lùi riêng. Glass đẹp nhất nhưng sống nhờ blur thời gian thực, vốn tốn nhất trên máy yếu, nên để làm tùy chọn.

Không làm trong kế hoạch này: đổi pipeline chụp, thêm chế độ mới, icon pack động, hay cho người dùng tự chỉnh màu.

## Mockup

`mockups/index.html` dùng để chuyển qua lại giữa 4 skin, mỗi skin có file riêng (`glass.html`, `origin.html`, `one.html`, `classic.html`). Cấu trúc và tương tác dùng chung nằm ở `mockups/assets/base.css` và `mockups/assets/camera-mock.js`; mỗi skin chỉ ghi đè token và một ít CSS. Đây cũng chính là mô hình đề xuất cho app. Mockup không cần mạng (không tải font hay ảnh ngoài), mở thẳng file là xem được.

Mockup thể hiện được: màn hình chụp ảnh, carousel chế độ (vuốt/nhấn) kèm sheet **More**, Pro với 5 dial (ISO/S/EV/WB/MF), dải Looks, sheet Settings, xoay ngang (nút *Landscape*), trạng thái quay video (nút *Video recording state*), thumbnail nảy sau khi chụp và màn review. Có animation cho đổi chế độ, nhấn shutter, vòng zoom (nhấn giữ chip zoom). Khung máy 1080×2400 vẽ ở tỉ lệ 1/3.

## Tóm tắt khảo sát (2025–2026)

| Mẫu | iOS 26 Camera | OriginOS 6 (vivo/iQOO) | One UI 8 | HyperOS 3 (dòng Ultra) | Pixel Camera |
|---|---|---|---|---|---|
| Carousel chế độ | Chữ thường, vuốt trên preview; iOS 26 rút gọn còn Photo/Video, vuốt để lộ thêm chế độ | Pill có nền làm nổi chế độ đang chọn, "More" ở cuối | Text, "More" ở cuối, sắp xếp được | Chữ hoa, có "More"; Pro được nâng lên ngang hàng | Tab Photo/Video tách khỏi chế độ phụ |
| Shutter | Vòng trắng mỏng, lõi co lại khi bấm; video có lõi đỏ → vuông | Vòng dày, có màu nhấn | Trắng đặc, lớn | Vòng mảnh, phong cách máy ảnh cơ | Có icon trong shutter cho từng chế độ |
| Zoom | Chip ống kính → nhấn giữ mở vòng quay số | Chip + thanh trượt cong | Chip + thanh zoom ngang | Chip tiêu cự (mm) + vòng quay số | Chip + thanh trượt |
| Thanh trên | Nhóm trong capsule kính (Liquid Glass) | Icon rời, có nút mở rộng | Icon rời → bảng quick settings | Icon tối giản, chữ hoa | Ít icon, settings dạng sheet |
| Pro | Không có Pro gốc | Hàng thông số + thước kẻ trượt | Thanh trượt dạng thẻ | Dial phim có vạch mảnh, màu đỏ nhấn | Thanh trượt trong sheet |
| Filter | Photographic Styles có pad 2D | Dải tròn | Dải thẻ | Dải phim/"Looks" | Ít filter |
| Cử chỉ | Vuốt đổi chế độ, giữ shutter để quay (QuickTake) | Vuốt, giữ để chụp liên tiếp | Kéo shutter để chụp liên tiếp, kéo nút nổi | Vuốt, chạm để lấy nét/đo sáng, kéo để chỉnh EV | Vuốt, chụm, chạm đúp để đổi camera |
| Xoay ngang | Bố cục giữ nguyên, glyph xoay tại chỗ | Như iOS | Như iOS | Như iOS | Như iOS |
| Haptic | Tick nhẹ cho mỗi nấc zoom/dial | Rung mạnh rõ ràng | Vừa phải | Tick kiểu vạch dial | Nhẹ |

Kết luận áp dụng: (1) cả 5 app đều giữ bố cục dọc khi xoay ngang và chỉ xoay glyph tại chỗ, nên ta làm y như vậy, không inflate lại layout. (2) Các điều khiển chính phải nằm ở 40% dưới màn hình để dùng được một tay. (3) Pro dùng dial ngang có vạch, kèm haptic tick ở mỗi nấc. (4) Đóng gói skin = token + một ít khác biệt hình dạng, bố cục lõi vẫn chung.

## Token thiết kế

| Token | Glass | Origin | One | Classic |
|---|---|---|---|---|
| accent | #FFD60A | gradient #FF7A45→#FFB547 | #4C8DFF | #E0322B |
| surface | trắng 10% + blur 24dp | #15151A đặc 80% | #1F2126 đặc | #0B0B0B đặc |
| fg / muted | #FFF / 62% | #FFF / 62% | #FFF / 62% | #F2EFE9 / 55% |
| radius S/M/L | 10/16/28dp | 12/20/28dp | 12/20/32dp | 2/4/6dp |
| mode label | 14sp, chữ thường, 600 | 15sp, 700, pill gradient | 14sp, pill xám | 12sp, CHỮ HOA, tracking .14em, chấm đỏ |
| shutter | 78dp, vòng 3dp | 76dp, vòng gradient | 80dp, vòng 5dp | 74dp, vòng 2dp, lõi đỏ khi ở Pro |
| preview | tràn viền | bo 20dp, lề 8dp | khung giữa thanh trên/dưới dạng thẻ | khung đen, góc vuông |
| font | system (Roboto) | system | Inter (OFL 1.1) | Manrope (OFL 1.1) |
| motion med / easing | 280ms, (.25,.9,.3,1.05) | 260ms, (.22,1,.36,1) + spring | 240ms, standard | 200ms, (.4,0,.2,1) |

Inter và Manrope đều theo SIL OFL 1.1, có hỗ trợ tiếng Việt; nhúng file TTF vào `res/font/` và ghi giấy phép vào `NOTICE`. Nếu muốn APK nhỏ hơn thì dùng downloadable fonts của Play Services, nhưng ROM gauguin có thể không có GMS, nên chọn nhúng.

**Motion chung:** fast 120ms (nhấn), med 240ms (đổi chế độ, mở dải), slow 380ms (sheet, review). Khi bật *Remove animations* (`Settings.Global.ANIMATOR_DURATION_SCALE == 0`) thì dùng 0ms.

**Haptic map** (gọi `View.performHapticFeedback`, không cần quyền VIBRATE):

| Sự kiện | Hằng số |
|---|---|
| Nấc dial Pro, nấc vòng zoom | `CLOCK_TICK` (API 31+: `SEGMENT_FREQUENT_TICK`) |
| Đổi chế độ, đổi chip ống kính | `SEGMENT_TICK` / fallback `KEYBOARD_TAP` |
| Shutter chụp ảnh | `CONFIRM` (API 30+) / fallback `VIRTUAL_KEY` |
| Bắt đầu / dừng quay | `LONG_PRESS` / `CONFIRM` |
| Khóa AE/AF (nhấn giữ) | `LONG_PRESS` |
| Lỗi (tính năng bị tắt) | `REJECT` (API 30+) |

## Kiến trúc

### Quyết định: chuyển phần overlay sang Jetpack Compose, giữ `PreviewView`

Hai hướng đã cân nhắc:

1. **View + theme attribute + layout variant cho từng skin.** Cách này ít thay đổi nhất, nhưng 4 skin × (dọc + các trạng thái) sẽ thành nhiều file layout trùng lặp. Mỗi biến thể layout phải giữ đủ ~45 id đang có trong `activity_camera.xml`, và chỉ cần thiếu một id là crash lúc `findViewById`. Hiệu ứng như pill trượt, dial hay vòng zoom phải viết bằng custom View và Animator, khó dùng chung.
2. **Compose overlay.** `PreviewView` (CameraX) vẫn là View, đặt dưới cùng; phía trên là một `ComposeView` duy nhất vẽ toàn bộ điều khiển. Skin chỉ là một `data class CameraSkin` (token) cùng vài slot composable (`Shutter`, `ModeIndicator`, `TopBar`). Đổi skin bằng cách đổi state, không inflate lại, và không có id nào có thể thiếu.

**Chọn hướng 2.** Lý do: một nguồn bố cục duy nhất; đổi skin lúc chạy ngay lập tức; animation dạng spring/`animate*AsState` có sẵn; xoay glyph bằng `Modifier.rotate(animated)` mà không recreate Activity; kiểm thử bằng Compose UI test và screenshot test. Chi phí: APK lớn thêm khoảng 2–3 MB (BOM Compose), cần chuyển dần. Phải đo cold start trên gauguin; ngưỡng ở phần ngân sách bên dưới.

Lối thoát nếu Compose không đạt ngân sách hiệu năng trên gauguin: dừng ở phase 2 và áp token qua theme attribute cho View hiện có (hướng 1 rút gọn, chỉ đổi màu/hình dạng, không đổi bố cục).

### Thành phần

```
ui/skin/
  CameraSkin.kt        data class token: colors, shapes, typography, motion, haptics, blurPolicy
  Skins.kt             Glass, Origin, One, Classic (Origin = DEFAULT)
  SkinRepository.kt    đọc/ghi pref "ui_skin", trả Flow<CameraSkin>, id lạ → DEFAULT
  LocalCameraSkin      CompositionLocal
ui/overlay/
  CameraOverlay.kt     gốc của ComposeView; nhận CameraUiState + callback
  TopBar.kt, ModeCarousel.kt, MoreSheet.kt, LensChips.kt, ZoomRing.kt,
  ShutterButton.kt, ProDials.kt, LooksStrip.kt, SettingsSheet.kt, RecordingPill.kt, ReviewThumb.kt
  SkinSlots.kt         interface để skin thay hình dạng shutter / mode indicator
```

`CameraActivity` giữ vai trò điều phối: CameraX, `FeatureGuard`, chuỗi bind fallback không đổi. Các listener View hiện có trở thành callback của `CameraOverlay` (`onShutter`, `onModeSelected`, `onZoom`, `onProValue`, ...). Trạng thái UI gom vào một `CameraUiState` (StateFlow) trong `CameraViewModel`.

### Blur và độ trong suốt

- Không bao giờ blur luồng preview theo thời gian thực. Nền "kính" chỉ là lớp màu bán trong suốt; trên preview thì dùng scrim gradient tĩnh.
- Blur thật chỉ dùng cho sheet (More/Settings) và chỉ khi sheet đang mở: chụp một frame bằng `PreviewView.bitmap` (đã giảm còn 1/4) rồi áp `RenderEffect.createBlurEffect` (API 31+) lên ảnh tĩnh đó. Chi phí một lần, không theo từng frame. View `previewBlurView` hiện có đã dùng cách này cho chuyển camera, nên tái sử dụng.
- `blurPolicy` = `Full | StaticOnly | None`. Chọn tự động: API < 31, `ActivityManager.isLowRamDevice`, hoặc lần mở sheet trước tốn hơn 8 ms thì hạ một bậc. `None` dùng surface đặc 92% opacity. Trên gauguin (Adreno 619), mặc định là `StaticOnly`.

### Đổi skin lúc chạy

Settings → *Appearance → Skin* (danh sách có ảnh xem trước). Sheet Settings trong camera cũng có dòng *Skin*. Ghi pref `ui_skin` → `SkinRepository` phát skin mới → overlay recompose và crossfade 240ms. Không recreate Activity, không rebind CameraX.

### Không bao giờ crash

- `CameraOverlay` bọc phần nội dung của skin. Compose không có try/catch trong composition, nên cần bảo vệ ở các mức sau: (a) xác thực token khi tạo skin (`CameraSkin.validate()`: màu không trong suốt hoàn toàn, kích thước ≥ 48dp, nếu sai thì về DEFAULT); (b) `SkinRepository` bắt lỗi parse; (c) `ComposeView` được tạo trong `runCatching`, lỗi thì báo `FeatureGuard` và quay về layout View cũ `activity_camera.xml`, layout này được giữ nguyên làm đường lùi cuối cùng đến hết phase 4.
- Ghi cờ `skin_crash_pending` trước khi set content và xóa cờ sau frame đầu tiên. Nếu lần mở sau thấy cờ vẫn còn thì ép DEFAULT và hiện toast *"Skin reset to default"*.
- Unit test cho cả ba đường lùi trên.

### Hướng xoay, RTL, một tay

- Activity khóa dọc, giữ như hiện tại. `OrientationEventListener` đưa ra góc 0/90/180/270, glyph xoay bằng animation (đường ngắn nhất, 240ms). Không xoay: carousel chế độ và dial (giống app gốc).
- RTL: carousel và dial đảo chiều theo `LayoutDirection`. Thứ tự giá trị trên dial thì giữ nguyên (thấp → cao theo hướng đọc). Icon có hướng (flip camera) dùng `autoMirrored`.
- Shutter, chip zoom, carousel và thumbnail nằm trong vùng 40% dưới màn hình. Thanh trên chỉ chứa toggle ít dùng.

### Khả năng tiếp cận

- Mọi vùng chạm ≥ 48dp (`Modifier.minimumInteractiveComponentSize`). Chữ và icon trên preview phải có scrim sao cho tương phản ≥ 4.5:1 cho chữ và 3:1 cho icon, đo trên ảnh trắng sáng nhất trong bộ test.
- TalkBack: shutter có `contentDescription` đổi theo trạng thái ("Take photo" / "Start recording" / "Stop recording"); carousel là `selectableGroup` + `Role.Tab`; dial là `progressSemantics` + `setProgress` action để vuốt lên/xuống chỉnh nấc; chip zoom là `Role.RadioButton`. Bộ đếm thời gian quay là `liveRegion = Polite`.
- Phím âm lượng vẫn chụp được; khi TalkBack bật, nhấn đúp vào preview không đổi camera.
- Tôn trọng tỉ lệ cỡ chữ của hệ thống tới 1.3×; lớn hơn thì nhãn chế độ cắt bằng dấu "…" thay vì tràn.

## Ngân sách hiệu năng

| Chỉ số | gauguin (SM7225, Adreno 619) | iQOO Neo 11 |
|---|---|---|
| fps preview khi có overlay tĩnh | không đổi so với không có overlay (±1 fps) | như vậy |
| Frame UI p95 khi đổi chế độ / mở dải | ≤ 16.6 ms | ≤ 8.3 ms |
| Recomposition khi preview chạy, overlay đứng yên | 0 lần mỗi giây | 0 |
| Cold start tới frame preview đầu | tăng ≤ 80 ms so với bản View | tăng ≤ 40 ms |
| Mở sheet có blur | ≤ 8 ms cho blur một lần, nếu vượt thì hạ `blurPolicy` | — |

Quy tắc: không đọc state đổi theo từng frame (histogram, level) trong scope recomposition lớn; level và vòng zoom vẽ bằng `drawWithCache` + đọc state trong lambda `graphicsLayer`.

## Các phase

| # | Phase | Nội dung | Phụ thuộc |
|---|---|---|---|
| 1 | Nền skin | `CameraSkin`, 4 skin, `SkinRepository`, pref, `validate()`, unit test fallback | — |
| 2 | Overlay Compose phần lõi | `ComposeView` trên `PreviewView`; shutter, carousel + More, chip zoom + vòng, thanh trên, thumbnail; nối callback; cờ crash; giữ layout View làm đường lùi | 1, sau khi agent đang sửa layout xong |
| 3 | Phần còn lại | Pro dials, Looks strip, sheet Settings, quay video, review, scene chip, khóa AE/AF | 2 |
| 4 | Hoàn thiện | Xoay glyph, RTL, haptic map, blur policy, reduce motion, TalkBack, font OFL + NOTICE | 3 |
| 5 | Đo và dọn | Đo hiệu năng trên 2 máy; nếu đạt thì xóa đường lùi View (hoặc giữ nếu muốn) | 4 |

Mỗi phase làm trong worktree `D:\Projects\open-camera-wt\ui-skins-<n>` theo `agent-brief.md`. File dùng chung bị ảnh hưởng: `CameraActivity.kt`, `activity_camera.xml` (chỉ thêm `ComposeView`), `build.gradle.kts` (Compose BOM), `NOTICE`, `res/xml/root_preferences.xml`.

## Tiêu chí nghiệm thu

1. Cả 4 skin hiển thị đúng 8 màn: chụp ảnh, carousel + More, Pro, Looks, Settings, xoay ngang, đang quay, review/thumbnail.
2. Đổi skin trong Settings có hiệu lực trong ≤ 300 ms, không rebind camera, không mất chế độ hay zoom đang chọn.
3. Skin hỏng (token sai, composable ném lỗi, pref lạ) → về Origin + toast; app không crash, vẫn preview và chụp JPEG được.
4. Đạt bảng ngân sách hiệu năng trên cả 2 máy.
5. Mọi vùng chạm ≥ 48dp; Accessibility Scanner không báo lỗi tương phản hay kích thước; dùng TalkBack chụp, đổi chế độ và chỉnh dial Pro được.
6. Xoay máy thì glyph xoay, bố cục giữ nguyên; RTL (ngôn ngữ `ar`) hiển thị đúng chiều.
7. Không có logo, font hay tài sản thương hiệu nào; font OFL có trong `NOTICE`.

## Kế hoạch test

- **Unit (JVM):** `SkinRepository` với id lạ, null, rỗng → DEFAULT; `validate()` từ chối token sai; logic cờ crash.
- **Compose UI test:** với từng skin, chạy shutter → callback, vuốt carousel đổi chế độ, nhấn giữ chip → vòng zoom, dial nhận `setProgress`, semantics TalkBack có đủ.
- **Screenshot test** (Roborazzi, Apache-2.0): 4 skin × 8 trạng thái × {dọc, glyph 90°} × {LTR, RTL}, so với ảnh mốc.
- **Trên máy:** gauguin `c28004a8` thì được thao tác đầy đủ. Đo `dumpsys gfxinfo dev.opencamera.app framestats` khi đổi chế độ 20 lần và log fps preview từ `CameraX`. iQOO Neo 11 thì chỉ cài, `am start`, chụp màn hình và đọc logcat, không dùng `input` (theo `agent-brief.md`); việc bấm tay ghi vào báo cáo để người dùng tự làm.
- **Ép lỗi:** dùng build debug có cờ `debug.opencamera.skin_fail=1` để làm skin ném lỗi khi compose, rồi xác nhận đường lùi và toast.

## Câu hỏi chưa giải quyết

1. Có chấp nhận APK lớn thêm khoảng 2–3 MB do Compose không? Nếu không thì dùng lối thoát token-qua-theme.
2. Mặc định dùng Origin cho mọi máy, hay chọn theo máy (ví dụ Classic trên gauguin vì nhẹ)?
3. Đường lùi layout View cũ có giữ vĩnh viễn không, hay xóa sau phase 5?

## Quyết định đã chốt (2026-11-11)

- Chỉ làm **2 skin: Glass (mặc định) và Origin**. Bỏ One và Classic.
- Đổi skin trong **Cài đặt → Giao diện**, đổi tức thì không mở lại camera.
- Glass dùng hiệu ứng kính mờ; trên máy yếu (đo được preview tụt fps hoặc Android < 12 không có RenderEffect) tự giảm mức mờ hoặc chuyển sang nền mờ tĩnh, vẫn giữ phong cách Glass; người dùng có thể tắt mờ trong cài đặt.
- Chấp nhận dùng Jetpack Compose cho lớp điều khiển; giữ giao diện cũ làm đường lùi khi lớp Compose lỗi.