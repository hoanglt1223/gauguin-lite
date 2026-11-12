#!/usr/bin/env bash
# Download the Open Camera APK from a GitHub release into lite/open-camera/OpenCamera.apk.
# Usage: scripts/fetch-open-camera.sh [tag] [asset-name]
#   tag         release tag (default: the pinned signed release below; "latest" = newest release
#               with an .apk, pre-releases included)
#   asset-name  APK asset in that release (default: the pinned asset, else the first .apk asset)
# The pinned release is checked against its SHA-256; the ROM's sysconfig and the SystemUI camera
# gesture overlay expect the release package dev.opencamera.app.
# Run on the build machine from the gauguin-lite tree (or the local repo) before building.
set -euo pipefail
REPO=hoanglt1223/open-camera
PINNED_TAG=v0.1.0-beta1
PINNED_ASSET=open-camera-0.1.0-beta1.apk
PINNED_SHA256=c9622d2d9ddca3be676add9f535a8105a80b8c5356db87bb6d5f6755f33d24a0
TAG=${1:-$PINNED_TAG}
[ "$TAG" = latest ] && TAG=
ASSET=${2:-}
[ "$TAG" = "$PINNED_TAG" ] && [ -z "$ASSET" ] && ASSET=$PINNED_ASSET
DEST="$(cd "$(dirname "$0")/.." && pwd)/lite/open-camera/OpenCamera.apk"

if [ -n "$TAG" ]; then
    api="https://api.github.com/repos/$REPO/releases/tags/$TAG"
else
    api="https://api.github.com/repos/$REPO/releases?per_page=20"
fi

url=$(curl -fsSL "$api" | python3 -c '
import json, sys
data = json.load(sys.stdin)
want = sys.argv[1]
for rel in data if isinstance(data, list) else [data]:
    for a in rel.get("assets", []):
        if a["name"].endswith(".apk") and (not want or a["name"] == want):
            print(rel["tag_name"], a["browser_download_url"], file=sys.stderr)
            print(a["browser_download_url"])
            sys.exit(0)
sys.exit("no matching .apk asset found")
' "$ASSET")

tmp="$DEST.part"
curl -fsSL --retry 3 -o "$tmp" "$url"
python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).getinfo("AndroidManifest.xml")' "$tmp"
if [ "$TAG" = "$PINNED_TAG" ] && [ "$ASSET" = "$PINNED_ASSET" ]; then
    echo "$PINNED_SHA256  $tmp" | sha256sum -c --quiet - || { rm -f "$tmp"; echo "checksum mismatch" >&2; exit 1; }
fi
mv "$tmp" "$DEST"
echo "saved $DEST ($(du -h "$DEST" | cut -f1))"