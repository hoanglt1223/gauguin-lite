# Khảo sát mã nguồn mở cho tính năng retouch (phase 11)

Ngày: 2026-11-11. Phạm vi: dự án GitHub và paper có code cho retouch ảnh trong editor của Open Camera (Apache-2.0, CPU/GPU, mục tiêu SM7225).

## Kết luận chính

1. Phần lớn retouch nên tự viết bằng thuật toán cổ điển trong `:pipeline` (C++/Halide/OpenCV): làm mịn da (guided filter + frequency separation trên mask từ MediaPipe), xóa mụn (OpenCV `inpaint` Telea cho đốm nhỏ, PatchMatch tự viết cho vùng vừa), làm trắng răng, sáng mắt, khử mắt đỏ, warp mặt, chỉnh méo/phối cảnh, tự cân đường chân trời. Không cần model mới ngoài MediaPipe đã có ở phase 5.
2. Xóa vật thể: **MI-GAN** (code MIT, có ONNX pipeline sẵn, nhỏ khoảng một bậc so với LaMa) là lựa chọn mặc định. **LaMa / big-lama** (Apache-2.0, ONNX 512×512 trên Hugging Face) là gói tải thêm cho chất lượng cao, nặng khoảng 200 MB và chậm trên Adreno 619.
3. Auto-enhance: **HDRNet** (Apache-2.0) cho đường chính, **CURL** (BSD-3) và **DeepLPF** (MIT) để tham khảo/huấn luyện lại. **Zero-DCE** bị loại (CC BY-NC 4.0).
4. Cân bằng trắng: **FFCC** (Apache-2.0, MATLAB) port sang C++ hoặc gray-world/white-patch. **Deep White Balance** bị loại (chỉ nghiên cứu, cấm thương mại).
5. Phục hồi mặt: **GFPGAN** code Apache-2.0 nhưng model 340 MB và nguồn gốc weights StyleGAN2/FFHQ cần xác minh; chỉ để tham khảo. **CodeFormer** bị loại (NTU S-Lab License 1.0, phi thương mại).
6. Editor UX: **PhotoEditor** (burhanrashid52, MIT) dùng được cho markup/text/sticker. darktable, RawTherapee (GPL-3.0) và G'MIC (CeCILL, kiểu GPL) chỉ đọc paper/thuật toán, không chép code.

## Bảng ứng viên

Ký hiệu: "Đã xác minh" là đã đọc LICENSE hoặc trang repo ngày 2026-11-11; "Cần xác minh" là dựa trên hiểu biết trước đó, phải kiểm LICENSE trước khi dùng. Kích thước và tốc độ đánh dấu "ước tính" là ước lượng, chưa đo trên gauguin.

| Ứng viên | Repo | Giấy phép | Kích thước model | Runtime di động | Tốc độ trên máy tầm trung | Ghi chú chất lượng | Khuyến nghị |
|---|---|---|---|---|---|---|---|
| MediaPipe Face Landmarker (478 điểm) | https://github.com/google-ai-edge/mediapipe | Apache-2.0 (đã có trong plan) | khoảng 3–4 MB `.task` | LiteRT, MediaPipe Tasks | vài chục ms/ảnh trên CPU (ước tính) | Nền cho mọi mask mặt: da, môi, răng, mắt, warp | Dùng |
| MediaPipe Selfie Multiclass Segmenter | cùng repo, model card trên ai.google.dev | Apache-2.0, cần xác minh model card | khoảng 16 MB (ước tính) | LiteRT | 256×256, nhanh | Có lớp tóc, da mặt, da thân, quần áo, nền: mask da cho beauty và mask người cho thay nền | Dùng (sau khi kiểm model card) |
| Guided filter (He et al.) / bilateral | OpenCV `ximgproc` (opencv_contrib) | Apache-2.0 | không có | C++ native, Halide | 12MP dưới 1 s trên CPU (ước tính) | Làm mịn giữ cạnh, nền cho frequency separation | Dùng (tự viết hoặc OpenCV) |
| OpenCV `inpaint` (Telea, Navier-Stokes) | https://github.com/opencv/opencv | Apache-2.0 (4.5+) | không có | native | đốm nhỏ: vài ms | Tốt cho mụn, bụi, đốm nhỏ; vùng lớn bị nhòe | Dùng (đốm nhỏ, đường lùi cuối) |
| PatchMatch (Barnes 2009) | tham khảo https://github.com/vacancy/PyPatchMatch | MIT (cần xác minh) | không có | tự viết C++ | vùng vừa trên ảnh thu nhỏ: dưới 2 s (ước tính) | Healing brush cổ điển, giữ texture; lỗi trên cấu trúc lớn | Dùng thuật toán, tự viết |
| MI-GAN | https://github.com/Picsart-AI-Research/MI-GAN | Code MIT (đã xác minh). File LICENSE-WEIGHTS hiện cũng là MIT nhưng không nêu rõ weights | khoảng 6M tham số, ONNX pipeline vài chục MB (ước tính) | ONNX có sẵn (`migan_pipeline_v2.onnx`, có pre/post-processing) | repo nói nhỏ và nhanh hơn SOTA khoảng 10 lần, không công bố số trên điện thoại | Tốt cho vật thể vừa ở 512; kém LaMa với vùng rất lớn | Dùng (mặc định cho xóa vật thể) |
| LaMa / big-lama | https://github.com/advimman/lama | Apache-2.0 (đã xác minh, Samsung Research) | big-lama ONNX khoảng 200 MB fp32 (ước tính) | ONNX 512×512 opset 17 tại https://huggingface.co/Carve/LaMa-ONNX (Apache-2.0); FFT là điểm khó cho GPU delegate | vài giây đến hơn 10 s trên CPU A77 (ước tính) | Chất lượng tốt nhất trong nhóm mở cho vùng lớn, cấu trúc lặp | Dùng như gói tải thêm, tùy chọn |
| IOPaint (lama-cleaner) | https://github.com/Sanster/IOPaint | Apache-2.0 (cần xác minh) | không có | desktop/server | không áp dụng | Tham khảo UX brush-mask, cách ghép MI-GAN/LaMa | Chỉ tham khảo |
| HDRNet (bilateral grid) | https://github.com/google/hdrnet | Apache-2.0 (đã xác minh) | dưới 1 MB | tự xuất TFLite; slicing bilateral grid viết bằng shader/Halide | thiết kế cho realtime trên điện thoại | Auto-enhance nhanh, cần huấn luyện lại trên dữ liệu giấy phép mở | Dùng (huấn luyện lại) |
| CURL | https://github.com/sjmoran/CURL | BSD-3-Clause (đã xác minh) | nhỏ (ước tính vài MB) | PyTorch, cần tự xuất ONNX | chưa có số | Đường cong toàn cục dễ giải thích, hợp UI thanh trượt | Tham khảo, có thể dùng |
| DeepLPF | https://github.com/sjmoran/DeepLPF | MIT (đã xác minh); ảnh FiveK không được phân phối lại | nhỏ | PyTorch, tự xuất | chưa có số | Bộ lọc cục bộ tham số (graduated, elliptical) giống công cụ của editor | Tham khảo |
| Zero-DCE / Zero-DCE++ | https://github.com/Li-Chongyi/Zero-DCE | CC BY-NC 4.0, "non-commercial use only" (đã xác minh) | rất nhỏ | dễ xuất | rất nhanh | Tốt cho thiếu sáng | Tránh |
| FFCC | https://github.com/google/ffcc | Apache-2.0 (đã xác minh), MATLAB | tham số vài KB | port C++ (FFT 2D trên histogram log-chroma) | vài ms | Cân bằng trắng chính xác, nhanh | Dùng (port) |
| Deep White Balance | https://github.com/mahmoudnafifi/Deep_White_Balance | "research purposes only, CAN NOT be used for commercial purposes" (đã xác minh) | không áp dụng | không áp dụng | không áp dụng | Chất lượng tốt | Tránh |
| Real-ESRGAN (gồm realesr-general-x4v3) | https://github.com/xinntao/Real-ESRGAN | BSD-3-Clause (đã có trong plan) | x4plus khoảng 64 MB; general-x4v3 (SRVGG) khoảng 5 MB (ước tính) | ONNX, NCNN (Real-ESRGAN-ncnn-vulkan) | general-x4v3 12MP tiled: hàng chục giây trên SM7225 (ước tính) | Dùng chung với phase 5 SR | Dùng (đã có ở phase 5, tái sử dụng) |
| SwinIR | https://github.com/JingyunLiang/SwinIR | Apache-2.0 (cần xác minh) | lightweight khoảng 1M tham số | ONNX được, attention chậm trên GPU di động | chậm hơn SRVGG nhiều | Chất lượng cao hơn chút | Chỉ tham khảo |
| NAFNet | https://github.com/megvii-research/NAFNet | MIT (đã có trong plan) | nhỏ khi dùng bản width nhỏ | ONNX/TFLite | đã có mục tiêu ở phase 5 | Denoise/deblur trong editor | Dùng (tái sử dụng phase 5) |
| GFPGAN | https://github.com/TencentARC/GFPGAN | Code Apache-2.0 (đã xác minh); weights dựa trên StyleGAN2 và FFHQ, cần xác minh | v1.4 khoảng 340 MB (ước tính) | ONNX có port cộng đồng | chậm, nặng bộ nhớ | Phục hồi mặt mạnh nhưng "bịa" chi tiết | Chỉ tham khảo |
| CodeFormer | https://github.com/sczhou/CodeFormer | NTU S-Lab License 1.0, phi thương mại (đã xác minh tên giấy phép) | khoảng 360 MB | không áp dụng | không áp dụng | Tốt nhất về phục hồi mặt | Tránh |
| Mesh warp từ landmark (MLS, Schaefer 2006) | thuật toán; nhiều repo nhỏ không rõ giấy phép | thuật toán công khai | không có | tự viết shader GLES/Halide | realtime trên GPU | Làm gọn mặt, to mắt | Dùng thuật toán, tự viết |
| Lensfun | https://github.com/lensfun/lensfun | LGPL-3.0 code, CC BY-SA 3.0 dữ liệu (cần xác minh) | không áp dụng | C | nhanh | Database ống kính máy ảnh rời, ít giá trị cho điện thoại | Tránh (dùng `LENS_DISTORTION` của Camera2) |
| Auto-straighten (Hough lines, LSD) | OpenCV | Apache-2.0 | không có | native | dưới 100 ms trên ảnh thu nhỏ | Đủ tốt cho đường chân trời, công trình | Dùng |
| PhotoEditor (Android) | https://github.com/burhanrashid52/PhotoEditor | MIT (đã xác minh) | không áp dụng | Android View | không áp dụng | Brush, text, emoji, sticker, undo/redo | Dùng cho markup (hoặc tham khảo) |
| darktable (retouch, liquify, local contrast) | https://github.com/darktable-org/darktable | GPL-3.0 | không áp dụng | không áp dụng | không áp dụng | Mô hình module retouch/liquify tốt | Chỉ tham khảo paper/UX, không đọc để chép code |
| RawTherapee | https://github.com/RawTherapee/RawTherapee | GPL-3.0 | không áp dụng | không áp dụng | không áp dụng | Local adjustments, wavelet | Chỉ tham khảo |
| G'MIC | https://gmic.eu | CeCILL (kiểu GPL/LGPL) | không áp dụng | không áp dụng | không áp dụng | Kho bộ lọc lớn | Chỉ tham khảo |

## Bẫy giấy phép phát hiện

- Zero-DCE: CC BY-NC 4.0 và chỉ nghiên cứu. Plan đang ghi "cần xác minh"; nay xác nhận là loại.
- Deep White Balance: cấm thương mại.
- CodeFormer: NTU S-Lab License 1.0, phi thương mại.
- GFPGAN: code Apache-2.0 nhưng weights phụ thuộc StyleGAN2 (NVIDIA) và dataset FFHQ (CC BY-NC-SA cho ảnh); không đưa weights vào app cho tới khi có bằng chứng rõ.
- MI-GAN: LICENSE-WEIGHTS hiện là văn bản MIT cho "the Software", không nói rõ weights; ghi nguồn và hash, kiểm lại trước mỗi release.
- MediaPipe model: giấy phép theo từng model card, không mặc định theo repo.
- GPL/CeCILL (darktable, RawTherapee, G'MIC, Open Camera): không chép code vào app Apache-2.0.
- Dataset FFHQ, MIT-Adobe FiveK: không phân phối lại; huấn luyện lại HDRNet nên dùng dữ liệu có giấy phép rõ.

## Giới hạn của khảo sát

- Chưa đo trên gauguin; mọi số tốc độ là ước tính hoặc lấy từ README, cần benchmark ở bước 1 của phase 11.
- Kích thước model đánh dấu ước tính chưa tải về kiểm.
- Không khảo sát relighting bằng model (các model mở như Total Relighting không có weights phát hành); đề xuất relight bằng normal xấp xỉ từ face mesh.
- Không khảo sát sky segmentation chuyên dụng; dùng segmenter đa lớp DeepLab/MediaPipe hoặc ngưỡng màu + guided filter.

## Câu hỏi chưa giải quyết

1. Có chấp nhận gói tải thêm khoảng 200 MB cho big-lama không, hay chỉ MI-GAN?
2. Có cho phép tính năng "bịa chi tiết" như phục hồi mặt không, nếu sau này có model giấy phép sạch?
3. Dữ liệu nào dùng để huấn luyện lại HDRNet (dataset giấy phép mở nào, hay ảnh CC0 tự chụp)?
