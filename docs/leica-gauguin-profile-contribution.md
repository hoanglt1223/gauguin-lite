# Leica Moment port: device profile for Xiaomi gauguin

Contribution note for the porter of the Leica Moment (`com.kobbin.leica.wmrebuild`) MIUI camera port.
It adds one entry to `assets/device-profiles.json` for the Mi 10T Lite 5G / Redmi Note 9 Pro 5G / Mi 10i
family (SM7225, codename `gauguin`). Tested on a Mi 10T Lite 5G (M2007J17G) running LineageOS 24 (Android 17).

## Profile entry

Append to the `profiles` array:

```json
{
  "id": "xiaomi/xiaomi-mi-10t-lite-gauguin",
  "brand": "xiaomi",
  "name": "Mi 10T Lite 5G / Redmi Note 9 Pro 5G (gauguin)",
  "year": 2020,
  "source": "local measurement on gauguin (dumpsys media.camera)",
  "sources": [],
  "codes": ["gauguin", "gauguinpro", "M2007J17G", "M2007J17C", "M2007J17I"],
  "lenses": [
    {"role": "ultra", "mm": 0, "ratio": 0, "ratio_origin": "runtime_metadata_required", "focal_status": "runtime_metadata_required"},
    {"role": "main", "mm": 0, "ratio": 1, "ratio_origin": "derived", "focal_status": "runtime_metadata_required"},
    {"role": "tele", "mm": 0, "ratio": 2, "ratio_origin": "digital_crop_of_main", "focal_status": "no_optical_tele"}
  ],
  "note": "Ultrawide 8MP is exposed twice (id 3 and 6); 2MP macro and depth are auxiliaries. 2x is a crop of the 64MP main.",
  "audit_date": "2026-11-09",
  "aliases": ["Mi 10T Lite", "Redmi Note 9 Pro 5G", "Mi 10i"],
  "auxiliary_lenses": [{"role": "macro"}, {"role": "depth"}],
  "binding_policy": "runtime_sensor_and_session_validation",
  "ambiguous_codes": []
}
```

## Lens mapping

Camera2 ids as the gauguin HAL exposes them (`dumpsys media.camera`, static info):

| id | Facing | Sensor (active array) | Focal length | ~35 mm eq. | Role in the profile |
|---|---|---|---|---|---|
| 0 | back | 4624x3472 (64 MP binned), 7.40x5.56 mm | 5.43 mm | ~25 mm | `main`, ratio 1; also carries the 2x stop as a digital crop |
| 3 | back | 3264x2448 (8 MP), 3.66x2.74 mm | 1.65 mm | ~16 mm | `ultra` (ratio ~0.6, filled from runtime metadata) |
| 6 | back | same sensor as id 3 | 1.65 mm | ~16 mm | duplicate of the ultrawide; the router only needs one of 3/6 |
| 2 | back | 1600x1200 (2 MP), 2.80x2.10 mm | 1.93 mm | - | macro, listed in `auxiliary_lenses` so it never becomes a zoom stop |
| 4 | back | 1600x1200 (2 MP) | 1.93 mm | - | depth, listed in `auxiliary_lenses` |
| 1 | front | 2328x1748 (16 MP binned) | 3.26 mm | - | front camera, not part of the rear plan |

Ids 5 and 7 mirror 0 and 1 and are not needed. The 2x chip has no optical lens behind it; with stock
`ProfileRouter.logicalPaths()` that stop is dropped because id 0 is neither a logical camera nor
a camera whose zoom range starts below 1x. Our build lets the main camera carry a stop without a
physical lens (small smali change in `logicalPaths()`), which turns 2x into a crop of id 0. Without
that change the profile still works, the chips are just 0.6 / 1x.

Verified captures: 1x `3472x4624` (id 0), 0.6x `2448x3264` (id 3), 2x `3472x4624` (crop of id 0).

## Detection codes

`Profiles.detected()` matches `Build.MODEL` or `Build.DEVICE` against `codes` after the brand check
(`xiaomi`/`redmi`). On the test phone `ro.product.model = M2007J17G` and `ro.product.device = gauguin`.

| Code | Variant | Checked |
|---|---|---|
| `gauguin` | device codename (global Mi 10T Lite 5G, LineageOS) | yes, on device |
| `M2007J17G` | Mi 10T Lite 5G, global | yes, on device |
| `M2007J17C` | Redmi Note 9 Pro 5G, China | model number only |
| `M2007J17I` | Mi 10i, India | model number only |
| `gauguinpro` | codename used by the China / India builds | not checked on a device |

`Profiles.detected()` exists in the port but nothing calls it, so an empty saved selection does
not auto-select a profile. Our build calls it from `Profiles.init()` when the `selected` preference is
empty; the "Auto detect" button then also resolves to this entry.
