# MIUI Camera video stabilization (Vidhance EIS) restored

Date: 2026-11-09. Status: fixed on device and verified with `vendor.vidhance.enabled=1`.

## Root cause

The heap corruption is in `com.vidhance.node.eis.so`, not in libvidhance. The node builds
`android::GraphicBuffer` objects with placement construction: it calls `posix_memalign(&p, 8, 0x100)`,
zeroes 0x100 bytes, then calls `GraphicBuffer::GraphicBuffer(...)` (C1) from `libui.so`. 0x100 was
`sizeof(GraphicBuffer)` in the Android 11/12 headers. Stock MIUI libui writes members up to offset
0xfc. The Android 17 `/vendor/lib64/libui.so` (md5 `cdc6641e77c1a4897f8fa39fcc9e9bc4`) is about
0xd30 bytes: its constructor writes up to `[this,#0xd28]`. Every GraphicBuffer the node wraps
therefore overruns the heap by about 3 KB. This corrupts libvidhance's objects (unordered_map,
vtables), which matches the crashes in the earlier report at a different bad pointer each time.
libc++ was a red herring.

There are three allocation sites. Each passes the size as `mov w2,#0x100` (bytes `02208052`):
- 0x2369c, before `GraphicBuffer(native_handle*, HandleWrapMethod, ...)` at 0x23784
- 0x2cc24, before `GraphicBuffer(w,h,fmt,layers,usage,std::string)` at 0x2ccb0
- 0x2d16c, before the handle-wrap constructor at 0x2d1dc

## Fix

Change all three sites to `mov w2,#0x1000` (bytes `02008252`). The extra bytes are never read
directly, because the node only uses ANativeWindowBuffer fields and libui methods.

- Script (asserts the original bytes): `miui-ports/hal-patch/vidhance/patch-vidhance-node-graphicbuffer-size.py <in> <out>`
- It is applied on top of the NV21 chroma patch (`patch-vidhance-node-nv21-copy.py`). Both patches
  are independent and either order works, because they touch different offsets.
- Result: `miui-ports/hal-patch/vidhance/com.vidhance.node.eis.so.patched2`, md5 `ac56b1debdd3622336a00bee7d09a76b`

## Verification

| Test | Result |
|---|---|
| `vendor.vidhance.enabled=1` + provider restart, record ~6 s | VID_20261109_153152.mp4, 1920x1080, 16.3 MB; provider alive (same PID), no new tombstone |
| Vidhance active | Logcat shows 2400x1352 input to 1920x1080 output (stabilizer crop margin), both VidhanceContexts and gyro running; only 2 passthrough "different formats" copies, at startup (before: one per frame) |
| Colors | `stab-frame.jpg`: URGO box blue, toy yellow (correct) |
| Repeat after relaunching the app | VID_20261109_153334.mp4, 15.6 MB, provider still alive |

Not done: a visual check of the stabilization quality itself (no shake test).

## Device state (kept)

- `/vendor/lib64/camera/components/com.vidhance.node.eis.so` = patched2 (md5 `ac56b1de...`).
  Backups: `/data/local/tmp/com.vidhance.node.eis.so.orig` (stock) and `/data/local/tmp/com.vidhance.node.eis.so.nv21` (NV21 patch only).
- `vendor.vidhance.enabled` set to `1` at runtime. The prop is not persisted anywhere, and unset means enabled, which is the stock default.
- libvidhance.so is the stock original (unchanged).

## Build tree

1. Ship `com.vidhance.node.eis.so.patched2` as `vendor/lib64/camera/components/com.vidhance.node.eis.so`.
   Either commit the blob, or add a `blob_fixup` that runs both scripts in sequence
   (nv21-copy, then graphicbuffer-size). If the blob is pinned by hash, use md5 `ac56b1debdd3622336a00bee7d09a76b`.
2. Do NOT add `vendor.vidhance.enabled=0`. This supersedes step 2 of debugger-261109-1514. Keep
   the NV21 patch anyway: it is harmless, and it still fixes colors if someone disables Vidhance.
3. Not tried: option B, routing to the QTI EIS nodes (com.qti.node.eisv2/eisv3 exist on vendor).
   It is no longer needed.

## Side issues (not related to Vidhance)

- mediaserver (32-bit) SIGSEGV while thumbnailing the mp4 is still present. Once, after the first
  recording, MIUI Camera ignored the shutter ("onShutterButtonClick: ignore touch event") until the
  app was relaunched. Probably the same thumbnail/mediaserver problem, but this was not confirmed.
- Other vendor blobs that placement-construct libui types with old sizes would break the same way.
  Worth grepping other MIUI camera blobs for `GraphicBufferC1` imports.
