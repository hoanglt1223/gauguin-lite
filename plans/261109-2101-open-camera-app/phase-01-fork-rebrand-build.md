# Phase 1: Fork, đổi tên, build Gradle + Soong, CI

## Bối cảnh

Aperture (nhánh `lineage-24.0`): Kotlin, CameraX (`camera-core`, `camera-camera2`, `camera-lifecycle`, `camera-video`, `camera-view`, `camera-viewfinder-core`, `camera-extensions`), Media3, Coil, ZXing. `minSdk 26`, `targetSdk 36`, `compileSdk 36`, namespace `org.lineageos.aperture` (`app/build.gradle.kts`). `app/Android.bp` được sinh bằng plugin `lineageos.generatebp`; `androidx.camera` và `androidx.media3` do LineageOS tự cung cấp trong `prebuilts`. Giấy phép theo REUSE: `LICENSES/Apache-2.0.txt`, `BSD-3-Clause.txt`, `CC-PDDC.txt`. Đã có: Photo/Video/QR mode, lens selector, timer, grid, leveler, flash, HDR video (`VideoDynamicRange`), stabilization, noise reduction/edge/hot pixel mode, CameraX Extensions (`ext/ExtensionsManager.kt`), Google Lens, secure camera, RRO overlay (`rro_overlays/ApertureFrameworksBaseOverlay`), `lens_launcher`.

## Yêu cầu

- Fork thành repo mới, giữ lịch sử git và ghi công tác giả LineageOS (NOTICE).
- Đổi package/namespace sang `org.aperio.camera`, tên app, icon mới tự vẽ; giữ `applicationIdSuffix ".dev"`.
- Tách module: `:app`, `:profiles`, `:capture`, `:pipeline` (có CMake/NDK), `:ml`, `:vendor-bridge` (module rỗng ở phase này).
- Hai flavor: `foss` (mặc định) và `qnn` (rỗng, dành cho phase 5).
- Build Soong: giữ `generatebp`, sinh `Android.bp` cho từng module; module native dùng `cc_library_shared` + `jni_libs`.
- CI GitHub Actions: build, unit test, lint, `reuse lint`, kiểm tra `Android.bp` khớp với Gradle (chạy lại generatebp và `git diff --exit-code`).

## File / module

- `settings.gradle.kts`, `app/build.gradle.kts`, `gradle/libs.versions.toml`
- Module mới: `profiles/`, `capture/`, `pipeline/`, `ml/`, `vendor-bridge/` (mỗi module có `build.gradle.kts` + `Android.bp` sinh tự động)
- `.github/workflows/build.yml`, `REUSE.toml`, `NOTICE`, `README.md`, `CONTRIBUTING.md` (quy tắc nguồn gốc code/asset)
- `.github/pull_request_template.md` (checkbox "không dùng mã/asset từ app độc quyền")

## Các bước

1. Fork, thêm remote `upstream`, tạo nhánh `main` từ `lineage-24.0`.
2. Đổi namespace/applicationId bằng refactor package; cập nhật `AndroidManifest.xml`, shortcut, RRO overlay, `lens_launcher`.
3. Tạo module trống và chuyển code theo ranh giới hiện có: `repositories/CameraRepository.kt` → `:capture`; `models/*` dùng chung để lại `:app` cho tới khi cần tách.
4. Bật NDK + CMake trong `:pipeline` với một hàm JNI thử (`nativeVersion()`).
5. Viết `CONTRIBUTING.md` mục nguồn gốc: được đọc code dịch ngược để lấy logic nhưng phải tự viết lại, không dán nguyên văn code, không đưa model/LUT/asset độc quyền vào repo, ghi nguồn tham khảo trong PR.
6. CI và REUSE.
7. Dựng trong cây LineageOS 24 của gauguin: thêm vào `packages/apps/Aperio`, `PRODUCT_PACKAGES += Aperio`, `overrides: ["Aperture"]`.

## Kiểm chứng

- `./gradlew assembleFossDebug test lint` xanh; APK cài song song với Aperture gốc.
- Trên gauguin: chụp ảnh, quay video, quét QR như Aperture gốc.
- `m Aperio` thành công; flash bản ROM có Aperio thay Aperture, mở được từ phím camera và màn hình khóa (secure camera).

## Rủi ro

- Merge upstream khó hơn sau khi tách module. Giảm thiểu: tách tối thiểu, ghi lại bảng map file cũ → mới trong `docs/upstream-sync.md`.
- `generatebp` có thể không hỗ trợ module NDK. Giảm thiểu: `Android.bp` tay cho `:pipeline`, kiểm tra bằng CI.

## Rollback

Repo mới, không ảnh hưởng Aperture trong ROM; bỏ `PRODUCT_PACKAGES` là quay lại.
