#!/system/bin/sh
# On-device RAM tuning for gauguin Lite, to run once after flashing (needs root):
#   adb push post-flash/ram-tuning.sh /data/local/tmp/ && adb shell su -c 'sh /data/local/tmp/ram-tuning.sh'
# Runtime settings (survive reboot) so you can measure and re-tune. Re-run to change values, or
# `ram-tuning.sh reset` to restore stock. zram size (75%) and algo (lz4) are baked into the ROM.
set -u

reset=${1:-}

if [ "$reset" = reset ]; then
    device_config delete activity_manager max_cached_processes 2>/dev/null
    device_config set_sync_disabled_for_tests none 2>/dev/null
    echo "reset: max_cached_processes back to default; re-tune or reboot."
    exit 0
fi

# Keep more cached (background) apps before the system trims them. Default is ~32.
# (The phantom-process killer is intentionally left ON so stray background native processes
# can't drain the battery.)
device_config set_sync_disabled_for_tests persistent
device_config put activity_manager max_cached_processes 48

echo "RAM tuning applied:"
echo "  max_cached_processes : 48 (was ~32)"
echo "  phantom process killer: left ON (battery safety)"
echo "zram (from ROM)        : 75% of RAM, lz4 compression"
echo "Reboot, use the phone a few days, watch Settings > Battery and background app behaviour."
