"""List android:: framework ctor call sites in camera blobs and the size of the
preceding heap allocation. Usage: scan.py <dir> [<dir>...]"""
import os, re, sys
from elftools.elf.elffile import ELFFile
from elftools.elf.relocation import RelocationSection
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM

FRAMEWORK = re.compile(r"^_ZN7android\d+(GraphicBuffer|Surface|BufferQueue|BufferItemConsumer|CpuConsumer|"
                       r"GLConsumer|ConsumerBase|BnProducerListener|BnConsumerListener|ProducerListener|"
                       r"StubProducerListener|Fence|SurfaceControl|SurfaceComposerClient|BufferItem|"
                       r"GraphicBufferAllocator|GraphicBufferMapper|IGraphicBufferProducer|"
                       r"IGraphicBufferConsumer|BnGraphicBufferProducer|DummyConsumer|Thread|Looper|"
                       r"BBinder|BpBinder|ProcessState)\w*C[12]E")
ALLOC = {"_Znwm", "_Znam", "malloc", "calloc", "posix_memalign", "_ZnwmRKSt9nothrow_t", "memalign", "aligned_alloc"}


def plt_map(elf):
    dynsym = elf.get_section_by_name(".dynsym")
    rel = elf.get_section_by_name(".rela.plt")
    plt = elf.get_section_by_name(".plt")
    if not (dynsym and rel and plt):
        return {}
    got2name = {r["r_offset"]: dynsym.get_symbol(r["r_info_sym"]).name for r in rel.iter_relocations()}
    md = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
    out, insns = {}, list(md.disasm(plt.data(), plt["sh_addr"]))
    for i in range(len(insns) - 2):
        a, b = insns[i], insns[i + 1]
        if a.mnemonic == "adrp" and b.mnemonic == "ldr":
            page = int(a.op_str.split("#")[-1], 16)
            m = re.search(r"#(0x[0-9a-f]+)\]", b.op_str)
            if m and page + int(m.group(1), 16) in got2name:
                out[a.address] = got2name[page + int(m.group(1), 16)]
    return out


def scan(path):
    with open(path, "rb") as f:
        elf = ELFFile(f)
        if elf["e_machine"] != "EM_AARCH64":
            return
        plts = plt_map(elf)
        targets = {a: n for a, n in plts.items() if FRAMEWORK.match(n)}
        if not targets:
            return
        text = elf.get_section_by_name(".text")
        base, code = text["sh_addr"], text.data()
        off_delta = text["sh_offset"] - base
    md = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
    md.skipdata = True
    insns = list(md.disasm(code, base))
    print(f"== {path}")
    for i, ins in enumerate(insns):
        if ins.mnemonic != "bl":
            continue
        try:
            tgt = int(ins.op_str.lstrip("#"), 16)
        except ValueError:
            continue
        if tgt not in targets:
            continue
        alloc = None
        for j in range(i - 1, max(i - 60, 0), -1):
            p = insns[j]
            if p.mnemonic == "ret":
                break
            if p.mnemonic == "bl":
                try:
                    n = plts.get(int(p.op_str.lstrip("#"), 16))
                except ValueError:
                    n = None
                if n in ALLOC:
                    reg = "2" if n == "posix_memalign" else ("1" if n == "calloc" else "0")
                    size = None
                    for k in range(j - 1, max(j - 20, 0), -1):
                        q = insns[k]
                        if q.mnemonic in ("mov", "movz", "orr") and re.match(rf"[wx]{reg},", q.op_str):
                            size = (q.address + off_delta, q.op_str)
                            break
                    alloc = (n, p.address, size)
                    break
        print(f"  call {ins.address:#x} -> {targets[tgt]}  alloc={alloc}")


for root in sys.argv[1:]:
    for dp, _, fs in os.walk(root):
        for fn in fs:
            if fn.endswith(".so"):
                try:
                    scan(os.path.join(dp, fn))
                except Exception as e:
                    print("ERR", fn, e)
