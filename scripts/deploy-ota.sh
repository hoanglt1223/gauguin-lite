#!/usr/bin/env bash
# Push a built (preferably signed) gauguin zip to a self-hosted OTA server, regenerate the Updater
# JSON there, and the phone sees it in Settings > System > Updater.
#
# Configure these for your own infrastructure (env vars or edit here):
#   OTA_SSH   - how to reach the host serving OTA, e.g. "user@ota-host" or a ProxyJump string
#   OTA_BASE  - the public base URL the zip is served from, e.g. https://ota.example.com/gauguin
#
# Usage: OTA_SSH=... OTA_BASE=... scripts/deploy-ota.sh <path-to-zip-on-server>
set -euo pipefail

OTA_SSH=${OTA_SSH:?set OTA_SSH to your OTA host ssh target}
base_url=${OTA_BASE:?set OTA_BASE to your public OTA base URL}
ssh_vm() { ssh -o BatchMode=yes $OTA_SSH "$@"; }

zip=${1:?usage: deploy-ota.sh <zip-path-on-server>}

OTA_DIR=${OTA_DIR:-/srv/ota/gauguin}
MAKE_JSON=${MAKE_JSON:-make-ota-json.py}   # path to make-ota-json.py on the OTA host
ssh_vm "set -e
  mkdir -p '$OTA_DIR'
  cp '$zip' '$OTA_DIR'/
  cd '$OTA_DIR'
  z=\$(basename '$zip')
  python3 '$MAKE_JSON' \"\$z\" '$base_url' > gauguin.json
  echo 'published:'; ls -la; echo '--- json:'; cat gauguin.json"
echo "Done. On the phone: Settings > System > Updater (the phone must be able to reach OTA_BASE)."
