# mediaserver SIGSEGV trong FrameDecoder::handleOutputBufferAsync (thumbnail mp4)

Ngày: 2026-11-10 · Thiết bị: gauguin, LineageOS 24 (A17) eng · Trạng thái: đã root-cause, có patch + workaround; chưa build/push (build ROM chưa xong)

## Nguyên nhân gốc

- Symbolize `pc 0xb7526` (libstagefright.so 32-bit) → `FrameDecoder.cpp:818`:
  `uint8_t* frameData = converter.wrap()->data();`
- Disasm: `blx GraphicView2MediaImageConverter::wrap()` → `ldr r7,[sp,#0x80]` (sp<ABuffer> trả về) → `ldr r2,[r7]` với r7 = 0 → fault addr 0x0. Con trỏ null là **sp<ABuffer> do `wrap()` trả về**.
- `GraphicView2MediaImageConverter::wrap()` (`media/codec2/sfplugin/utils/Codec2BufferUtils.cpp`) trả `mWrapped`, chỉ được set khi các plane của C2GraphicView nằm liền trong một vùng (`minPtr == data[0] && maxPtr-minPtr <= planeSize`). Header ghi rõ: "This is null if wrapping failed" — caller phải copy vào back buffer. FrameDecoder (async path, không Surface) không kiểm tra null.
- Codec: `c2.qti.avc.decoder` (do `media.stagefright.thumbnail.prefer_hw_codecs=true` trong /system/build.prop, kế thừa từ MIUI vendor build.prop), output 1080x2400, color-format 0x7F420888 (YUV420Flexible). Layout gralloc QTI (venus alignment/UV offset) vượt `planeSize` tính theo `align(height,64)` nên không wrap được → null → SIGSEGV.
- Tái hiện 100%: tạo mp4 bằng `screenrecord`, scan, rồi `content read --uri content://media/external/video/media/<id>/thumbnail` → tombstone_01 (15:30) cùng backtrace.

## Fix nguồn

`D:\Projects\gauguin\patches\frameworks_av-framedecoder-null-buffer.patch` (áp vào `frameworks/av`, `git apply --check` OK):
khi `wrap()` null → cấp `ABuffer(backBufferSize())`, `setBackBuffer()` + `copyToMediaImage()` (giống CCodecBuffers); lỗi thì release buffer và trả `ERROR_MALFORMED`. MediaImage2 mặc định của converter đã mô tả layout packed nên `image-data`/stride vẫn đúng với bản copy.

## Workaround không cần build

- `media.stagefright.thumbnail.prefer_hw_codecs=false` (đọc trong `StagefrightMetadataRetriever.cpp`; false → `kPreferSoftwareCodecs` → `c2.android.avc.decoder`).
- Test: `setprop ... false` + kill mediaserver → thumbnail cho id 165/166/167 đều OK (17 KB JPEG), mediaserver giữ nguyên PID, không tombstone mới, log xác nhận `c2.android.avc.decoder`.
- Đã persist vào `D:\Projects\gauguin\lite\lite-props.prop` (vào PRODUCT_PRODUCT_PROPERTIES, nạp sau /system/build.prop nên override được).
- Trên máy hiện tại prop chỉ là runtime (setprop) — mất khi reboot cho đến khi flash build mới.

## Việc còn lại

1. Khi `~/bld.done` có: append dòng prop vào `/srv/lineage/vendor/gauguin-lite/lite/lite-props.prop`.
2. Áp patch vào `/srv/lineage/frameworks/av`, `m libstagefright`, push lib 32/64-bit, kiểm 3 thumbnail với `prefer_hw_codecs=true` để xác nhận fix nguồn (chưa làm).
3. File test trên máy: `/sdcard/Movies/t1..t3.mp4`, `/data/local/tmp/th*.jpg` — xoá khi xong.
