# Hướng dẫn chung cho người làm các phase Open Camera

Áp dụng cho mọi phase từ 2026-11-11. Đọc trước khi làm.

## Môi trường

- Windows. Chỉ dùng PowerShell (Bash trong môi trường này hỏng).
- Repo app: `D:\Projects\open-camera` (nhánh `main` = bản đã gộp phase 1–4, 7). Mỗi phase làm trong worktree riêng `D:\Projects\open-camera-wt\<phase>` trên nhánh `feat/<phase>`, commit trong đó, không push (người điều phối push bằng tài khoản khác).
- Build: `.\gradlew.bat assembleDebug test lint`, sinh lại Soong bằng `.\gradlew.bat app:generateBp`. JDK/SDK và `local.properties` xem `plans/reports/open-camera-261110-1524-phase1.md`; chép `sdk.dir` và `openCamera.profiles.dir=../../open-camera-profiles` từ worktree khác nếu thiếu.
- Báo cáo merge của bản gộp: `plans/reports/open-camera-261111-0803-merge.md` (điểm tích hợp, `FeatureGuard`, chuỗi fallback khi bind).

## Nguyên tắc bắt buộc

1. **Không bao giờ crash.** Mọi tính năng tùy chọn phải có đường lùi về preview + chụp JPEG. Dùng `FeatureGuard` và chuỗi bind fallback có sẵn; bọc CameraX, Camera2 interop, JNI, MediaStore, tải model trong xử lý lỗi; báo người dùng bằng toast khi tắt tính năng. Native trả mã lỗi, không abort. Có unit test cho đường lùi của tính năng mới.
2. **Giấy phép.** App là Apache-2.0. Ngoại lệ đã được người dùng duyệt: LibRaw (LGPL-2.1) cho RAW gốc máy ảnh, chỉ dưới dạng thư viện chia sẻ riêng `libopencamera_libraw.so`, liên kết động, kèm mã nguồn và thay được. Chỉ dùng thư viện/model Apache/MIT/BSD/CC0 đã kiểm tra file LICENSE (và model card). Không dùng GPL/LGPL/CeCILL/phi thương mại (Zero-DCE, Deep WB, CodeFormer, ...). Ghi nguồn, giấy phép, hash từng model vào `NOTICE` và tài liệu model.
3. **Code nguồn gốc.** Được đọc code dịch ngược (Leica/MIUI trong `D:\Projects\gauguin\miui-ports\leica\jadx-*`) để hiểu logic, nhưng tự viết; không chép code, model, LUT hay hình ảnh độc quyền; không dùng nhãn hiệu Leica/Xiaomi.
4. **Native code** căn trang 16 KB (`-Wl,-z,max-page-size=16384`), libc++ tĩnh.
5. Không nhắc tới AI/Claude trong code, tài liệu, commit; không trailer co-author.

## Thiết bị test

- **gauguin** (Mi 10T Lite, SM7225, Android 17), serial `c28004a8`, USB. Được cài, mở, thao tác UI app của mình. Nếu màn khóa: đọc PIN từ `D:\Projects\gauguin\.tools\.pin` vào biến (không in ra), mở khóa: `adb -s c28004a8 shell "svc power stayon true; input keyevent 224; sleep 1; input swipe 540 2100 540 700 200; sleep 1; input text <PIN>; input keyevent 66"`.
- **iQOO Neo 11** (máy cá nhân của người dùng, Android 16, Snapdragon 8 Elite), qua adb không dây (serial lấy từ `adb devices`, dạng `adb-10CFBC0R3U0012F-...` hoặc `<iqoo-lan-ip>:<port>`). **Chỉ** được: cài/gỡ `dev.opencamera.app*`, mở app bằng `am start`/`monkey` đúng package, đọc logcat của app, chụp màn hình. **Không** chạm/gõ/vuốt (`input`) trên máy này. Nếu phải xác nhận cài đặt trên máy, ghi lại để người dùng bấm.
- Luôn dùng `adb -s <serial>`. Không kết nối thiết bị nào khác. Phiên test ngắn; nhiều người dùng chung máy.
- **Thoát app sau mỗi lần test** (yêu cầu của người dùng): xong mỗi phiên chụp/test thì `adb -s <serial> shell am force-stop <package>` cho mọi package `dev.opencamera.app*` đã mở, rồi về màn hình chính (`input keyevent 3`, chỉ trên gauguin). Không để camera chạy nền giữa các phiên chờ build.
- Kho ảnh mẫu: D:\Projects\open-camera-testdata (manifest.json, tools/fetch.py; trên gauguin: /sdcard/Pictures/OpenCameraTest)

## Báo cáo

Mỗi phase viết `plans/reports/open-camera-<yymmdd-hhmm>-<phase>.md`: đã làm gì, bằng chứng test (từng máy), giấy phép model, file dùng chung đã sửa (ghi chú merge), việc còn lại. Câu trả lời cuối: Status DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT, Summary, Concerns.
