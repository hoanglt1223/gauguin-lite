# Phase 5: Runtime AI (CPU/GPU/DSP) và tính năng AI

## Bối cảnh

Leica port: composition assist (`cacnet.onnx`), aesthetic scoring (NIMA), style transfer ONNX CPU (ONNX Runtime FP32/XNNPACK), các model `.minn` QNN chỉ chạy HTP (không chạy được trên SM7225). MIUI: AI scene detection, portrait bokeh, beautify (FaceUnity SDK độc quyền), super night. Không dùng lại bất kỳ model nào trong số đó. SM7225: Kryo 570 (2×A77 + 6×A55), Adreno 619, Hexagon DSP thế hệ cũ (HVX; hỗ trợ QNN HTP chưa chắc, cần xác minh).

## Yêu cầu

### Runtime (`:ml`)

- Giao diện `InferenceBackend` với các cài đặt: LiteRT (GPU delegate, NNAPI delegate khi API < 35 còn có, XNNPACK CPU), ONNX Runtime Mobile (CPU/XNNPACK; NNAPI EP), QNN (chỉ flavor `qnn`, nạp động, có thể thiếu).
- Chọn backend tự động bằng benchmark lần đầu trên mỗi model (ghi kết quả vào cache theo fingerprint), người dùng ghi đè trong Settings.
- Định dạng model ưu tiên: `.tflite` (LiteRT) cho GPU, `.onnx` cho CPU; mỗi model có `model.json` (nguồn, giấy phép, SHA-256, input/output, backend hỗ trợ).
- Model lớn tải tùy chọn (không nằm trong APK F-Droid), từ release GitHub của dự án, kiểm SHA-256.

### Tính năng và model (chỉ giấy phép trong danh sách trắng)

| Tính năng | Model/cách làm | Giấy phép |
|---|---|---|
| Portrait bokeh | MediaPipe selfie segmentation / image segmenter (người); depth từ camera depth nếu profile có; blur theo disc kernel, bảo vệ tóc bằng guided filter | Apache-2.0 |
| Face beauty (làm mịn, sáng da, nhẹ) | MediaPipe face landmarker + bilateral/frequency separation tự viết | Apache-2.0 |
| Denoise ảnh đơn / night trên YUV | NAFNet (bản nhỏ, tự xuất ONNX/TFLite, tiling) | MIT |
| Super resolution | Real-ESRGAN (x2/x4, bản nhẹ) hoặc tự huấn luyện mô hình nhỏ | BSD-3-Clause |
| Low-light enhance | Ưu tiên đa khung phase 4; model đơn khung: tự huấn luyện (Zero-DCE/MIRNet chỉ sau khi xác minh giấy phép) | tùy |
| Scene detection | Phân loại nhẹ (MobileNetV3/EfficientNet-Lite từ TF Hub/Kaggle Models, Apache-2.0) + bảng map nhãn → preset (food, sky, night, document, portrait, plant, text) | Apache-2.0 |
| Composition assist | Tự cài: rule-of-thirds/horizon bằng thuật toán + saliency (U²-Net, Apache-2.0) để gợi ý crop; không dùng CACNet | Apache-2.0 |
| Aesthetic score | NIMA của idealo (MobileNet) | Apache-2.0 |
| Style looks ML (tùy chọn) | Fast neural style tự huấn luyện trên ảnh CC0 của dự án | của dự án |
| Document scan | OpenCV contour + perspective (phase 6 dùng) | Apache-2.0 |

## File / module

- `ml/` (sở hữu riêng): `InferenceBackend.kt`, `LiteRtBackend.kt`, `OrtBackend.kt`, `QnnBackend.kt` (flavor `qnn`), `BackendSelector.kt`, `ModelRegistry.kt`, `ModelDownloader.kt`
- `ml/models/*/model.json`, `tools/model-export/` (script xuất/quantize, chạy ngoài app)
- `pipeline/.../{Bokeh,Beauty,Denoise,SuperRes}Processor.kt`; `:app` chế độ Portrait, overlay composition, chip scene

## Các bước

1. Runtime + benchmark + registry, test với một model nhỏ.
2. Segmentation bokeh (giá trị cao nhất), rồi scene detect, aesthetic, composition.
3. Denoise, SR, beauty.
4. Đánh giá QNN trên gauguin: thử QNN HTP/DSP với Hexagon của SM7225; nếu không chạy, flavor `qnn` chỉ dành cho SoC mới hơn.
5. Tài liệu `licenses/models.md`.

## Kiểm chứng

- Mỗi model: test đầu ra so với tham chiếu (cosine > 0.99 giữa backend), benchmark lưu vào `docs/benchmarks/`.
- Gauguin: segmentation preview ≥ 15 fps (GPU), bokeh ảnh 12MP < 2 s, NAFNet 12MP tiled < 10 s, scene detect < 30 ms/khung.
- APK `foss` không chứa blob độc quyền (CI quét `lib/` so với danh sách cho phép).

## Rủi ro

- GPU delegate không hỗ trợ op → lùi CPU tự động, log backend thực tế.
- Model nặng làm APK lớn → tải tùy chọn.
- Giấy phép model thay đổi/không rõ → chỉ dùng danh sách trắng đã xác minh, kiểm lại trước mỗi release.

## Rollback

Mỗi tính năng AI có flag; tắt runtime thì app vẫn đủ phase 1–4.
