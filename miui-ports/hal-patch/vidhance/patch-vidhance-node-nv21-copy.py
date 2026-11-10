import struct, sys, keystone
src, dst = sys.argv[1], sys.argv[2]
b = bytearray(open(src, 'rb').read())
ks = keystone.Ks(keystone.KS_ARCH_ARM64, keystone.KS_MODE_LITTLE_ENDIAN)
CAVE, CALL, MEMCPY = 0x3f9a0, 0x128fc, 0x3ed60
assert b[CAVE:CAVE + 0x40] == bytes(0x40)
cave = """
cmp x24, #1
b.ne done
ldr w9, [x20, #0x10]
ldur x10, [x29, #-8]
ldr w10, [x10, #0x10]
cmp w9, w10
b.eq done
add x0, x0, #1
sub x2, x2, #1
done:
b %d
""" % MEMCPY
code, _ = ks.asm(cave, CAVE)
b[CAVE:CAVE + len(code)] = bytes(code)
call, _ = ks.asm("bl %d" % CAVE, CALL)
assert b[CALL:CALL + 4] == bytes(ks.asm("bl %d" % MEMCPY, CALL)[0])
b[CALL:CALL + 4] = bytes(call)
# row-by-row copy path (used when strides differ): plane index in x25
CAVE2, CALL2 = CAVE + len(code), 0x12a04
cave2 = """
cmp x25, #1
b.ne done
ldr x9, [sp, #0x10]
ldr w9, [x9, #0x10]
ldur x10, [x29, #-8]
ldr w10, [x10, #0x10]
cmp w9, w10
b.eq done
add x0, x0, #1
sub x2, x2, #1
done:
b %d
""" % MEMCPY
code2, _ = ks.asm(cave2, CAVE2)
b[CAVE2:CAVE2 + len(code2)] = bytes(code2)
assert b[CALL2:CALL2 + 4] == bytes(ks.asm("bl %d" % MEMCPY, CALL2)[0])
b[CALL2:CALL2 + 4] = bytes(ks.asm("bl %d" % CAVE2, CALL2)[0])
# grow the RX PT_LOAD (2nd phdr) so the cave is inside filesz
ph = 0x40 + 2 * 56
assert struct.unpack_from('<Q', b, ph + 8)[0] == 0x11000
struct.pack_into('<QQ', b, ph + 32, 0x2f000, 0x2f000)
open(dst, 'wb').write(b)
