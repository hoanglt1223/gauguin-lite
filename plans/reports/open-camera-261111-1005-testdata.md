# Open Camera test corpus — report (2026-11-11)

Repo: `D:\Projects\open-camera-testdata` (branch `main`, commit `deb7e38`, not pushed).

## Delivered
- `manifest.json`: 131 assets, each with id, category, tags, file, source page + direct URL, author, exact license (source metadata), sha256, size, resolution, notes.
- `tools/build_manifest.py` (curation via Commons API with Wikidata license filter + extmetadata check, NASA Images API, Met Open Access v1.1, raw.pixls.us CC0 table with its own sha256), `tools/exclude.json` (23+ items rejected on visual review: paintings, drawings, Unsplash-origin, off-topic).
- `tools/fetch.py` (download + sha256 verify; tested: `--verify-only` 0 errors, re-fetch of `moon` OK).
- `tools/gen_synthetic.py` -> `synthetic/` (48 assets, 68 MB, deterministic): color checker + WB casts, gray ramps, Monk skin tones, checkerboard, Siemens star/slanted edge, line grids (barrel/pincushion/tilt/keystone), noise ladder ISO100–12800 + clean, 8-frame burst with known sub-pixel shifts + moving object, HDR -2/0/+2 EV + float16 radiance ground truth, moon disc variants, perspective document + corners, panorama frames + ground truth.
- `tools/push_to_device.py`, `tools/gen_attribution.py`, `README.md`, `LICENSE` (MIT scripts / CC0 synthetic), `ATTRIBUTION.md`.
- Agent brief pointer added under "Thiết bị test".

## Counts (downloaded, 355 MB total)
| category | n | MB |
|---|---|---|
| portrait | 14 | 35.9 |
| group | 5 | 5.5 |
| landscape-sky | 10 | 25.7 |
| night-city | 6 | 18.1 |
| lowlight-indoor | 5 | 20.5 |
| astro | 6 | 16.4 |
| moon | 9 (3 NASA) | 11.8 |
| food | 7 | 13.0 |
| plant-macro | 7 | 8.8 |
| document | 5 | 7.8 |
| architecture | 7 | 18.0 |
| backlit-hdr | 6 | 6.7 |
| mixed-lighting | 5 | 9.6 |
| skin-closeup | 3 | 6.7 |
| inpainting | 6 | 6.8 |
| motion-sports | 6 | 14.7 |
| panorama | 3 | 3.7 |
| style-reference | 12 (4 Met) | 17.0 |
| raw-dng | 6 (Pixel 3a, Mi 8, iPhone XS, Pentax K-7, Leica M9, Ricoh GR) | 83.1 |
| video | 3 | 25.5 |

Licenses: CC0 33, PD 27, PD-NASA 3, CC BY 68 (4.0: 38, 3.0: 10, 2.5: 1, 2.0: 19). No SA/NC/ND.

## Device
gauguin `c28004a8` (after `sys.boot_completed=1`): 86 files, 166 MB in `/sdcard/Pictures/OpenCameraTest/<category>/` — 2 per image category (36), all synthetic png/jpg, 2 DNG, 1 video; MediaStore scan confirmed (entries indexed). No other device touched.

## Gaps / caveats
- skin-closeup weak: only historical medical photos (Rijksmuseum, PD) + 1 baby photo; no modern CC0 blemish close-ups found.
- Panorama: no real overlapping CC0 frame sequences; 3 real wide panoramas + synthetic sequence.
- Portrait diversity limited (several politicians/official portraits, some B&W); model releases not available — PD covers copyright only.
- Document: real whiteboard/receipt/letter are few; receipt coverage mostly synthetic.
- Commons images >3000 px are fetched as Commons thumbnails; their bytes could change if Wikimedia re-renders (fetch would report SHA MISMATCH -> rerun build_manifest).
- Wikimedia rate-limits generic User-Agents (HTTP 429); scripts use an etiquette-compliant UA and honor Retry-After.
- Met API `/v1/search` retired 2026-10-01; switched to `/v1.1/search`; Met items use `primaryImageSmall` (lower res).
- Committed `synthetic/` is 68 MB (lossless PNG noise/burst frames) — larger than "small"; can be gitignored and regenerated if needed.
