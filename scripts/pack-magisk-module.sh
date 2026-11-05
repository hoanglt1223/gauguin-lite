#!/usr/bin/env bash
# Package a Magisk module source folder into a flashable zip, using the official Magisk
# module-installer template as update-binary (fetched once, cached next to this script).
#
# Usage: scripts/pack-magisk-module.sh <module-src-dir> [out.zip]
set -euo pipefail

src=${1:?usage: pack-magisk-module.sh <module-src-dir> [out.zip]}
out=${2:-$(basename "$src").zip}
here=$(cd "$(dirname "$0")" && pwd)
tpl="$here/.magisk-module-installer.sh"

# Official Magisk module installer (the standard update-binary for a flashable module zip).
if [ ! -s "$tpl" ]; then
    curl -sSfL -o "$tpl" \
      https://raw.githubusercontent.com/topjohnwu/Magisk/master/scripts/module_installer.sh
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/META-INF/com/google/android"
cp "$tpl" "$work/META-INF/com/google/android/update-binary"
printf '#MAGISK\n' > "$work/META-INF/com/google/android/updater-script"
cp -r "$src"/. "$work/"

out_abs=$(cd "$(dirname "$out")" && pwd)/$(basename "$out")
if command -v zip >/dev/null 2>&1; then
    ( cd "$work" && zip -qr9 "$out_abs" . )
else
    # No zip binary (e.g. Windows Git Bash): fall back to python. Magisk accepts stored or deflated.
    ( cd "$work" && python -I -c "import shutil,sys; shutil.make_archive(sys.argv[1][:-4],'zip','.')" "$out_abs" )
fi
echo "packed $out"
