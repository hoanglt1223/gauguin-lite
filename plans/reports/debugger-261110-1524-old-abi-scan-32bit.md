# Quét lỗi ABI cũ (kích thước object framework) phía 32-bit

Ngày: 2026-11-10. Kết quả: không có cấp phát thiếu kích thước nào trong blob stock 32-bit. Không vá, không deploy, không restart service.

## Phạm vi

- Kéo từ máy (adb root) vào `miui-ports/hal-patch/gb-scan32/`: `/vendor/lib` (330 file), `/system/lib` (425 file).
- `/system/lib/*xiaomi*.so`: không tồn tại trên máy.
- Tiến trình 32-bit đang chạy (`ps -A -o PID,BIT,NAME`): `android.hardware.audio.service`, `android.hardware.cas@1.2-service`,
  `media.hwcodec`, `mediaserver`, `drmserver`, `zygote`/`webview_zygote` (app 32-bit). Không có camera provider 32-bit.
- Phân loại blob stock và lib build từ A17: danh sách prebuilt trong `vendor/xiaomi/**/proprietary/vendor/lib` trên VM có 111 lib ARM.
  Bốn lib có trên máy nhưng không có trong `out/` của VM cũng được tính là stock: `libEGL_adreno`, `libGLESv2_adreno`,
  `libq3dtools_adreno`, `hw/gralloc.lito.so`. Mọi lib còn lại trong `/vendor/lib` có md5 khớp với `out/target/product/gauguin`.

## Phương pháp

- `gb-scan32/scan-framework-ctor-allocs-arm32.py` là bản ARM32 của scanner 64-bit, có các điểm khác sau:
  - Giải PLT ARM theo mẫu `add ip,pc / add ip,ip / ldr pc,[ip,#]!` và tra `.rel.plt`.
  - Disassemble Thumb-2, quay sang ARM nếu không có hit.
  - Tìm `bl/blx` tới ctor framework được import. Danh sách class mở rộng thêm GraphicBuffer*, Surface*, consumer/listener, Fence,
    Thread, Looper, binder, Memory*, String8/16, ABuffer/AMessage, MediaBuffer, MetaData, OMX/SoftOMX.
  - Lùi về `_Znwj`/`malloc`/`posix_memalign` gần nhất và đọc immediate size (`movs/mov.w/movw`).
  - Liệt kê thêm mọi import ctor và vtable `_ZTVN7android*`.
- Lượt thứ hai đọc `DT_NEEDED` của mọi lib `/vendor/lib`, tìm lib nào link `libui`/`libgui`/`libbinder`/`libstagefright*`.

## Kết quả

| Lib | Process | Site | Size cũ | Size A17 | Verdict | Action |
|---|---|---|---|---|---|---|
| soundfx/libmisoundfx.so (stock) | android.hardware.audio.service | import `Thread::Thread(bool)` C2, RefBase, String8 | - (ctor base trong subclass) | layout Thread không đổi | OK. `Thread.h` A17 vẫn là mCanCallJava/mThread/mLock/mThreadExitedCondition/mStatus/mExitPending/mRunning/mHoldSelf/mTid | Không |
| libcdsprpc.so, libcdsprpc_system.so (stock) | (FastRPC client) | `RefBaseC2` sau `_Znwj(r0=r1+..)` | runtime | RefBase 8 byte (32-bit) | OK, RefBase bị đóng băng ABI | Không |
| hw/audio.primary.lito, audiohalext/bluetooth_audio impl, vendor.qti.* HIDL, libbatterylistener, libvppclient (stock) | audio.service | chỉ `RefBaseC2` | - | - | OK | Không |
| libqcodec2_* (stock) | media.hwcodec | không import ctor hay vtable android:: | - | - | Ngoài nhóm lỗi này | Không |
| gralloc.lito.so, *_adreno, libqdMetaData (stock) | mediaserver, media.hwcodec | không import libui/libgui | - | - | OK | Không |
| libui, libcodec2_vndk, libcodec2_hidl, camera.device@*-impl, libstagefright_foundation, libbinder, libhidlbase, audio@7.0-impl, libclearkeycasplugin | nhiều | GraphicBuffer/Fence/Mapper/ABuffer/AMessage/Thread | - | - | Build từ source A17 (md5 khớp `out/`) | Không |

Không có blob stock 32-bit nào link `libui.so` hay `libgui.so`. Chỉ các lib build từ A17 mới link hai lib này.
Vì vậy phía 32-bit không có lỗi kiểu `new(0x100)` + GraphicBuffer như trong `com.vidhance.node.eis.so`.

## Lib mà các process 32-bit nạp (lấy từ /proc/pid/maps)

- `mediaserver`: chỉ có chuỗi mapper/gralloc (`libgralloc.qti`, `libgralloccore`, `libqdMetaData`, mapper@4.0-impl-qti-display).
  Không có blob camera hay codec stock. Crash FrameDecoder đang được agent khác xử lý trong `libstagefright` (AOSP).
  Lần này không động vào lib đó và không restart mediaserver.
- `media.hwcodec`: `libqcodec2_*` (stock), `libcodec2_vndk/hidl` (A17), `libui` (A17), `libavservices_minijail`, gralloc, `libqdMetaData`.
- `android.hardware.audio.service`: `audio.primary.lito` và các soundfx stock (libmisoundfx, libasphere, libshoebox, libqcom*...).
- `android.hardware.cas@1.2-service`, `drmserver`: chỉ lib AOSP.

## Cần chép vào cây build VM

Không có. Không có blob nào được vá.

## Chưa bao phủ

- ABI Codec2 (C2Buffer/C2Work...) giữa `libqcodec2_*` stock và `libcodec2_vndk` A17. Đây không phải lỗi sizeof của class android::,
  nhưng nếu `media.hwcodec` crash thì nên soi tiếp từ đây.
- Lib 32-bit đi kèm APK (MiuiCamera chỉ có arm64) và app 32-bit chạy qua zygote: không quét.
