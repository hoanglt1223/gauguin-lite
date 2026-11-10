# Phase 9: Phân phối: F-Droid, ROM qua Soong, bản dịch

## Bối cảnh

F-Droid yêu cầu mã nguồn mở hoàn toàn, build từ nguồn, không blob độc quyền, không thư viện tracking; khuyến khích reproducible build. ROM (LineageOS và fork) tích hợp qua `Android.bp` + `PRODUCT_PACKAGES`, có thể `overrides` Aperture. Bản gauguin hiện là LineageOS 24 Lite trong repo này.

## Yêu cầu

- F-Droid: flavor `foss`, metadata Fastlane (`fastlane/metadata/android/<locale>/`), ảnh màn hình, changelog; reproducible build (cố định JDK, NDK, Halide AOT output, `SOURCE_DATE_EPOCH`); gửi merge request vào `fdroiddata`.
- GitHub Releases: APK ký bằng khóa dự án, kèm SHA-256; model tải tùy chọn nằm ở release riêng.
- Flavor `qnn` (nếu người dùng đồng ý, câu hỏi mở 2): phát hành riêng, ghi rõ chứa thành phần độc quyền.
- ROM: `Android.bp` sinh từ Gradle được CI kiểm; tài liệu thêm vào device tree (`PRODUCT_PACKAGES += Aperio`, quyền `privapp-permissions` nếu cần, `overrides: ["Aperture"]`); thêm vào ROM gauguin trong repo này.
- Bản dịch: Weblate/Crowdin (Weblate có gói miễn phí cho dự án mở), tiếng Anh và tiếng Việt trước.
- Quy trình release: semver, `CHANGELOG.md`, nhánh `release/x.y`.
- Kênh hỗ trợ: issue template cho bug (đính kèm profile export + log), cho profile.

## File / module

- `fastlane/`, `.github/workflows/release.yml`, `docs/rom-integration.md`
- Repo này: device makefile của gauguin (`PRODUCT_PACKAGES`), chỉ khi làm bước ROM

## Các bước

1. Fastlane metadata + reproducible build kiểm bằng `apksigcopier`/so hash hai lần build.
2. Release 0.1 trên GitHub, gửi F-Droid.
3. Tích hợp ROM gauguin, ghi `docs/rom-integration.md`.
4. Weblate.

## Kiểm chứng

- Hai lần build sạch cho cùng hash APK chưa ký.
- `fdroid build` cục bộ chạy được; scanner F-Droid không báo blob.
- ROM gauguin khởi động, Aperio là app camera mặc định, secure camera chạy từ màn hình khóa.

## Rủi ro

- Halide/NDK làm build không reproducible → commit output AOT có hash, CI so.
- F-Droid duyệt chậm → GitHub Releases + kho F-Droid riêng (repo tự host) trong lúc chờ.

## Rollback

Rút bản khỏi kho riêng; ROM quay lại Aperture bằng cách bỏ `PRODUCT_PACKAGES`.
