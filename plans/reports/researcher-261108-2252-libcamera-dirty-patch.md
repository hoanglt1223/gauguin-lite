# libcamera_dirty.so SIGSEGV patch — gauguin MIUI Camera port

Date: 2026-11-08 (part 1), 2026-11-08 late (part 2, after on-device confirmation of part 1)

## Part 2 (v2): app-side SIGSEGV in libcamera_algoup_jni.xiaomi.so

Part 1 (provider crash) is deployed and confirmed working. The MIUI Camera **app process** still SIGSEGVs (tombstone_12 / earlier 05/08; identical signature, crash pid 31164, thread `ParallelDataZip`): fault addr `0xa9bc7bfdd503233b`, `String16::size()` ← `BnInterface<IProducerListener>::queryLocalInterface` (algoup+0x6354) ← `BufferQueueProducer::connect+1048` ← `Surface::connect+372` ← `getANativeWindow` (algoup+0x6274) ← `Java_..._MiCamAlgoInterfaceJNI_createSessionByOutputConfigurations` (algoup+0x88b8).

Target: `D:\Projects\gauguin\miui-ports\MiuiCamera\lib\arm64\libcamera_algoup_jni.xiaomi.so` (51,552 bytes, BuildID `791c79f6006b08800505ee5184eba706`, matches tombstones). Both copies (miui-ports and miui-dump) are byte-identical, SHA-256 `d8a3b6b93a83a82e2be5fb5f4f864ce64a7a213a49b7ba52f607d6ba82bfdcaa`. The lib ships with this port at `/system/lib64/libcamera_algoup_jni.xiaomi.so` — it is ours, patching is clean.

### Root cause (verified from disassembly, ABI mismatch as diagnosed)

`getANativeWindow` (0x6020) builds an A12-era `SurfaceListener` (BnInterface<IProducerListener>-derived; its vtable and code live in this old lib — e.g. `BnInterface<IProducerListener>::queryLocalInterface` at 0x632c) and hands it to `Surface::connect` (virtual call via `[x21]→[x8+0x150]`, api=2 CPU). On LineageOS 24 (A17) libgui, `BufferQueueProducer::connect` calls `IInterface::asBinder(listener)` → virtual `queryLocalInterface(descriptor)` → runs the **A12-compiled** queryLocalInterface against the **A17 String16 layout** (String16 was rewritten around A13). The old code does `ldr x21,[x1]; mov x0,x1; bl String16::size@plt` — A17's `String16::size()` then dereferences a bogus pointer (`0xa9bc7bfdd503233b` is literally two concatenated ARM64 instruction encodings: `a9bc7bfd` STP + `d503233f` PACIBSP) → SEGV → the whole app dies.

### Fix: pass a NULL listener (null-sp strategy)

Verified against LineageOS 24.0 libgui source (fetched `frameworks/native` `lineage-24.0` branch — the exact device version):

- `Surface::connect(int, const sp<SurfaceListener>&, ...)`: `if (listener != nullptr) { mListenerProxy = ... }` then `mGraphicBufferProducer->connect(mListenerProxy, ...)` — null listener forwards a null producer listener; `listener &&` also guards the death-notify path.
- `BufferQueueProducer::connect(sp<IProducerListener>, ...)`: the entire `if (listener != nullptr) { IInterface::asBinder(listener)->... }` block — i.e. the exact `queryLocalInterface` crash path — is skipped for null. A null listener is a normal framework state (producers connect without listeners by default).

The listener is an `sp<SurfaceListener>` living at `[sp]`; the callee takes it **by reference** (`mov x2, sp`), so the correct minimal patch nulls the sp's value and removes its refcount pair (the post-call release at 0x6278–0x6294 already has its own null-guard `cbz x8, 0x6294`):

| Offset | Old bytes | Old instruction | New bytes | New instruction |
|--------|-----------|-----------------|-----------|-----------------|
| `0x6230` | `f6 03 00 f9` | `str x22, [sp]` | `ff 03 00 f9` | `str xzr, [sp]` (null sp) |
| `0x6234` | `56 01 00 b4` | `cbz x22, 0x625c` | `0a 00 00 14` | `b 0x625c` (always skip the sp's incStrong) |

Refcount accounting: the removed `incStrong` (0x6258) and the now-skipped `decStrong` (0x6290) are the retain/release pair of this one temporary sp — removed together, balanced. The other temporary (`[sp+8]`) keeps its original incStrong (0x6228)/decStrong (0x62cc) pair, untouched. The old-layout object is no longer touched by this path at all.

### Verification

1. Keystone-assembled encodings match the patched bytes exactly (`str xzr,[sp]` = `ff0300f9`; `b +0x28` = `0a000014`); original bytes re-assembled from source mnemonics match the file (`f60300f9`, `560100b4`).
2. Byte diff: only offsets 0x6230/0x6234/0x6235/0x6237 differ (8 bytes replaced at the two 4-byte sites, 4 net changed); file size unchanged (51,552).
3. `readelf -h/-S/-l/-d/--dyn-syms/-n` outputs identical original-vs-patched; BuildID untouched.
4. Relocation audit: 94 relocs, identical between versions, none target the patch sites; imports unchanged.
5. Differential Unicorn emulation of 0x622c→0x62a4 with PLT/indirect targets intercepted:
   - **Patched**: `connect(listener=0x0)`, `x2==&sp`, `api(w1)=2`, `this=Surface*`, **no** incStrong/decStrong for the temporary, execution continues cleanly to the next call site.
   - **Original (control)**: `incStrong → connect(listener=0x60000100) → decStrong` — the ABI-toxic listener is passed, refcount ops balanced (confirms the emulated scenario reproduces the original semantics).
6. Patcher revert round-trip reproduces the pristine SHA-256.

### Expected behavioral change and risks

- `createSessionByOutputConfigurations` (MIUI parallel/algo session path) no longer crashes the app; Surface::connect succeeds with no listener.
- Lost: IProducerListener callbacks for this surface (buffer-release/acquire notifications, release fences). Framework handles absent listeners natively; worst case is degraded async notification for the algo pipeline (on-device test will show whether MIUI's algo path misses the callbacks — iterate from there).
- **Latent same-class bug**: `libcamera_mianode_jni.xiaomi.so` contains a byte-identical `str x22,[sp]` / `cbz x22,+0x28` / `Surface::connect` sequence at **0xf15c/0xf160** (call at 0xf1a0). Not patched (no crash evidence yet); if a similar tombstone appears with frames in mianode, the same two-byte-site patch applies verbatim at those offsets. `libcamera_jpegutil_jni.xiaomi.so` has no such site.
- Fallback if the null listener misbehaves on-device: stub `Java_com_xiaomi_engine_MiCamAlgoInterfaceJNI_createSessionByOutputConfigurations` (entry ~0x8850; +788 return site at 0x88b8) to return 0/null immediately — not applied, since the preferred fix verified.

### Deploy (controller) — /system, not /vendor

```bash
adb root; adb remount
adb shell cp /system/lib64/libcamera_algoup_jni.xiaomi.so /data/local/tmp/libcamera_algoup_jni.xiaomi.so.orig
adb push miui-ports/hal-patch/libcamera_algoup_jni_patched.so /system/lib64/libcamera_algoup_jni.xiaomi.so
adb shell chmod 644 /system/lib64/libcamera_algoup_jni.xiaomi.so
adb shell restorecon /system/lib64/libcamera_algoup_jni.xiaomi.so
adb shell am force-stop com.android.camera   # app respawns on next launch
```

Test: launch MIUI Camera, open Photo mode preview (the ParallelDataZip crash trigger), let it settle 1–2 min; `adb logcat -b crash` must show no app tombstone; capture a photo; then sanity-check Aperture/GCam.

Rollback: push `/data/local/tmp/libcamera_algoup_jni.xiaomi.so.orig` (or regenerate from `miui-ports/MiuiCamera/lib/arm64/`) back, chmod/restorecon, force-stop the camera app.

### v2 artifacts

- `miui-ports/hal-patch/libcamera_algoup_jni_patched.so` — patched (SHA-256 `3dda8c37bc34ab57b6b56067c7ab142c83dc31c0372153e8fe25cbb0e9cca384`)
- `miui-ports/hal-patch/patch_libcamera_algoup.py` — apply/verify/revert patcher (offsets + old/new documented)
- Pristine source kept at `miui-ports/MiuiCamera/lib/arm64/libcamera_algoup_jni.xiaomi.so` (untouched)

---

## Part 1 (v1): provider SIGSEGV in libcamera_dirty.so

Scope: `/vendor/lib64/libcamera_dirty.so` (ARM64 ELF, 1,509,128 bytes, BuildID `d45c8f7ae89344ccd3362a9e298dcd0b261556af`, stripped, dynamic symbols intact). **Status: deployed on device, provider crash resolved.**

## Status (part 1)

- Patch: applied, verified, **deployed on device — provider crash resolved** — `miui-ports/hal-patch/libcamera_dirty_patched.so`
- Patcher (reversible, documents offsets): `miui-ports/hal-patch/patch_libcamera_dirty.py`
- Original blob confirmed pristine: SHA-256 `e9bbad41ca6f8a27ea4b01f9c53e849e8ad323e6c718506cf38e673e04b01959`, byte-identical to the copy in `miui-dump/miuicamera/files/vendor/lib64/`.
- Correction to the original task premise: tombstone_05/08/12 are **not** in libcamera_dirty.so — they are app-process crashes in `/system/lib64/libcamera_algoup_jni.xiaomi.so` (the ported MIUI app-side algo lib), an A12-vs-A17 binder/String16 ABI mismatch, **fixed in Part 2 above**. Only **tombstone_06** was the provider-killing crash in libcamera_dirty.so, patched in this part.

## The bug (tombstone_06)

Process: `/vendor/bin/hw/android.hardware.camera.provider@2.4-service_64`, uid 1047, thread `Preview_6`.
SIGSEGV SEGV_ACCERR (read), fault addr `0x783fbff000` — page-aligned end of a scudo secondary allocation ("possible buffer overflow accessing after secondary allocation").

Backtrace (file-relative PCs):

```
#00 0x27194  ld1 {v14.4s, v15.4s}, [x13]      <- NEON GEMM inner kernel, reads 32B at x13
#01 0x1e544  blr x8                            <- op dispatch (virtual run())
#02 0x1365c  pipeline step (virtual call)
#03..#26      0x1312c / 0x12dc0 alternating    <- NN graph/pipeline executor (shared_ptr refcount + virtual calls, not a data-structure walk)
#27 0x14024  executor
#28 0x78a8   MiAiCamera::DirtyCamera::Forward+144   (return of `bl 0x13f3c` = session run)
#29 0x77f0   MiAiCamera::DirtyCamera::GetResult+36  (return of `bl` Forward-PLT)
#30 0x7654   worker thread func (return of `bl` GetResult-PLT)
#31/32       __pthread_start / __start_thread
```

### What the library is

`libcamera_dirty.so` = Xiaomi **dirty-lens detection** (MiAiCamera). Exports (dynsym): `DirtyCameraInterface::Init/Release/PredictMiImageBuffer/GetVersion`, `DirtyCamera::Forward/GetResult/MeanStd`, YUV helpers, and an embedded NN runtime + model weights in `.rodata` (~0x73d50+, the float blobs seen in register dumps).

### Decompiled call chain (Ghidra)

```c
// HAL-facing entry; runs only for apps that enable Xiaomi dirty-lens detection
PredictMiImageBuffer(this, img, motion, fps, /*flags*/) {
    ...
    if (image_index <= max_images + 1) {
        // stash last result into out param, compute label from dirty-counter
        yuv420sp2bgr_resize_neon(..., ctx->bgr_buf /*96x96*/, 0x60, 0x60, ...);
        pthread_create(&t, NULL, worker /*0x75cc*/, ctx);   // detached per-frame thread
    }
}

worker(ctx /*0x75cc*/) {                 // tombstone #30
    if (!ctx || !ctx->mutex) return 0;
    if (pthread_mutex_trylock(ctx->mutex)) { pthread_detach(self); return 0; }
    pthread_detach(self);
    if (!skip && ctx->bgr_buf) {
        if (!ctx->dirty) ctx->dirty = new DirtyCamera();
        ctx->dirty->GetResult(ctx->bgr_buf, 96, 96, &ctx->result);   // tombstone #29
        // threshold prob/mean/std from config; increment dirty-counter if all exceed
    }
    __android_log_print(... "DirtyCameraDetect, image_index:%d, image_mean:%.2f, image_std:%.2f, ... dirty_prob:%.3f, label:%d");
    pthread_mutex_unlock(ctx->mutex);
}

DirtyCamera::GetResult(buf, w, h, result) {   // 0x77cc, 76 bytes
    Forward(this, buf, w, h, &result->prob);  // <- crash originates under here
    MeanStd(this, buf, w, h, &result->mean, &result->std);   // pure math, in-bounds
}

DirtyCamera::Forward(buf, w, h, &prob) {      // 0x7818 — THE CRASH PATH
    tensor = create_tensor(buf, 2, w, h, 0);            // bl 0xc174   @0x7854
    set_config(tensor, 0, &model);                      // bl 0xa4e0   @0x7868
    session = session_create(this, ...);                // bl 0x12ab8  @0x7888
    session_set_input(session, 0, tensor);              // bl 0x13db8  @0x7898
    session_run(session, 0x21, &out);                   // bl 0x13f3c  @0x78a4  <- crash inside
    if (1 < out.c*out.h*out.w) prob = out.data[1];      // read output tensor
    ... release tensors/session (shared_ptr refcounts)
}
```

### Root cause

The embedded NN runtime's NEON GEMM kernel (loop body `0x270a4–0x271b8`, two `ld1 {vN.4s,vN+1.4s}` pairs walking the B-matrix via `x13`, 16 bytes/iteration, `w17` iterations) **over-reads up to 32 bytes past the end of a heap tensor**: the final iteration loads a full 32-byte vector even though the row tail is shorter, so up to 8 floats are read out of bounds. Normally the over-read lands inside allocator slack and goes unnoticed; under the MIUI camera's heap layout the scudo **secondary** allocation backing that tensor ends exactly at a guard page (`0x783fbff000`), so the last `ld1` faults and kills the provider. The executor frames (`0x12dc0/0x1312c`) are not a corrupted structure walk — they are the normal NN pipeline executor (shared_ptr `ldaxr/stlxr` refcounting + virtual `run()` calls) observed mid-execution.

Why only MIUI cam: `PredictMiImageBuffer` (and hence `Forward`) is only invoked when an app enables Xiaomi's dirty-lens vendor processing — stock Aperture, GCam and Leica ports never enter it, so they were never at risk from this path (and the patch does not change anything they execute).

## Strategy decision

**(a) Guard the faulting traversal — infeasible.** The faulting instruction is a vector load whose trip count (`w17`) derives from the model's tensor shape; the buffer's end pointer is not available in any register at the fault site, and there is no discrete "index vs bound" compare to tighten. Any injected bound would either still over-read or truncate every matrix multiply (silent wrong inference). The over-read is inherent to the kernel's vectorized tail handling, not a missing check.

**(b) Chosen — make the MIUI-specific mode a clean no-op.** `Forward` is the **sole** caller of the NN runtime (`session create/set/run` BL sites: 0x7888/0x7898/0x78a4 — verified by full .text BL scan, no other callers). Replacing Forward's first instruction with `RET` makes the entire inference (tensor + session + GEMM) never execute, with the fallback verified from call sites:

- `GetResult` ignores Forward's outcome (void call), then still runs `MeanStd` (in-bounds math over the 96x96 BGR buffer).
- The worker still does threshold comparison, logging, `pthread_mutex_unlock`, and exits normally — no deadlock, no skipped cleanup.
- `DirtyCameraInterface::Init` zeroes the whole result struct (ctx+0x24..0x30), so `prob` deterministically stays `0.0` → the threshold check takes the "clean" branch → dirty-counter never increments → `label` stays clean. No uninitialized reads.
- The HAL path is fire-and-forget (per-frame detached thread); `PredictMiImageBuffer` returns void; preview continues untouched.

**(c) not needed** — (b) is narrower than stubbing the exported API and keeps mean/std logging intact.

## The patch

Single instruction, in-place, file offset == virtual address (.text is identity-mapped):

| Offset | Old bytes | Old instruction | New bytes | New instruction |
|--------|-----------|-----------------|-----------|-----------------|
| `0x7818` | `ff c3 03 d1` | `sub sp, sp, #0xf0` (Forward prologue) | `c0 03 5f d6` | `ret` |

- Exactly 4 bytes changed; file size unchanged (1,509,128); all other bytes identical.
- Returning at the first instruction is ABI-safe: LR is the caller's `bl` return address (the Forward PLT stub uses `br x17`, which preserves LR), no frame was allocated, no callee-saved registers or stack canary are involved, and Forward has no return value.
- No PAC/BTI complications: the prologue has no `pacibsp`, the ELF has no `.note.gnu.property` (not built with BTI), and a plain `ret` is unaffected by either.

## Verification (all performed on the build VM)

1. **Byte diff**: `cmp -l` original vs patched → exactly 4 differing bytes at 30745–30748 (1-based) = 0x7818–0x781b. Sizes equal.
2. **ELF structure**: `readelf -h/-S/-l/-d/--dyn-syms` — section headers, program headers, dynamic section, all 102 dynsym lines and BuildID identical between original and patched. ELF parses clean.
3. **Linker-equivalent relocation audit** (Python, parsed `.rela.dyn`+`.rela.plt`): 881 relocs, none writes into the patch site; all `R_AARCH64_RELATIVE` addends land inside PT_LOADs; import symbol references identical (73) between original and patched. The one GOT slot referencing `&Forward` (0x17fdc0, PLT canonicalization) still resolves to 0x7818, which now contains `ret` — PLT dispatch is unaffected.
4. **Behavioral emulation** (Unicorn, PT_LOADs mapped identically): starting at patched `0x7818` with caller LR magic, x0–x4 set as in `GetResult`'s call — execution returns to LR immediately, SP unchanged, zero memory writes, output float untouched. PASS.
5. **Round-trip**: `patch_libcamera_dirty.py revert` on the patched file reproduces the pristine SHA-256.
6. `ld.so`-style load test was not possible on the x86_64 VM (no arm64 bionic linker/libc available on it); given the zero structural delta (points 1–3), loadability is unchanged by construction.

## Expected behavioral change

- **Provider crash (tombstone_06 pattern) is eliminated**: the overflowing GEMM never runs.
- Xiaomi dirty-lens detection always reports "clean": MIUI Camera's "lens is dirty / wipe your lens" hint will never trigger. mean/std are still computed and logged (`adb logcat -s DirtyCamera` shows `DirtyCameraDetect ... dirty_prob:0.000, label:0` instead of real inference). This is the only feature regression.
- Stock Aperture / GCam / Leica paths execute byte-identical code (their apps never call `PredictMiImageBuffer`; even if they did, they'd now get a clean verdict instead of running the overflowing kernel).
- Slightly less CPU per frame: no NN session create/run per analyzed frame.

## Risks

- Feature loss as above (advisory hint only; no capture pipeline dependency — the HAL call is fire-and-forget on a detached thread).
- If MIUI's configured prob threshold were `<= 0` the worker's verdict math could in principle label via mean/std alone — cosmetic (wrong "dirty" hint), not a crash; MIUI ships positive probability thresholds.
- BuildID is intentionally unchanged (minimal in-place patch), so any future tombstone from this lib still shows `d45c8f7a...`; distinguish patched-vs-original by SHA-256 (`cb4d11cd...` patched vs `e9bbad41...` pristine).
- The MIUI app's own SIGSEGVs (tombstone_05/08/12) in `libcamera_algoup_jni.xiaomi.so` are a separate bug — **now fixed by the Part 2 (v2) patch above**.

## Deploy (controller)

```bash
# artifacts on PC: miui-ports/hal-patch/libcamera_dirty_patched.so
adb root
adb remount                          # eng build
adb shell cp /vendor/lib64/libcamera_dirty.so /data/local/tmp/libcamera_dirty.so.orig   # backup
adb push miui-ports/hal-patch/libcamera_dirty_patched.so /vendor/lib64/libcamera_dirty.so
adb shell chmod 644 /vendor/lib64/libcamera_dirty.so
adb shell restorecon /vendor/lib64/libcamera_dirty.so
adb shell kill $(pidof android.hardware.camera.provider@2.4-service_64)   # init respawns it (or reboot)
adb shell pidof android.hardware.camera.provider@2.4-service_64           # confirm respawn
```

Test: open MIUI Camera preview (the previous crash trigger), run 1–2 minutes; `adb logcat -b crash` must show no new provider tombstone; `pidof` provider stays stable; `adb logcat -s DirtyCamera` shows the `DirtyCameraDetect ... dirty_prob:0.000` lines. Then sanity-check Aperture and one GCam/Leica port (should behave exactly as before).

## Rollback

```bash
adb root; adb remount
adb push /data/local/tmp/libcamera_dirty.so.orig /vendor/lib64/libcamera_dirty.so   # or the pristine blob from miui-dump
adb shell chmod 644 /vendor/lib64/libcamera_dirty.so
adb shell restorecon /vendor/lib64/libcamera_dirty.so
adb shell kill $(pidof android.hardware.camera.provider@2.4-service_64)   # or reboot
```

Alternatively `python3 patch_libcamera_dirty.py revert libcamera_dirty_patched.so restored.so` regenerates the pristine blob from any patched copy.

## Artifacts

- `miui-ports/hal-patch/libcamera_dirty_patched.so` — patched blob (SHA-256 `cb4d11cddcf23556950bb30a206d7f657b6b2b2a62f68fc8a5cba017a5e5e0bc`)
- `miui-ports/hal-patch/patch_libcamera_dirty.py` — apply/verify/revert patcher, documents offset+old+new
- `miui-ports/hal-patch/libcamera_dirty.so` — pristine original (untouched)
- Analysis tooling used on the VM: radare2, Ghidra 11.3.2 headless, Unicorn, capstone, readelf/cmp
