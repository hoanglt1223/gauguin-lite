# Hide root and unlocked bootloader (Magisk + Shamiko)

Make apps see "no root, bootloader locked". This stack hides from everything that reads properties,
scans files, or checks Play Integrity up to the *device* level. It does NOT beat hardware-backed
(TEE) key attestation — see the hard limit at the end.

## Install order (after flashing, in Magisk)

1. **Magisk > Settings:** enable **Zygisk**. Leave *Enforce DenyList* OFF (Shamiko replaces it).
2. **Bootloader lock spoof** — flash `gauguin-lockspoof.zip` (in this folder). It resetprops the
   `ro.boot.*` values the bootloader sets on the kernel command line (which the ROM's build-time
   properties cannot override), so apps see `verifiedbootstate=green`, `flash.locked=1`,
   `device_state=locked`, `oem_unlock_allowed=0`.
3. **Shamiko** — flash `Shamiko-v1.2.5-414-release.zip` (in this folder). With *Enforce DenyList*
   turned OFF, Shamiko runs in whitelist mode and hides root mounts far more thoroughly than the
   built-in DenyList.
4. **Play Integrity Fix** — flash `PlayIntegrityFix_v4.9-inject-s.zip`. Needed for Play Integrity
   (Google Wallet, many banking apps) and for a valid device fingerprint.
5. Reboot.

## Configure the DenyList (it feeds Shamiko's hide list)

In Magisk > **Configure DenyList**, tick every banking / wallet app and expand each to tick all its
processes (Vietcombank, BIDV, Techcombank, MB, VPBank, ACB, MoMo, ZaloPay, Google Wallet, Play
Store, Play Services, etc.). Shamiko hides root from everything on this list even though enforcement
is off. Then **Hide the Magisk app** (Settings) under a random name.

## Verify

Install a Play Integrity checker. Expect **MEET** for basic + device integrity, **FAIL** for strong.
If a banking app still detects root: confirm it (and all its processes) are on the DenyList, clear
its data, reboot. A stubborn app may need its exact child processes ticked too.

## The hard limit (no way around it)

Apps using **hardware key attestation** ask the TEE to sign the *real* bootloader state with a key
fused in silicon. No module, property, or kernel can forge that on an unlocked bootloader — the same
wall as Google Wallet "strong" integrity. A few high-security banking apps use it; those will not
run here, full stop. We do NOT use leaked keyboxes (stolen keys, revoked fast). Test each app; if a
critical one uses hardware attestation, it simply won't work on an unlocked device.

## Going deeper (declined for now)

The deepest userspace-undetectable root is a **KernelSU-Next + SUSFS** kernel (kernel-level hiding).
You chose to stay on Magisk, so Shamiko is the strongest option without changing the kernel. If you
later want SUSFS-level hiding, see `docs/kernel-options.md` — it needs a kernel rebase to 24.0.
