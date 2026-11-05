"""Generate the LineageOS Updater JSON for a built gauguin Lite zip.

The in-ROM Updater (Settings > System > Updater) fetches a JSON from the URL in the
`lineage.updater.uri` property and offers any entry newer than the running build. Point that
property at where this JSON is hosted (see lite/lite-props.prop), host the JSON and the zip,
and the phone updates itself like an official build.

Usage: python -I scripts/make-ota-json.py <build.zip> <base_url> [> gauguin.json]
  base_url: the directory URL the zip is served from, e.g. https://ota.example.com/gauguin
"""
import hashlib
import json
import re
import sys
import time
from pathlib import Path

zip_path = Path(sys.argv[1])
base_url = sys.argv[2].rstrip("/")

name = zip_path.name
# lineage-24.0-YYYYMMDD-... -> datetime from the date stamp, version from the branch number.
m = re.search(r"lineage-([0-9.]+)-(\d{8})", name)
version = m.group(1) if m else "24.0"
datestr = m.group(2) if m else time.strftime("%Y%m%d")
dt = int(time.mktime(time.strptime(datestr, "%Y%m%d")))

sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()

entry = {
    "datetime": dt,
    "filename": name,
    "id": sha,
    "romtype": "lite",
    "size": zip_path.stat().st_size,
    "url": f"{base_url}/{name}",
    "version": version,
}
print(json.dumps({"response": [entry]}, indent=2))
