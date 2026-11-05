"""Pull MIUI Camera and everything it depends on from a connected, non-rooted gauguin.

Seeds: the camera APK and its JNI libs, camera HAL / Xiaomi camera vendor files, and
companion apps. Native deps are resolved recursively from ELF DT_NEEDED entries plus
library names and file paths found as strings (dlopen'd libs, configs, tuning files).

Usage: python -I scripts/pull-miuicamera-deps.py <out_dir> [--root]
--root reads through Magisk su (adb shell must be granted) so /vendor and /odm are complete.
"""
import re
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

_args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = Path(_args[0] if _args else "miui-dump/miuicamera")
ROOTS = ["/system", "/system_ext", "/product", "/vendor", "/odm"]
LIB_DIRS = [f"{r}/{l}" for r in ROOTS for l in ("lib64", "lib")]
SEED_PATTERNS = [
    r"^/system/priv-app/MiuiCamera/",
    r"^/system/priv-app/MiuiExtraPhoto/",
    r"^/system/app/CameraTools/",
    r"^/system/app/CameraExtensionsProxy/",
    r"^/system/app/MediaFeature/",
    r"^/system/priv-app/RtMiCloudSDK/",
    r"^/system/app/(miui|miuisystem)/",
    r"^/system/framework/(framework|services|miui[^/]*|framework-ext-res/[^/]*|android\.test\.base|[^/]*camera[^/]*)\.(jar|apk)$",
    r"/etc/(permissions|sysconfig|default-permissions)/[^/]*(camera|miui|xiaomi)[^/]*\.xml$",
    r"/etc/permissions/privapp-permissions-[^/]*\.xml$",
    r"^/(vendor|odm)/(lib|lib64)/camera/",
    r"^/(vendor|odm)/etc/camera/",
    r"^/(system|vendor|odm)/etc/camera",
    r"^/vendor/(lib|lib64)/hw/camera\.",
    r"^/vendor/(lib|lib64)/hw/(android\.hardware\.camera|vendor\.qti\.(hardware\.)?camera|vendor\.xiaomi)",
    r"^/vendor/bin/hw/[^/]*(camera|xiaomi|mi[_.a-z]*)[^/]*$",
    r"^/vendor/etc/init/[^/]*(camera|xiaomi|mi[a-z]*)[^/]*\.rc$",
    r"^/(system|vendor|odm)/etc/vintf/",
    r"^/vendor/etc/vintf/manifest/",
    r"^/(system|vendor|odm)/(lib|lib64)/[^/]*(camera|cam[x_]|mibokeh|bokeh|arcsoft|morpho|mia[a-z]|mialgo|anc|beauty|portrait|night|hdr|sr_|mpbase|vidhance|watermark|xiaomi|miui|misys|vendor\.xiaomi|postproc)[^/]*\.so$",
    r"^/(system|vendor|odm)/(build|default)\.prop$",
    r"^/(system|vendor|odm)/etc/(public\.libraries[^/]*|ld\.config[^/]*|seccomp_policy/[^/]*camera[^/]*)$",
]
STR_LIB = re.compile(rb"(lib[A-Za-z0-9_.+\-@]+\.so|(?:vendor|com|android)\.[A-Za-z0-9_.\-@]+\.so)")
STR_PATH = re.compile(rb"/(?:system|system_ext|product|vendor|odm)/[A-Za-z0-9_./\-@]+")


ROOT = "--root" in sys.argv


def adb(cmd, binary=False):
    if ROOT:
        cmd = "su -c " + "'" + cmd.replace("'", "'\\''") + "'"
    r = subprocess.run(["adb", "shell", cmd], capture_output=True)
    return r.stdout if binary else r.stdout.decode(errors="replace")


def pull(dev, local):
    if not ROOT:
        return subprocess.run(["adb", "pull", dev, str(local)], capture_output=True).returncode == 0
    # exec-out keeps binary data intact, unlike `adb shell` which may translate line endings.
    try:
        with open(local, "wb") as fh:
            r = subprocess.run(["adb", "exec-out", f"su -c 'cat \"{dev}\"'"], stdout=fh,
                               stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, timeout=300)
    except subprocess.TimeoutExpired:
        return False
    return r.returncode == 0 and local.stat().st_size > 0


def index_device():
    script = (
        "walk(){ for e in $(ls -1p \"$1\" 2>/dev/null); do "
        "case $e in */) walk \"$1/${e%/}\";; *) echo \"$1/$e\";; esac; done; }; "
        + "; ".join(f"walk {r}" for r in ROOTS)
    )
    files = {l.strip() for l in adb(script).splitlines() if l.strip()}
    return sorted(files)


def elf_needed(data):
    if data[:4] != b"\x7fELF":
        return []
    is64 = data[4] == 2
    end = "<" if data[5] == 1 else ">"
    try:
        if is64:
            shoff, = struct.unpack_from(end + "Q", data, 0x28)
            shentsize, shnum = struct.unpack_from(end + "HH", data, 0x3A)
        else:
            shoff, = struct.unpack_from(end + "I", data, 0x20)
            shentsize, shnum = struct.unpack_from(end + "HH", data, 0x2E)
        secs = []
        for i in range(shnum):
            o = shoff + i * shentsize
            if is64:
                _, typ, _, _, off, size, link = struct.unpack_from(end + "IIQQQQI", data, o)
            else:
                _, typ, _, _, off, size, link = struct.unpack_from(end + "IIIIIII", data, o)
            secs.append((typ, off, size, link))
        out = []
        for typ, off, size, link in secs:
            if typ != 6:  # SHT_DYNAMIC
                continue
            stroff = secs[link][1]
            step = 16 if is64 else 8
            fmt = end + ("qQ" if is64 else "iI")
            for o in range(off, off + size, step):
                tag, val = struct.unpack_from(fmt, data, o)
                if tag == 0:
                    break
                if tag == 1:  # DT_NEEDED
                    s = data[stroff + val:data.index(b"\0", stroff + val)]
                    out.append(s.decode(errors="replace"))
        return out
    except (struct.error, IndexError, ValueError):
        return []


def blobs_of(path):
    data = path.read_bytes()
    yield data
    if path.suffix in (".apk", ".jar", ".zip"):
        try:
            with zipfile.ZipFile(path) as z:
                for n in z.namelist():
                    if n.endswith((".so", ".dex")) or n.startswith("assets/"):
                        yield z.read(n)
        except zipfile.BadZipFile:
            pass


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = index_device()
    (OUT / "device-files.txt").write_text("\n".join(files), encoding="utf-8")
    fileset = set(files)
    by_name = {}
    for f in files:
        by_name.setdefault(f.rsplit("/", 1)[1], []).append(f)

    wanted = {f for f in files if any(re.search(p, f) for p in SEED_PATTERNS)}
    reasons = {f: "seed" for f in wanted}
    queue, done, pulled, failed = list(wanted), set(), [], []

    while queue:
        dev = queue.pop()
        if dev in done:
            continue
        done.add(dev)
        local = OUT / "files" / dev.lstrip("/")
        local.parent.mkdir(parents=True, exist_ok=True)
        if not local.exists():
            if not pull(dev, local):
                local.unlink(missing_ok=True)
                failed.append(dev)
                continue
        pulled.append(dev)
        if dev.endswith((".xml", ".rc", ".prop", ".txt")) and local.stat().st_size > 2_000_000:
            continue
        refs = set()
        for blob in blobs_of(local):
            refs.update(elf_needed(blob))
            refs.update(m.decode(errors="replace") for m in STR_LIB.findall(blob))
            refs.update(m.decode(errors="replace").rstrip("./") for m in STR_PATH.findall(blob))
        for ref in refs:
            if ref.startswith("/"):
                # Generic directories (/vendor/lib64, /system/etc) would drag in whole partitions.
                if ref.count("/") < 3 and ref not in fileset:
                    continue
                hits = [ref] if ref in fileset else [f for f in files if f.startswith(ref.rstrip("/") + "/")][:200]
            else:
                hits = [f for f in by_name.get(ref, []) if f.rsplit("/", 1)[0] in LIB_DIRS or "/lib" in f]
            for h in hits:
                if h not in done and h not in reasons:
                    reasons[h] = f"{ref} <- {dev}"
                    queue.append(h)

    (OUT / "pulled.txt").write_text("\n".join(f"{p}\t{reasons.get(p, '')}" for p in sorted(pulled)), encoding="utf-8")
    (OUT / "failed.txt").write_text("\n".join(sorted(failed)), encoding="utf-8")
    print(f"indexed {len(files)}, pulled {len(pulled)}, failed {len(failed)}")


if __name__ == "__main__":
    main()
