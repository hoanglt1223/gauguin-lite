# Leica port: repo công khai riêng `hoanglt1223/leica-port`

Ngày 2026-11-12.

## Kết quả

- Repo: https://github.com/hoanglt1223/leica-port (public), commit đầu trên `main`, tác giả `Thanh Hoang` (email giống `D:\Projects\open-camera`). Thư mục local: `D:\Projects\leica-port`.
- Nội dung: `README.md` (tiếng Anh + mục tiếng Việt ngắn, disclaimer, cài đặt, ma trận hỗ trợ, cách xin thêm máy, lỗi đã biết, sửa thông báo/telemetry, build từ nguồn), `device-profiles.md` (261 máy có sẵn trong app, sinh từ bảng profile đã dịch), `LICENSE` (MIT, chỉ cho script), `.gitignore`, `scripts/` (patch, dịch, rebuild, 3 file profile, `translations-en.json`, `arsc-translations-en.json`, `java/`, `film-sample.jpg` không EXIF).
- Không đưa lên: `keys/`, `AuthorNotice.java` (chứa khóa của app), `DecompileByName.java`, `jadx-*`, `extract`, `rea-out`, `strings/`, `work/`, `tools/bin`, APK gốc. Quét file staged (IP, email, password/token/key, PIN, tên Wi-Fi,/AI): 0 kết quả.
- Release `v1.0.0`: 4 APK tải từ `camera-ports-los24` v0.1.0 + `SHA256SUMS`.
- `camera-ports-los24`: commit `c62bf79` thêm link sang repo mới trong `README.md` và `README.vi.md`, đã push.
- gh: switch sang `hoanglt1223` trước khi tạo/push, switch lại `thanhhoangnguyenb13` sau cùng.

## Kiểm tra APK (aapt2 + apksigner)

Cả 4: `com.kobbin.leica.wmrebuild` 8.0.0 (680020067), minSdk 29, target 36, arm64-v8a, chữ ký hợp lệ, cert SHA-256 `b08fa019…7f9b`.

| File | SHA-256 | Ghi chú |
|---|---|---|
| `leica-gauguin-en-slim.apk` | `8834f5ed…0b43` | Trùng bản đã test (báo cáo 261109-2218). 11 entry film, 0 file dsp |
| `leica-gauguin-en.apk` | `15e368a4…a0a7` | **Bản cũ** (build đầu, 532 MB): chỉ 3 entry `model120-intro` = chưa có film LUT và các fix sau. README và release notes ghi rõ |
| `leica-iqoo13-en.apk` | `9cfdfe40…be78` | 11 film, 8 dsp |
| `leica-iqooneo11-en.apk` | `553c761c…69ec` | Trùng báo cáo 261110 |

## Ma trận hỗ trợ

| Mức | Máy | Bằng chứng |
|---|---|---|
| Đã thử | Mi 10T Lite / Redmi Note 9 Pro 5G / Mi 10i (gauguin, SM7225), LineageOS 24, bản slim | Báo cáo 261109-1514, -2101, -2218: chụp 1x/0.6x/2x, Pro tay, M9/M9+/M10-R, film, editor, watermark, đổi ống kính 15/15, 0 byte mạng |
| Đã build, chưa thử | iQOO 13 (V2408A/V2408/I2401), iQOO Neo 11 (V2520A) | Chỉ kiểm tĩnh (261110: "chưa thử trên máy"). Không tìm thấy ghi chú nào về test Leica trên hai máy này |
| Có profile trong app, chưa thử | 261 máy: OPPO 94, vivo 88, Redmi 47, Xiaomi 32 | Profile của người port từ thông số hãng (ngày 2026-10-20). Không có máy nào trong số này được dự án thử |
| Không rõ | Còn lại | App có thể chỉ mở camera chính hoặc không chạy |

Ghi chú: mỗi bản chứa 261 profile gốc + profile của máy đích. MediaTek/Exynos chỉ chạy đường CPU/ORT/LUT.

## Status

Status: DONE_WITH_CONCERNS
Summary: Repo `hoanglt1223/leica-port` đã public kèm README, script, bản dịch, danh sách profile và release v1.0.0 (4 APK + SHA256SUMS); camera-ports-los24 đã có link.
Concerns: `leica-gauguin-en.apk` trong release cũ là bản build đầu, thiếu các fix; nên build lại bản full từ script hiện tại (`out/leica-gauguin-en.apk` local mới hơn, 550 MB, chưa test) rồi thay asset. iQOO 13 / Neo 11 vẫn chưa test trên máy thật.
