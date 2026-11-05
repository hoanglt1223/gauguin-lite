# Signing and OTA

## Why self-sign

A default self-built ROM uses public test keys. Signing with your own private keys gives:

- No "Signature verification failed" prompt in recovery.
- Seamless OTA: new Lite builds install over the old one without wiping data, because the signing
  key matches.
- APKs and the system are signed by keys only you hold.

## Keys

Keys are generated on the build VM at `~/android-certs` (never committed; private). The set covers
the core certificates (releasekey, platform, shared, media, networkstack, sdk_sandbox, bluetooth,
verifiedboot) plus every APEX container key Android 17 requires, and the AVB key for verified boot.

## Building a signed ROM

After the keys exist and the unsigned build is confirmed good:

```bash
cd /srv/lineage && source build/envsetup.sh && breakfast gauguin
m target-files-package
sign_target_files_apks -o -d ~/android-certs \
    $OUT/obj/PACKAGING/target_files_intermediates/*-target_files-*.zip signed-target_files.zip
ota_from_target_files -k ~/android-certs/releasekey --block signed-target_files.zip signed-ota.zip
```

`signed-ota.zip` is what you flash and what the OTA server serves. Keep `~/android-certs` backed up
and secret: lose it and you can never ship a seamless update again; leak it and anyone can sign a
ROM your phone trusts.

## OTA server

1. Set `lineage.updater.uri` in `lite/lite-props.prop` to your JSON URL before building.
2. After each signed build: `python scripts/make-ota-json.py signed-ota.zip https://host/gauguin > gauguin.json`.
3. Host `gauguin.json` and the zip at that URL. Any static host works; the zip is ~1.6 GB so a
   plain static CDN that allows large files, or the build VM itself, is simplest.
4. On the phone: Settings > System > Updater shows the new build.
