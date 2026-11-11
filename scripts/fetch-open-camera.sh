#!/usr/bin/env bash
# Download the Open Camera APK from a GitHub release into lite/open-camera/OpenCamera.apk.
# Usage: scripts/fetch-open-camera.sh [tag] [asset-name]
#   tag         release tag (default: newest release, pre-releases included, that has an .apk)
#   asset-name  APK asset in that release (default: the first .apk asset)
# Run on the build machine from the gauguin-lite tree (or the local repo) before building.
set -euo pipefail
REPO=hoanglt1223/open-camera
TAG=${1:-}
ASSET=${2:-}
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
mv "$tmp" "$DEST"
echo "saved $DEST ($(du -h "$DEST" | cut -f1))"