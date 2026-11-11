"""ARM32 (Thumb-2/ARM) variant of gb-scan/scan-framework-ctor-allocs.py.
Lists imported android:: framework ctors/vtables per lib and, for each call to an
imported framework ctor, the size of the preceding operator new/malloc.
Usage: scan-framework-ctor-allocs-arm32.py <dir> [<dir>...]"""
import os, re, sys
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_THUMB

CLASSES = (r"GraphicBuffer|Surface|BufferQueue|BufferItemConsumer|CpuConsumer|GLConsumer|ConsumerBase|"
           r"BnProducerListener|BnConsumerListener|ProducerListener|StubProducerListener|Fence|SurfaceControl|"
           r"SurfaceComposerClient|BufferItem|GraphicBufferAllocator|GraphicBufferMapper|IGraphicBufferProducer|"
           r"IGraphicBufferConsumer|BnGraphicBufferProducer|DummyConsumer|Thread|Looper|BBinder|BpBinder|"
           r"ProcessState|IPCThreadState|Parcel|MemoryHeapBase|MemoryBase|MemoryDealer|String8|String16|"
           r"MediaBuffer\w*|MetaData\w*|ABuffer|AMessage|AHandler|ALooper|ABase|MediaSource|MediaCodec\w*|"
           r"OMX\w*|SimpleSoftOMXComponent|SoftOMXComponent|SoftVideo\w+|SoftOMX\w+|ColorConverter|"
           r"KeyedVector|VectorImpl|SortedVectorImpl|RefBase|BnInterface|BpInterface|IInterface|HidlMemory")
FRAMEWORK = re.compile(rf"^_ZN7android\d+({CLASSES})\w*C[12]E")
VTABLE = re.compile(rf"^_ZTVN7android\d+({CLASSES})")
ALLOC = {"_Znwj", "_Znaj", "malloc", "calloc", "posix_memalign", "_ZnwjRKSt9nothrow_t", "memalign", "aligned_alloc"}
SIZE_REG = {"posix_memalign": "r2", "calloc": "r1"}


def plt_map(elf):
    dynsym = elf.get_section_by_name(".dynsym")
    rel = elf.get_section_by_name(".rel.plt")
    plt = elf.get_section_by_name(".plt")
    if not (dynsym and rel and plt):
        return {}
    got2name = {r["r_offset"]: dynsym.get_symbol(r["r_info_sym"]).name for r in rel.iter_relocations()}
    md = Cs(CS_ARCH_ARM, CS_MODE_ARM)
    md.skipdata = True
    insns = list(md.disasm(plt.data(), plt["sh_addr"]))
    out = {}
    for i, a in enumerate(insns):
        # add ip, pc, #A ; add ip, ip, #B ; ldr pc, [ip, #C]!
        if a.mnemonic == "add" and a.op_str.startswith("ip, pc,") and i + 2 < len(insns):
            try:
                val = a.address + 8 + int(a.op_str.split("#")[-1], 0)
                b, c = insns[i + 1], insns[i + 2]
                if b.mnemonic == "add" and b.op_str.startswith("ip, ip,"):
                    val += int(b.op_str.split("#")[-1], 0)
                    m = re.search(r"#(-?0x[0-9a-f]+|-?\d+)\]", c.op_str)
                    if m:
                        val += int(m.group(1), 0)
            except ValueError:
                continue
            if val in got2name:
                out[a.address] = got2name[val]
    return out


def imm_of(op):
    m = re.search(r"#(-?0x[0-9a-f]+|-?\d+)$", op)
    return int(m.group(1), 0) if m else None


def size_before(insns, j, reg):
    for k in range(j - 1, max(j - 20, -1), -1):
        q = insns[k]
        if q.mnemonic in ("b", "bx", "pop", "pop.w") or q.mnemonic.startswith("bl"):
            break
        if q.op_str.startswith(reg + ","):
            if q.mnemonic in ("mov", "movs", "mov.w", "movw", "movs.w"):
                v = imm_of(q.op_str)
                return (q.address, q.mnemonic, q.op_str, v)
            if q.mnemonic not in ("movt",):
                return (q.address, q.mnemonic, q.op_str, None)
    return None


def call_target(ins):
    if ins.mnemonic not in ("bl", "blx"):
        return None
    try:
        return int(ins.op_str.lstrip("#"), 16)
    except ValueError:
        return None


def scan(path):
    with open(path, "rb") as f:
        if f.read(4) != b"\x7fELF":
            return
        f.seek(0)
        elf = ELFFile(f)
        if elf["e_machine"] != "EM_ARM":
            return
        dynsym = elf.get_section_by_name(".dynsym")
        imports = sorted({s.name for s in dynsym.iter_symbols() if s["st_shndx"] == "SHN_UNDEF"
                          and (FRAMEWORK.match(s.name) or VTABLE.match(s.name))}) if dynsym else []
        if not imports:
            return
        plts = plt_map(elf)
        text = elf.get_section_by_name(".text")
        base, code = text["sh_addr"], text.data()
    targets = {a: n for a, n in plts.items() if FRAMEWORK.match(n)}
    print(f"== {path}")
    for n in imports:
        print(f"   import {n}")
    for mode, name in ((CS_MODE_THUMB, "thumb"), (CS_MODE_ARM, "arm")):
        md = Cs(CS_ARCH_ARM, mode)
        md.skipdata = True
        insns = list(md.disasm(code, base))
        hits = 0
        for i, ins in enumerate(insns):
            tgt = call_target(ins)
            if tgt not in targets:
                continue
            hits += 1
            alloc = None
            for j in range(i - 1, max(i - 60, -1), -1):
                p = insns[j]
                if p.mnemonic in ("pop", "pop.w") and "pc" in p.op_str:
                    break
                t = call_target(p)
                if t is not None:
                    n = plts.get(t)
                    if n in ALLOC:
                        alloc = (n, hex(p.address), size_before(insns, j, SIZE_REG.get(n, "r0")))
                        break
            print(f"  [{name}] call {ins.address:#x} -> {targets[tgt]}  alloc={alloc}")
        if hits and name == "thumb":
            break


for root in sys.argv[1:]:
    for dp, _, fs in os.walk(root):
        for fn in sorted(fs):
            if fn.endswith(".so"):
                try:
                    scan(os.path.join(dp, fn))
                except Exception as e:
                    print("ERR", os.path.join(dp, fn), e)
