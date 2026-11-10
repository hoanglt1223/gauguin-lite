# MIUI Camera video: red/blue swap

Date: 2026-11-09. Status: fixed on device and verified.

## Cause

`vendor.vidhance.enabled=0` puts the Vidhance EIS CHI node
(`/vendor/lib64/camera/components/com.vidhance.node.eis.so`) into passthrough mode. In
`ProcessRequest`, passthrough copies the input image to the output with plain per-plane
`memcpy`. Its input and output buffers have different formats (NV12 and NV21). The node knows
this and logs `[VIDHANCE] ProcessRequest(): Copying image between two different formats`
on every frame, but it still copies the bytes unchanged. So the interleaved chroma plane
reaches the consumer with U and V swapped. That is why blue looks red-orange and yellow looks
cyan, in both the EIS2 preview and the EIS3 video stream. Photo mode and Aperture do not use
this node, which is why their colors are correct.

The copy runs in two code paths: a whole-plane copy at 0x128fc, used when strides match, and a
row-by-row copy at 0x12a04, used when strides differ. On this device, recording uses the
row-by-row path.

## Fix: binary patch of com.vidhance.node.eis.so

Both `bl memcpy` calls (0x128fc and 0x12a04) are redirected to small code caves at 0x3f9a0
and 0x3f9c8. The caves sit in the zero padding at the end of the RX segment, whose
`p_filesz`/`p_memsz` grow from 0x2e9a0 to 0x2f000. The cave applies only to plane index 1
(chroma), and only when the input and output format IDs differ. In that case it copies with
`dst+1, size-1`, which turns UVUV into VUVU. The V sample sits one chroma sample off, which is
not visible. All other copies are unchanged.

- Original md5: `03e6c2b76d0668854cfd52d529da0b1c` (backup: `/data/local/tmp/com.vidhance.node.eis.so.orig`)
- Patched md5: `76898ceed35efea97da90bb27e6bafd4`
- Patch script (reproducible, asserts the original bytes): `miui-ports/hal-patch/vidhance/patch-vidhance-node-nv21-copy.py <in> <out>` (needs keystone and pyelftools)
- Patched blob: `miui-ports/hal-patch/vidhance/com.vidhance.node.eis.so.patched`

## Evidence

- Before: VID_20261109_151538.mp4. The URGO box is red and the toy is cyan (`miui-ports/hal-patch/vidhance/color-before.jpg`).
- First attempt (whole-plane path only): no change. That showed the row-by-row path is the one in use.
- After: VID_20261109_152321.mp4. The box is blue and the toy is yellow, in the mp4 (`color-after.jpg`) and in the live preview while recording (`color-after-preview.jpg`). The provider did not crash.

## Build tree

1. Ship the patched blob in place of the stock one: `vendor/lib64/camera/components/com.vidhance.node.eis.so`. Either commit `com.vidhance.node.eis.so.patched` into the vendor blobs, or add a `blob_fixup` in extract-files that runs the patch script. If proprietary-files.txt pins the blob by hash, update the pin to md5 `76898ceed35efea97da90bb27e6bafd4`.
2. Make the vendor prop persistent, for example in the device `vendor.prop` / `TARGET_VENDOR_PROP`: `vendor.vidhance.enabled=0`.

## Not done

- Stabilization is still off. It needs Vidhance processing, which crashes (see debugger-261109-1410 report). There was no cheap path.
- Photo mode was not retested after the patch. The cave only acts when the node copies between different formats, so photo mode should not be affected (assumed, not checked).
- Side issue seen again: mediaserver SIGSEGV when it thumbnails the mp4 (known, not related).
