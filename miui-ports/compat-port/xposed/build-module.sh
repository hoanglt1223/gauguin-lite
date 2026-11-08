#!/bin/bash
# Builds and testkey-signs the MIUI Camera API compat LSPosed module on the build VM.
# Expects the module source tree copied to $SRC (default /tmp/camcompat).
set -euo pipefail

SDK=/srv/lineage/prebuilts/sdk
TOOLS=$SDK/tools/linux/bin
JDK=/srv/lineage/prebuilts/jdk/jdk21/linux-x86/bin
ANDROID=$SDK/34/public/android.jar
D8JAR=$SDK/tools/lib/d8.jar
APKSIGNER=$SDK/tools/linux/lib/apksigner.jar
SEC=/srv/lineage/build/make/target/product/security
export PATH="$JDK:$TOOLS:$PATH"

SRC="${1:-/tmp/camcompat}"
OUT="${2:-/tmp/camcompat-build}"
rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex"

echo "== 1. javac (module + compile-only xposed stubs) =="
find "$SRC/src" "$SRC/xposed-api" -name '*.java' > "$OUT/sources.txt"
"$JDK/javac" --release 8 -g:none -cp "$ANDROID" -d "$OUT/classes" @"$OUT/sources.txt"

echo "== 2. d8 (dex ONLY module classes, stubs excluded) =="
MODCLASSES=$(cd "$OUT/classes" && find com/gauguin -name '*.class' | sort)
( cd "$OUT/classes" && "$JDK/java" -cp "$D8JAR" com.android.tools.r8.D8 \
    --min-sdk-version 29 --lib "$ANDROID" \
    --output "$OUT/dex" $MODCLASSES )

echo "== 3. aapt2 link (manifest + scope resource + xposed_init asset) =="
"$TOOLS/aapt2" compile --dir "$SRC/res" -o "$OUT/res.zip"
"$TOOLS/aapt2" link -o "$OUT/base.apk" -I "$ANDROID" \
    --manifest "$SRC/AndroidManifest.xml" \
    -A "$SRC/assets" \
    --min-sdk-version 29 --target-sdk-version 34 \
    "$OUT/res.zip"

echo "== 4. add classes.dex =="
( cd "$OUT/dex" && "$TOOLS/aapt" add "$OUT/base.apk" classes.dex )

echo "== 5. zipalign + apksigner (AOSP testkey) =="
"$TOOLS/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$JDK/java" -jar "$APKSIGNER" sign --key "$SEC/testkey.pk8" --cert "$SEC/testkey.x509.pem" \
    --out "$OUT/MiuiCameraApiCompat.apk" "$OUT/aligned.apk"

echo "== result =="
"$JDK/java" -jar "$APKSIGNER" verify --print-certs "$OUT/MiuiCameraApiCompat.apk" | head -n 3
ls -l "$OUT/MiuiCameraApiCompat.apk"
