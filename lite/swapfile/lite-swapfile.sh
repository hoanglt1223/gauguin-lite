#!/system/bin/sh
# Create and enable a 3 GB swapfile on /data, at a lower priority than zram so zram is used first.
# Runs once at boot via lite-swapfile.rc. On f2fs the swapfile must be pinned before swapon.
set -e

SWAP=/data/lite-swapfile
SIZE_MB=3072

if [ -f "$SWAP" ] && grep -q "$SWAP" /proc/swaps; then
    exit 0
fi

if [ ! -f "$SWAP" ]; then
    dd if=/dev/zero of="$SWAP" bs=1m count="$SIZE_MB"
    chmod 600 "$SWAP"
    # f2fs requires the swapfile to be pinned (contiguous) or swapon fails with EINVAL.
    if [ "$(stat -f -c %T /data)" = "f2fs" ]; then
        /system/bin/f2fs_io pin_file "$SWAP" || true
    fi
    mkswap "$SWAP"
fi

# Lower priority than zram (zram0 is added with the default higher priority), so zram fills first.
swapon -p 0 "$SWAP"
