"""Back up every gauguin partition (except userdata) to the PC through Magisk su.

Streams each partition with `adb exec-out` so nothing is staged on the phone. Also saves
each UFS LUN's partition table (first 6 and last 5 blocks of 4 KiB) and SHA-256 sums.

Usage: python -I scripts/backup-partitions.py <out_dir> [--skip-super]
"""
import hashlib
import subprocess
import sys
from pathlib import Path

args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = Path(args[0] if args else "stock/partitions")
SKIP = {"userdata"} | ({"super"} if "--skip-super" in sys.argv else set())


def su(cmd):
    quoted = "'" + cmd.replace("'", "'\\''") + "'"
    r = subprocess.run(["adb", "shell", f"su -c {quoted}"], capture_output=True, text=True)
    return r.stdout


def dump(dev, dest, opts="bs=4M"):
    with open(dest, "wb") as fh:
        try:
            subprocess.run(["adb", "exec-out", f"su -c 'dd if={dev} {opts} 2>/dev/null'"],
                           stdout=fh, stdin=subprocess.DEVNULL, timeout=1800)
        except subprocess.TimeoutExpired:
            print(f"TIMEOUT {dev}", flush=True)
    return sha256(dest)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = su("for p in /dev/block/by-name/*; do d=$(readlink -f $p); echo ${p##*/} $d $(blockdev --getsize64 $d); done").split("\n")
    parts = [r.split() for r in rows if len(r.split()) == 3]
    (OUT / "partitions.txt").write_text("\n".join(" ".join(p) for p in parts), encoding="utf-8")

    sums = []
    for lun in sorted(set(su("ls /dev/block/ | grep -E '^sd[a-z]$'").split())):
        dev = f"/dev/block/{lun}"
        blocks = int(su(f"blockdev --getsize64 {dev}").strip()) // 4096
        sums.append(f"{dump(dev, OUT / f'gpt-{lun}-primary.bin', 'count=6 bs=4096')}  gpt-{lun}-primary.bin")
        sums.append(f"{dump(dev, OUT / f'gpt-{lun}-backup.bin', f'skip={blocks - 5} count=5 bs=4096')}  gpt-{lun}-backup.bin")

    for name, dev, size in parts:
        if name in SKIP:
            print(f"skip {name}")
            continue
        dest = OUT / f"{name}.img"
        complete = dest.exists() and dest.stat().st_size == int(size)
        digest = sha256(dest) if complete else dump(dev, dest)
        ok = dest.stat().st_size == int(size)
        print(f"{'ok ' if ok else 'BAD'} {name} {int(size) // 1024} KiB", flush=True)
        sums.append(f"{digest}  {name}.img")
    (OUT / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
