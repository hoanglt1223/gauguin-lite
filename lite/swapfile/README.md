# Lite swapfile (3 GB) — staged, not yet enabled

zram is raised to 75% by `scripts/apply-lite-patches.sh` (safe, applied at every build).

This 3 GB `/data` swapfile is **not wired into the build yet**. It needs two things that
can only be confirmed on the device:

1. **SELinux policy.** The init service needs its own domain allowed to create the file,
   pin it, run `mkswap`/`swapon`. The `seclabel` in `lite-swapfile.rc` is a placeholder.
2. **f2fs pinning.** `/data` is f2fs; `swapon` fails with `EINVAL` unless the file is pinned
   with `f2fs_io pin_file`. This must be verified on a booted device.

Enable it only after the base build boots and these are validated on-device, then add the
`.rc`/`.sh` as a package and inherit it from `lite.mk`. Until then zram 75% alone is active.
