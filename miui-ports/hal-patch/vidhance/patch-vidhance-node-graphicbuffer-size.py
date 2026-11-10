"""Grow the node's GraphicBuffer allocations from 0x100 to 0x1000 bytes.

The node placement-constructs android::GraphicBuffer into a 0x100-byte
posix_memalign block (sizeof from the Android 11/12 headers). The Android 17
libui GraphicBuffer is ~0xd30 bytes, so its constructor overflows the heap.
Usage: patch-vidhance-node-graphicbuffer-size.py <in> <out>
"""
import sys
OLD = bytes.fromhex("02208052")  # mov w2, #0x100
NEW = bytes.fromhex("02008252")  # mov w2, #0x1000
SITES = (0x2369C, 0x2CC24, 0x2D16C)
data = bytearray(open(sys.argv[1], "rb").read())
for off in SITES:
    assert data[off:off + 4] == OLD, hex(off)
    data[off:off + 4] = NEW
open(sys.argv[2], "wb").write(data)
