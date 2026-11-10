#!/usr/bin/env python3
"""
patch_libcamera_dirty.py - in-place ARM64 patch for libcamera_dirty.so (gauguin MIUI cam port)

Bug: MiAiCamera::DirtyCamera::Forward() runs an embedded NN (dirty-lens detection
model). Its NEON GEMM kernel reads up to 32 bytes past the end of a heap tensor
(scudo secondary allocation). With the MIUI camera's heap layout the tensor ends
at a page boundary -> SIGSEGV in the camera provider (tombstone: SEGV_ACCERR at
0x...ff000, thread Preview_6, backtrace Forward -> session run -> GEMM).

Fix (strategy b): make Forward return immediately. The NN session is never
created/run, so the overflowing GEMM never executes. GetResult still runs
MeanStd (pure math, in-bounds); the dirty probability stays 0.0 (result struct
is zeroed in DirtyCameraInterface::Init), so the lens-dirt verdict is a
deterministic "clean" and the HAL continues its normal path. Apps that never
enable Xiaomi dirty-lens detection (stock/GCam/Leica) are unaffected.

Patch: single instruction, file offset == vaddr (PT_LOAD identity-mapped .text):
  0x7818: ff c3 03 d1  (sub sp, sp, 0xf0)  ->  c0 03 5f d6  (ret)

Usage:
  python3 patch_libcamera_dirty.py apply  <in.so> <out.so>
  python3 patch_libcamera_dirty.py verify <in.so>          # check pristine bytes
  python3 patch_libcamera_dirty.py revert <in.so> <out.so> # restore original insn
"""

import hashlib
import sys

EXPECTED_SHA256 = "e9bbad41ca6f8a27ea4b01f9c53e849e8ad323e6c718506cf38e673e04b01959"
EXPECTED_SIZE = 1509128

PATCHES = [
    {
        "offset": 0x7818,
        "old": bytes.fromhex("ffc303d1"),  # sub sp, sp, #0xf0  (Forward prologue)
        "new": bytes.fromhex("c0035fd6"),  # ret
        "why": "MiAiCamera::DirtyCamera::Forward entry -> immediate return; "
        "skips NN session create/set/run (crash path) cleanly",
    }
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
            print("NOTE: not the known-pristine hash (may already be patched or a different build)")
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
        print(
            f"{mode} 0x{p['offset']:x}: {p[a].hex()} -> {p[b].hex()}  # {p['why']}"
        )

    assert len(data) == EXPECTED_SIZE
    open(dst, "wb").write(bytes(data))
    print(f"wrote {dst} ({len(data)} bytes, sha256 {hashlib.sha256(bytes(data)).hexdigest()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
