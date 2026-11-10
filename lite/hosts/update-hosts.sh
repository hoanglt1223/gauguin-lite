#!/bin/sh
# Refresh the StevenBlack unified hosts list (MIT, https://github.com/StevenBlack/hosts).
set -e
cd "$(dirname "$0")"
curl -fsSL https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts -o hosts
grep -c '^0\.0\.0\.0' hosts