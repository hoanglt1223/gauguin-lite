# Old-ABI framework object sizing scan (camera blobs)

Date: 2026-11-09. Result: no new undersized allocations found. Nothing patched or deployed.

## Scope scanned (pulled from device, `miui-ports/hal-patch/gb-scan/`)

- `blobs/`: 108 libs. `/vendor/lib64/camera/components/*.so`, `hw/camera.qcom.so`, `hw/com.qti.chi.override.so`,
  `libcamx*`, `libmi*`, `lib*cam*`, `/system/lib64/*xiaomi*.so`, `*camera*.so`.
  `/vendor/lib64/camx*.so` does not exist on the device. `/system/priv-app/MiuiCamera/lib/arm64` does not exist either.
- `blobs2/`: all other vendor libs that mention `libui.so`, `libgui` or `GraphicBuffer` (device-side grep):
  libHalSuperSensorServer, libalLDC, libalhLDC, libgpu_tonemapper, unnhal-acc-common, libvidhance, camera.device@*-impl.
- `apklib/`: the 25 arm64 libs bundled inside `MiuiCamera.apk`.

## Method

`gb-scan/scan-framework-ctor-allocs.py`: resolves PLT stubs and finds every `bl` to an imported ctor of a libui/libgui/libbinder/libutils
class (GraphicBuffer, Surface, BufferQueue, consumers, listeners, Fence, Thread, BBinder, GraphicBufferMapper, ...).
It then walks back to the nearest `_Znwm`/`malloc`/`posix_memalign` and reports the size immediate.
A second pass listed every imported `_ZN7android*` ctor and `_ZTVN7android*` vtable per lib, to catch inline construction
and subclasses of framework bases.

A17 reference sizes: GraphicBuffer is 0xd30. This matches the vidhance finding, and A17-built `libgpu_tonemapper.so`
also does `new(0xd30)`.

## Findings

| Lib | Site | Old size | New size | Evidence | Test |
|---|---|---|---|---|---|
| com.vidhance.node.eis.so | 0x2369c / 0x2cc24 / 0x2d16c | 0x100 | 0x1000 | Already patched (debugger-261109-1530); device copy shows `#0x1000` | Previously verified |
| libcamera_algoup_jni.xiaomi.so | BBinder subclass `new(0x38)` | - | - | Same size as the A17-built libcamera_client uses for its BBinder subclasses. IProducerListener layout fixed earlier | n/a |
| libcamera_mianode_jni.xiaomi.so | BBinder subclass `new(0x38)` | - | - | As above | n/a |
| libcamera_jpegutil_jni.xiaomi.so | GraphicBuffer::lockAsync*, Fence::dup | - | - | No ctor and no vtable import. It only gets objects from a Java long field and reads `ANativeWindowBuffer::format` at +0x54 (RefBase 0x10 + 0x44), which is a stable ABI | n/a |
| libmialgoengine, com.qti.chi.override, com.vidhance.stats.aec_dmbr, unnhal-acc-common | RefBase / String8 / VectorImpl / hidl_* | - | - | Sizes are ABI-frozen (RefBase 0x10, String8 8 bytes, hidl types frozen) | n/a |
| libcamera_client, libcamera2ndk, camera.device@*-impl, libgpu_tonemapper | Surface `new(0x488)`, GraphicBufferMapper `new(0x10)`, GraphicBuffer `new(0xd30)` | - | - | Built from A17 source. The impl md5 matches `out/target/product/gauguin` | n/a |
| MiuiCamera.apk libs (25), libHalSuperSensorServer, libalLDC/alhLDC, libvidhance, other camx/qti/mi components | - | - | - | No libui/libgui ctor or vtable imports | n/a |

## Conclusion

com.vidhance.node.eis.so was the only stock blob that placement-constructs a framework class whose size grew.
The earlier libcamera_dirty / algoup / mianode fixes cover the listener cases. No blobs were changed, so there was no
device deploy, no VM copy and no camera retest in this pass.

## Not covered

- Framework objects created inside a blob's own code with no imported ctor or vtable. One example would be a hand-rolled
  copy of a struct that embeds a framework type by value with an inline-only ctor. No such vtable imports exist, and
  inline-only types (String8, sp, Mutex) are stable, so the remaining risk is low.
- 32-bit (`/vendor/lib`) blobs were not scanned. The camera provider is 64-bit.
