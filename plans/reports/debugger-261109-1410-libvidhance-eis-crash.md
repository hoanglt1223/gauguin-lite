# libvidhance EIS crash in camera provider (video recording)

Date: 2026-11-09. Status: no safe binary patch found; workaround verified. Device restored to the original lib (md5 b9711c303245a7579fd5a87879b27192).

## Crash path

Every crash runs on a libvidhance worker thread executing a queued
`std::packaged_task` for `vidhance::ThreadedVidhanceContext::internalProcess(VidhanceInput&)`:

```
0x242fc8 thread entry -> 0x1efd70 -> 0x3740f4 (packaged_task invoke)
 -> 0x1e2734 blr [vtbl+0x28] = 0x373e04 (internalProcess lambda, vtable slot 0x70c2a8,
    typeinfo "__packaged_task_func<...ThreadedVidhanceContext15internalProcess...>")
```

Lambda 0x373e04:
```
373e18 ldr x21,[x0,#8]          ; ThreadedVidhanceContext (valid vtable)
373e28 ldr x8,[x21,#8]          ; inner context
373e38 ldr x8,[x8,#0x40]
373e48 ldr x8,[x8,#0xb0]        ; tombstone 2: 0xffffffffffffff00
373e54 add x0,x8,#0xe0          ; unordered_map<int,...>, key 0x16
373e58 bl 0x1c010c              ; operator[] -> SEGV at 0xffffffffffffffe8
...
373e98 bl 0x33cac8              ; process(inner, input)
```
Tombstone 1 goes further down the same path: 0x33cac8 -> 0x33df94 -> 0x1d3928 -> 0x1d3adc -> 0x1d32c4 `blr [x22->vtbl+0x50]`, where x22's "vtable" is a heap pointer and slot +0x50 is -1 (pc=0xffffffffffffffff).

My reproductions crash on the same first frame of the recording, each time at a different bad pointer:
- 0x1ce3f8 <- 0x1d39a0 <- 0x33df94 (fault 0x2cbe00000005823a)
- 0x32eae0 <- 0x1d32c4 <- 0x1d3adc (fault 0x9)

Conclusion: this is heap corruption or a type mismatch inside the Vidhance processing graph. It is not one unchecked init result. Logcat before the crash shows nothing failing: gyro samples arrive, FastRPC/CDSP opens, and both VidhanceContexts are created.

Leading hypothesis (not proven): an ABI mismatch with the A17-built `/vendor/lib64/libc++.so`. libvidhance links libc++.so dynamically (shared_ptr, `__assoc_sub_state`/future, locale, regex). Stock vendor shipped an older libc++. The plugin builder weak symbols (`buildStabilizerTrackerFilter` etc.) are unresolved on stock too, so they are not the cause.

## Patches tried (on device, then reverted)

| Patch | Offset | Old -> new | Result |
|---|---|---|---|
| internalProcess lambda returns immediately | 0x373e04 | ff4301d1 -> c0035fd6 | no crash, but the pipeline stalls: no Vidhance result/callback, camera gets ERROR_CAMERA_DEVICE (4), no mp4 |
| `vidhance_context_set_proxy` no-op | 0x665900 | ffc305d1 -> c0035fd6 | still crashes (0x1ce3f8 path) |
| stabilizer forced off in `vidhance_settings_set_stabilizer_mode` | 0x677048 | f4179f1a -> f4031f2a | still crashes (0x32eae0 path) |

Returning NULL from `vidhance_context_new` is not an option: the node (com.vidhance.node.eis.so @0x1e9fc) logs an error and calls `raise(5)`.

## Working workaround (verified)

`setprop vendor.vidhance.enabled 0` followed by a provider restart. MIUI Camera then records (VID_20261109_141510.mp4, 13.9 MB). The provider stays alive and the node bypasses Vidhance cleanly. This is a node-side property, so it needs no change to any blob. It has not been made persistent: adding it to the vendor/odm build props is a separate decision.

Side finding: mediaserver (32-bit) crashes in `FrameDecoder::handleOutputBufferAsync` when the camera or gallery thumbnails the mp4. This is a separate framework issue and not related to Vidhance.

## Next steps if EIS is wanted

1. Test the stock vendor libc++.so as a renamed private copy (needs a DT_NEEDED rename in libvidhance). This would confirm or rule out the libc++ ABI hypothesis.
2. Otherwise ship `vendor.vidhance.enabled=0`.
