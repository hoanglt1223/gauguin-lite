#!/usr/bin/env python3
"""
patch_libcamera_mianode.py - in-place ARM64 patch for
libcamera_mianode_jni.xiaomi.so (MIUI 14/A12-era app-side algo JNI lib,
shipped by this port at /system/lib64/).

Bug: the Surface-connect helper builds an A12-era SurfaceListener
(BnInterface<IProducerListener>-derived, vtable + RefBase/String16 layout as
of A12) and passes it to Surface::connect -> BufferQueueProducer::connect.
On LineageOS 24 (A17) libgui, BufferQueueProducer::connect calls
IInterface::asBinder(listener) -> listener->queryLocalInterface(), a virtual
call into the old object that runs A12-compiled code against A17 String16
layout -> String16::size() dereferences a garbage pointer
(0xa9bc7bfdd503233b) -> SIGSEGV kills com.android.camera
(same bug as libcamera_algoup_jni; latent here).

Fix (null-listener strategy): pass a NULL sp<SurfaceListener> to
Surface::connect. Verified against LineageOS 24.0 libgui source:
  Surface::connect(int, const sp<SurfaceListener>&, ...) ->
      if (listener != nullptr) { mListenerProxy = ... }   // skipped when null
      mGraphicBufferProducer->connect(mListenerProxy /* null */, ...)
  BufferQueueProducer::connect(...) ->
      if (listener != nullptr) { asBinder(listener)->... queryLocalInterface }
      // entire crash block skipped when null
A null listener is a normal framework state (apps connect without listeners
all the time); only listener callbacks (buffer release/acquire notifications
for the algo pipeline) are lost.

Patch mechanics (identical code shape to the algoup fix):
  0xf15c  str x22,[sp]        -> str xzr,[sp]    ; sp handed to connect = null
  0xf160  cbz x22, 0xf188     -> b 0xf188        ; skip sp's incStrong
Refcount stays balanced: tmp2's inc/dec pair is removed together (the
post-call decStrong at 0x6290 is guarded by the existing cbz x8 at 0xf1a8);
the other sp's inc/dec pair is untouched. The old-layout
object is no longer touched by this path at all.

Usage:
  python3 patch_libcamera_mianode.py apply  <in.so> <out.so>
  python3 patch_libcamera_mianode.py verify <in.so>
  python3 patch_libcamera_mianode.py revert <in.so> <out.so>
"""

import hashlib
import sys

EXPECTED_SHA256 = "1feb745b06770c6b38a301bb3b37fd90ba3785a092beb5eaf1f5fec3b3a8cb9a"
EXPECTED_SIZE = 73616

PATCHES = [
    {
        "offset": 0xf15c,
        "old": bytes.fromhex("f60300f9"),  # str x22, [sp]
        "new": bytes.fromhex("ff0300f9"),  # str xzr, [sp]
        "why": "sp<SurfaceListener> passed to Surface::connect becomes null",
    },
    {
        "offset": 0xf160,
        "old": bytes.fromhex("560100b4"),  # cbz x22, 0xf188
        "new": bytes.fromhex("0a000014"),  # b 0xf188  (always skip incStrong)
        "why": "skip the null sp's RefBase::incStrong (post-call decStrong "
        "already guarded by cbz at 0xf1a8) - refcount stays balanced",
    },
]


def check_pristine(data: bytes) -> bool:
    if len(data) != EXPECTED_SIZE:
        print(f"size mismatch: {len(data)} != {EXPECTED_SIZE}")
        return False
    for p in PATCHES:
        cur = data[p["offset"]: p["offset"] + len(p["old"])]
        if cur != p["old"]:
            print(f"offset 0x{p['offset']:x}: expected {p['old'].hex()}, found {cur.hex()}")
            return False
    print("pristine check OK (size + patch-site bytes match)")
    return True


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    mode = sys.argv[1]
    src = sys.argv[2]

    data = bytearray(open(src, "rb").read())

    if mode == "verify":
        ok = check_pristine(bytes(data))
        h = hashlib.sha256(bytes(data)).hexdigest()
        print(f"sha256: {h}")
        if h != EXPECTED_SHA256:
            print("NOTE: not the known-pristine hash (already patched or different build)")
        return 0 if ok else 1

    if mode not in ("apply", "revert"):
        print(f"unknown mode: {mode}")
        return 2

    dst = sys.argv[3]
    a, b = ("old", "new") if mode == "apply" else ("new", "old")
    for p in PATCHES:
        cur = bytes(data[p["offset"]: p["offset"] + len(p[a])])
        if cur != p[a]:
            print(f"refusing: offset 0x{p['offset']:x} has {cur.hex()}, expected {p[a].hex()}")
            return 1
        data[p["offset"]: p["offset"] + len(p[b])] = p[b]
        print(f"{mode} 0x{p['offset']:x}: {p[a].hex()} -> {p[b].hex()}  # {p['why']}")

    assert len(data) == EXPECTED_SIZE
    open(dst, "wb").write(bytes(data))
    print(f"wrote {dst} ({len(data)} bytes, sha256 {hashlib.sha256(bytes(data)).hexdigest()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
