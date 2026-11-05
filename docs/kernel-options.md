# Custom kernel options for gauguin

The default LineageOS kernel ([LineageOS/android_kernel_xiaomi_gauguin](https://github.com/LineageOS/android_kernel_xiaomi_gauguin),
Linux 4.19, non-GKI) is what Lite builds now. These are the maintained alternatives if you want
more. gauguin is an old 4.19 non-GKI SoC, so options are limited and mostly add root/hiding, not
big performance gains.

| Kernel | Root / feature | Base | Notes |
|---|---|---|---|
| **[KumarDev7/...-ksunext](https://github.com/KumarDev7/android_kernel_xiaomi_gauguin-ksunext)** | KernelSU-Next v1.1.1 + SUSFS 1.5.5 | lineage-23.2 | Root in-kernel plus SUSFS (strongest root hiding for banking apps). Auto-built in CI. Base is 23.2, not 24.0 — may need rebasing. |
| **[yao140514/gauguin-sukisu-kernel](https://github.com/yao140514/gauguin-sukisu-kernel)** | SukiSU-Ultra + SUSFS | LineageOS 23.2 | Same idea, SukiSU flavour. Also 23.2 base. |
| **[manu-romero-411/...battery-kernel-patch](https://github.com/manu-romero-411/lineageos-gauguin-battery-kernel-patch)** | Third-party battery fix | **lineage-24.0** | Matches our base. Fixes stuck battery % with non-OEM batteries. Tested booting on LOS 24.0 + Magisk. No root built in. |
| **[pocarropa/gauguin-kernel-builder-LOS](https://github.com/pocarropa/gauguin-kernel-builder-LOS)** | Battery fix | lineage-23.2 | The upstream of the battery patch. |
| Stock LineageOS kernel | none | lineage-24.0 | What Lite uses. Rock solid, no extras. |

## Recommendation

- **If you only want root hidden from banking apps:** you do NOT need a custom kernel. Magisk +
  Shamiko (see `post-flash/hide-root-banking.md`) covers almost everything. A KernelSU+SUSFS kernel
  hides root even more deeply, but it is a 23.2 base that needs rebasing onto 24.0 — real work and
  real risk of a non-booting kernel.
- **If you have a non-original battery** and see a stuck percentage: the manu-romero-411 patch is
  the one, and it is already on a 24.0 base.
- **Otherwise:** keep the stock kernel. On this old SoC a custom kernel buys little performance and
  adds maintenance each time we update.

Which to wire in is a decision for after the base Lite build boots. Tell me the one you want and
I'll build it against our tree (rebasing to 24.0 where needed).
