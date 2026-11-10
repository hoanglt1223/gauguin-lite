# Leica port: bản iQOO Neo 11 và iQOO 13 (SM8750, HTP V79)

Ngày: 2026-11-10. Chỉ build và kiểm tra tĩnh, chưa thử trên máy.

## Kết quả

| File | SHA-256 (16 ký tự đầu) |
|---|---|
| `miui-ports/leica/out/leica-iqooneo11-en.apk` (copy: `camera-ports-los24/release-assets/`) | `553C761C14FA92C9` |
| `miui-ports/leica/out/leica-iqoo13-en.apk` (copy: `camera-ports-los24/release-assets/`) | build cùng script |

- Script: `build-leica-gauguin.ps1 -Target gauguin|iqooneo11|iqoo13` (mặc định `gauguin`). Bản iQOO không cho dùng `-Slim`.
- File mới: `scripts/iqoo_patch.py`, `scripts/iqooneo11-profile.json`, `scripts/iqoo13-profile.json`. `patch_port.py` nhận thêm tham số file profile.
- Commit `fe63102` trong `camera-ports-los24` (chưa push). README: mục "iQOO Neo 11 and iQOO 13".
- Bản gauguin build lại: smali `classes24` giống hệt bản cũ. Dex khác byte nhưng nội dung smali không đổi, nên hành vi gauguin giữ nguyên.

## HTP V79: kết luận (chung cho cả hai máy, cùng SM8750)

Trong APK có **ba bộ runner style**:

| Chuỗi | Java dùng | Runtime | Stub | Skel / context | Chạy HTP trên V79? |
|---|---|---|---|---|---|
| `libstyletrans_runner` → `libmialgo_styletrans` → `libQnnHtp` | `leicaapp.LegendaryPostProcessor` (màn Leica chính) | QNN **2.33.104** | `libQnnHtpV81Stub.so` (V81 thật) | `leica-v4/dsp` V81 skel, context arch **0x51 (V81)** | Không |
| `libd12letrans_runner` → **stock** `libmialgo_styletrans` (2.33.104) + preload `libd12HtpV81Stub` (2.33.0) | `model120` / `donor120` (M9, M9+, M10R, M3) | trộn hai phiên bản | V79 | `donor120/leica-v4` V79 | Gần như chắc không (stub và backend lệch phiên bản) |
| `libzxyletrans_runner` → `libzxalgo_styletrans` → `libzxnHtp` / `libzxnSystem` | `lmoments` (Leica Moments) | QNN **2.33.0** | `libzxnHtpV81Stub.so`: thực chất là **V79** (đường build `V79_WeakLinkage`, SONAME `libQnnHtpV79Stub.so`) | `lm_leica-v4/dsp/libQnnHtpV79Skel.so` (ELF Hexagon e_flags 0x79, 2.33.0), context **0x4F (V79)** | **Có, đủ bộ** |

Bằng chứng:
- `.minn` là QNN context XOR 0x64. Bộ `leica-v4` và `lm_leica-v4` chỉ khác **5 byte**. Đó là trường arch: 0x51 (81) so với 0x4F (79). Người port đã sửa tay arch từ 79 lên 81. Cả hai bộ đều được build bằng QNN `2.33.0.250327`.
- `libQnnHtpV81Skel.so` trong `lm_leica-v4/dsp` và `donor120/leica-v4/dsp` trùng hash với V79Skel (e_flags 0x79). Chỉ `leica-v4/dsp` có V81 skel thật.
- Backend QNN tự nhận diện SoC qua `/sys/devices/soc0/soc_id` rồi `dlopen("libQnnHtpV79Stub.so")`. Runner nạp trước stub có SONAME đó nên lệnh dlopen này trúng.
- Java chỉ chặn SoC không phải Qualcomm (`Build.SOC_MANUFACTURER`); vivo là QTI nên qua được.

Bản iQOO đã sửa như sau:
1. `iqoo_patch.py`: runner của `leicaapp` và `model120` chuyển sang `/libzxyletrans_runner.so`. Đây là cùng nguồn `styletrans_runner.c`, cùng argv và format log.
2. `assets/leica-v4/styletrans_{low,high,colorfix}.minn` thay bằng bản V79 từ `lm_leica-v4`, thêm `assets/leica-v4/dsp/libQnnHtpV79Skel.so` (2.33.0). `ModelAssetCheck` so hash với asset mới nên tự sửa file cũ.
3. **Không cần QNN SDK, nên không thêm `-QnnSdkDir`.** Lý do: bộ V79 2.33.0 đã có sẵn trong APK. Nếu thêm stub/skel V79 bản 2.33.104 từ SDK thì sẽ trùng tên `libQnnHtpV79Skel.so` với bộ 2.33.0 trong cùng thư mục `dsp`. SDK QNN là tài sản độc quyền của Qualcomm, phải đăng nhập mới tải được, và bản 2.33.104 không thấy phát hành công khai.
4. legend85 experiment chỉ chạy V81 (`m9-v81.minn`, stub/skel V81, chữ "V85 → V81"). Vẫn ẩn như bản gauguin.
5. Nếu HTP vẫn hỏng: runner là process con, exit khác 0 thì app đi tiếp chuỗi fallback CPU runner → Distill → ORT → LUT, không crash app. Đây là luồng đã chạy trên gauguin.

Còn lại, chưa sửa: `libperson_runner.so` (tách người trong `LeicaQuality`) dùng bộ 2.33.104 V81, nên trên V79 sẽ lỗi rồi đi nhánh fallback của nó.

## Chắc chắn / có khả năng / cần thử

- **Chắc chắn (tĩnh):** `apksigner verify` OK (v3). `zipalign -c -P 16 4` OK. `aapt2 dump badging` OK (package `com.kobbin.leica.wmrebuild`, min 29, target 36, arm64-v8a). JSON profile parse được: Neo 11 có 1 entry với V2520A; iQOO 13 có `vivo/iqoo13` với các stop [0, 1, 2.0]. Smali assemble được và dex chứa runner mới. Có bản dịch tiếng Anh, film LUT, fix lens-switch / Styles / tone picker / thông báo, tắt telemetry.
- **Có khả năng:** profile được tự chọn (`Build.MODEL` = V2520A / V2408A / I2401). Style M9 / M3 / Moments chạy trên HTP.
- **Chưa biết:** HAL camera của vivo có cho app bên thứ ba mở camera ultrawide/tele qua id vật lý hay không. Focal length cũng chưa rõ (ghi `runtime_metadata_required`).

## Profile

- **iQOO Neo 11:** code V2520A (chỉ bán ở Trung Quốc; không tìm được code global hay India). Camera chính 50MP 1/1.56" f/1.88 OIS, ultrawide 8MP f/2.2 119°. Nguồn: [xameras](https://cloud.xameras.com/mobile/vivo/iqoo-neo11-china/specifications), [DeviceAtlas V2520A](https://deviceatlas.com/device-data/devices/iqoo/v2520a/90228082), [91mobiles](https://www.91mobiles.com/iqoo-neo-11-price-in-india?ty=specs).
- **iQOO 13:** V2408A / V2408 (Trung Quốc, OriginOS), I2401 (global/India, Funtouch OS). Camera chính 50MP, ultrawide 50MP, tele 2x 50MP. Các nguồn ghi focal tele lệch nhau (50 mm và 70 mm) nên để đọc từ metadata. Schema không có kiểu crop từ tele, nên **không có chip 4x/5x**; zoom số vẫn dùng được. Nguồn: [iqoo.com param](https://www.iqoo.com/sa/en/products/param/iqoo-13), [GSMArena](https://www.gsmarena.com/vivo_iqoo_13-13462.php), [true-tech I2401](https://true-tech.net/iqoo-13-imei-database-spotted/), [PhoneArena](https://www.phonearena.com/phones/compare/vivo-iQOO-13,Xiaomi-15-Ultra/phones/12461,12617).

## Cài trên OriginOS / Funtouch (Android 15/16)

1. Gỡ mọi bản Leica port khác trước (cùng package, khác chữ ký). APK nặng khoảng 554 MB; cài bằng `adb install` hoặc trình quản lý file.
2. Bật cho phép cài từ nguồn không xác định với app dùng để cài. OriginOS có thể yêu cầu đăng nhập vivo account hoặc tắt "Security check"/"Bảo vệ cài đặt". Tắt quét virus khi cài nếu bị chặn.
3. Cấp quyền Camera, Micro, Vị trí (watermark), Ảnh/Video (`READ_MEDIA_IMAGES`), Thông báo (Android 13+, cần cho thông báo render nền).
4. Pin: Cài đặt → Pin → Quản lý tiêu thụ nền → app → "Cho phép chạy nền cao"/"Không giới hạn". Bật tự khởi chạy (Auto-start). Khóa app trong Recents. Nếu không làm, iManager/OriginOS có thể kill foreground service render M9 và ảnh sẽ chỉ giữ bản gốc.
5. Android 16: cần cho phép foreground service loại camera/dataSync. Lần đầu mở app sẽ chép khoảng 100 MB model vào `files/`, nên chờ xong rồi mới chụp.

## Checklist thử trên máy (giống nhau cho Neo 11 và iQOO 13)

Ghi log: `adb logcat -c; adb logcat -v time > leica.log`, rồi:

1. Mở app: profile tự chọn là iQOO Neo 11 / iQOO 13. Chip zoom: Neo 11 có 0.6 / 1; iQOO 13 có 0.6 / 1 / 2. Thử chụp ở từng chip.
2. Chụp M9 ở màn Leica chính. Trong log tìm:
   - `Styletrans init=0` và `Styletrans run=0 rotation=… lux=… cct=…` từ runner → **HTP chạy được**.
   - `QnnDsp` + `Successfully connected to the skel` / `First connection to QNN stub established` → DSP OK.
   - `Failed to load skel`, `Skel lib id mismatch`, `Stub lib id mismatch`, `Unsupported SoC`, `Styletrans load …: …`, `Styletrans init=<khác 0>` → HTP lỗi.
   - `M9CpuFallback` với `exit=`, `M9OrtFallback`, `cpu chain failed`, `APK native Leica runner unavailable` → đang chạy fallback CPU/ORT.
   - `LeicaModelCompat` `Repaired model asset=` lần đầu là bình thường.
3. Đo thời gian: HTP thường dưới 1–2 s mỗi ảnh; CPU/ORT mất vài chục giây. Ghi lại tag `processed=… bytes=…` để có số liệu.
4. Chụp M9+, M10R, M3 và Leica Moments: cùng kiểm tra như bước 2.
5. Kiểm tra `adb shell cat /sys/devices/soc0/soc_id` (8 Elite dự kiến là 618) và `getprop ro.soc.manufacturer` (QTI).
6. Thử film LUT style, tone picker kéo tới "Perfect M9", lens switch ngay sau khi chụp, thoát ra rồi mở lại để xem mục Styles, thông báo render tự tắt sau 4 s.
7. Khóa màn hình ngay sau khi chụp M9: ảnh đã render vẫn phải được lưu (kiểm tra mức hạn chế pin).
8. Nếu crash: `adb logcat -b crash`, cùng `files/.../last_run.txt`.

## Câu hỏi mở

- Chưa có code model global cho Neo 11. Nếu có, thêm vào `iqooneo11-profile.json`.
- Cần dùng thật để xác nhận runner `zx` nhận đúng thư mục model `leica-v4` / `donor120` (argv giống nhau, nhưng chưa chạy thử).
