# Nguồn và giấy phép cho app camera mở (fork Aperture)

Ngày 2026-11-09. Kế hoạch: `plans/261109-2101-open-camera-app/plan.md`.

## Kết luận

Aperture là gốc fork phù hợp: Apache-2.0, Kotlin, CameraX đầy đủ (gồm `camera-extensions`), minSdk 26, đã có đường build Soong qua plugin `lineageos.generatebp`. Mọi khối xây dựng cần thiết đều có bản giấy phép dễ dãi (Halide, OpenCV, LiteRT, ONNX Runtime, MediaPipe, NAFNet, Real-ESRGAN, NIMA). Ba nhóm phải tránh hoặc xác minh trước: model nghiên cứu có thể chỉ phi thương mại (Zero-DCE, MIRNet, CACNet), Qualcomm QNN/SNPE (độc quyền, không hợp F-Droid), và mã GPL (Open Camera).

## Aperture (đã kiểm trực tiếp)

- Repo: https://github.com/LineageOS/android_packages_apps_Aperture (nhánh `lineage-24.0`).
- `app/build.gradle.kts`: `compileSdk 36`, `minSdk 26`, `targetSdk 36`, namespace `org.lineageos.aperture`; plugin `lineageos.generatebp` sinh `app/Android.bp`, `androidx.camera` và `androidx.media3` do LineageOS cung cấp.
- Phụ thuộc: CameraX (core, camera2, lifecycle, video, view, viewfinder-core, extensions), Media3 ExoPlayer/UI, Coil, kotlinx-coroutines-guava, Material, ZXing core + zxing-cpp.
- REUSE: `LICENSES/Apache-2.0.txt`, `BSD-3-Clause.txt`, `CC-PDDC.txt`.
- Tính năng sẵn có (theo cây mã `app/src/main/java/org/lineageos/aperture/`): Photo/Video/QR, secure camera, lens selector, timer, grid, leveler, flash, HDR video, stabilization, noise reduction/edge/hot pixel/shading/distortion mode, CameraX Extensions, Google Lens, RRO overlay, `lens_launcher`.

## Ma trận giấy phép

| Thành phần | Giấy phép | Trạng thái | Link |
|---|---|---|---|
| Aperture | Apache-2.0 | đã kiểm | https://github.com/LineageOS/android_packages_apps_Aperture |
| CameraX / Jetpack | Apache-2.0 | đã biết | https://developer.android.com/jetpack/androidx/releases/camera |
| Camera2 Extensions | API nền tảng | đã biết | https://developer.android.com/reference/android/hardware/camera2/CameraExtensionCharacteristics |
| Halide | MIT | đã biết | https://github.com/halide/Halide |
| OpenCV 4.5+ | Apache-2.0 (từ 4.5.0) | đã biết | https://opencv.org/license/ |
| ONNX Runtime | MIT | đã biết | https://github.com/microsoft/onnxruntime |
| LiteRT (TFLite) | Apache-2.0 | đã biết | https://github.com/google-ai-edge/LiteRT |
| MediaPipe | Apache-2.0; model card từng model cần kiểm | cần kiểm model card | https://github.com/google-ai-edge/mediapipe |
| NAFNet | MIT | cần xác nhận lại file LICENSE | https://github.com/megvii-research/NAFNet |
| Real-ESRGAN | BSD-3-Clause | cần xác nhận lại | https://github.com/xinntao/Real-ESRGAN |
| NIMA (idealo) | Apache-2.0 | cần xác nhận lại | https://github.com/idealo/image-quality-assessment |
| U²-Net | Apache-2.0 | cần xác nhận lại | https://github.com/xuebinqin/U-2-Net |
| hdr-plus (Halide, timothybrooks) | chưa xác minh | chỉ đọc thuật toán | https://github.com/timothybrooks/hdr-plus |
| HDR+ burst dataset | CC-BY 4.0 (theo trang dataset) | cần xác nhận | https://hdrplusdata.org/ |
| Zero-DCE / Zero-DCE++ | chưa xác minh, có dấu hiệu phi thương mại | không dùng weights | https://github.com/Li-Chongyi/Zero-DCE |
| MIRNet | chưa xác minh | không dùng weights | https://github.com/swz30/MIRNet |
| CACNet | không rõ | không dùng | (model trong Leica port, nguồn gốc không rõ) |
| Qualcomm QNN / SNPE | độc quyền (Qualcomm license), phân phối runtime theo điều khoản | chỉ flavor riêng | https://www.qualcomm.com/developer/software/qualcomm-ai-engine-direct-sdk |
| Open Camera | GPL-3.0 | không tương thích để gộp mã | https://sourceforge.net/projects/opencamera/ |
| LibRaw | LGPL-2.1 / CDDL-1.0 | không cần (dùng `DngCreator`) | https://www.libraw.org/ |
| Font Inter / IBM Plex | SIL OFL 1.1 | đã biết | https://rsms.me/inter/ |

## Bài báo thuật toán (công khai, cài lại được)

- Hasinoff et al., "Burst photography for high dynamic range and low-light imaging on mobile cameras", SIGGRAPH Asia 2016.
- Liba et al., "Handheld Mobile Photography in Very Low Light" (Night Sight), SIGGRAPH Asia 2019.
- Wronski et al., "Handheld Multi-Frame Super-Resolution", SIGGRAPH 2019.
- Monod, Delon, Veit, "An Analysis and Implementation of the HDR+ Burst Denoising Method", IPOL 2021.
- Mertens et al., "Exposure Fusion", 2007 (có trong OpenCV).

## Nguồn trong repo này

- Leica port: `plans/261109-1409-leica-port-improve/plan.md`, `plans/reports/leica-261109-1514-port-rebuild.md` (catalog/zoom stop, backend AI, bài học ANR). Chỉ dùng làm danh sách tính năng và dữ liệu đo trên gauguin; không dùng mã/asset.
- `D:\Projects\camera-ports-los24\README.md`: không tìm thấy danh sách mode bằng grep; danh sách mode MIUI 14 lấy từ yêu cầu của người dùng.

## Giới hạn

- Bash trong phiên này hỏng, nên chưa mở từng file LICENSE của model; các dòng "cần xác nhận lại" phải được kiểm trước khi đưa vào build (bước đầu của phase 5).
- Khả năng QNN HTP trên Hexagon của SM7225 chưa xác minh.
