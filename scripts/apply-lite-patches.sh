#!/usr/bin/env bash
# Apply Lite source changes to a synced LineageOS tree. Run from the tree root after every repo sync.
set -euo pipefail

root=${1:-.}

# Camera/microphone privacy indicator: SystemUI shows it unless DeviceConfig privacy/camera_mic_icons_enabled
# says otherwise, and its built-in default is true. Flip the default so the indicator is off from first boot.
privacy_config=$(grep -rl --include=PrivacyConfig.kt "DEFAULT_MIC_CAMERA" "$root/frameworks/base/packages/SystemUI/src" || true)
if [ -z "$privacy_config" ]; then
    echo "PrivacyConfig.kt with DEFAULT_MIC_CAMERA not found; SystemUI changed, update this patch" >&2
    exit 1
fi
sed -i -E 's/(DEFAULT_MIC_CAMERA[[:space:]]*=[[:space:]]*)true/\1false/' "$privacy_config"
grep -qE 'DEFAULT_MIC_CAMERA[[:space:]]*=[[:space:]]*false' "$privacy_config" || {
    echo "Failed to set DEFAULT_MIC_CAMERA=false in $privacy_config" >&2
    exit 1
}
echo "camera/mic indicator default off: $privacy_config"

# zram 50% -> 75%: edit the device fstab entry for /dev/block/zram0.
fstab=$(grep -rl --include='fstab*' 'zram0' "$root/device/xiaomi/gauguin" || true)
if [ -n "$fstab" ]; then
    sed -i -E 's/(zram0[^\n]*zramsize=)[0-9]+%/\175%/' "$fstab"
    grep -q 'zramsize=75%' "$fstab" && echo "zram set to 75%: $fstab" || echo "WARN: zram size unchanged in $fstab" >&2
else
    echo "WARN: no zram fstab entry under device/xiaomi/gauguin; zram stays at the LineageOS 50% default" >&2
fi

# zram compression stays lz4 (the LineageOS stock choice): on a weak CPU, lz4's far higher IOPS /
# lower latency beats zstd's better ratio for responsiveness (see ublue-os/bazzite#1570). Capacity is
# covered by the 75% size above instead. No patch needed; this comment records the deliberate choice.

# Call recording in Vietnam: the Dialer gates CallRecorder by ISO country in call_record_states.xml
# (root element <call-record-allowed-flags>); "vn" is absent so recording is blocked. Add an allow
# entry right after the opening tag so recording is available by default here.
cr_states=$(grep -rl --include=call_record_states.xml "call-record-allowed-flags" "$root/packages/apps/Dialer" || true)
if [ -z "$cr_states" ]; then
    echo "call_record_states.xml with <call-record-allowed-flags> not found; Dialer changed, update this patch" >&2
    exit 1
fi
if ! grep -q 'iso="vn"' "$cr_states"; then
    sed -i '/^<call-record-allowed-flags>/a\    <country iso="vn" allowed="true" />' "$cr_states"
fi
grep -q '<country iso="vn" allowed="true" />' "$cr_states" || {
    echo "Failed to enable call recording for vn in $cr_states" >&2
    exit 1
}
echo "call recording enabled for vn: $cr_states"

# LineageSettings defaults seeded at DB creation (fresh flash) in LineageDatabaseHelper.
ldh=$(grep -rl --include=LineageDatabaseHelper.java "loadSecureSettings" "$root/lineage-sdk/packages/LineageSettingsProvider/src" || true)
if [ -z "$ldh" ]; then
    echo "LineageDatabaseHelper.java not found; LineageSettingsProvider changed, update this patch" >&2
    exit 1
fi

# Advanced restart menu: seed LineageSettings.Secure.ADVANCED_REBOOT true (loadSecureSettings).
if ! grep -q "LineageSettings.Secure.ADVANCED_REBOOT" "$ldh"; then
    grep -q "R.bool.def_qs_show_brightness_slider);" "$ldh" || {
        echo "anchor def_qs_show_brightness_slider missing in $ldh; update this patch" >&2
        exit 1
    }
    sed -i '/R\.bool\.def_qs_show_brightness_slider);/a\
\
            loadBooleanSetting(stmt, LineageSettings.Secure.ADVANCED_REBOOT,\
                    R.bool.def_advanced_reboot_lite);' "$ldh"
fi
grep -q "LineageSettings.Secure.ADVANCED_REBOOT" "$ldh" || {
    echo "Failed to seed ADVANCED_REBOOT in $ldh" >&2
    exit 1
}
echo "advanced restart seeded: $ldh"

# Double-tap-to-sleep: seed LineageSettings.System.DOUBLE_TAP_SLEEP_GESTURE true (loadSystemSettings).
if ! grep -q "LineageSettings.System.DOUBLE_TAP_SLEEP_GESTURE" "$ldh"; then
    grep -q "R.integer.def_clock_position);" "$ldh" || {
        echo "anchor def_clock_position missing in $ldh; update this patch" >&2
        exit 1
    }
    sed -i '/R\.integer\.def_clock_position);/a\
\
            loadBooleanSetting(stmt, LineageSettings.System.DOUBLE_TAP_SLEEP_GESTURE,\
                    R.bool.def_double_tap_sleep_gesture_lite);' "$ldh"
fi
grep -q "LineageSettings.System.DOUBLE_TAP_SLEEP_GESTURE" "$ldh" || {
    echo "Failed to seed DOUBLE_TAP_SLEEP_GESTURE in $ldh" >&2
    exit 1
}
echo "double-tap-to-sleep seeded: $ldh"

# Backing def_*_lite booleans for the two seeded LineageSettings above.
ldefaults=$(grep -rl --include=defaults.xml "def_qs_show_brightness_slider" "$root/lineage-sdk/packages/LineageSettingsProvider/res" || true)
if [ -z "$ldefaults" ]; then
    echo "LineageSettingsProvider defaults.xml not found; update this patch" >&2
    exit 1
fi
if ! grep -q "def_advanced_reboot_lite" "$ldefaults"; then
    sed -i 's#</resources>#    <bool name="def_advanced_reboot_lite">true</bool>\n</resources>#' "$ldefaults"
fi
if ! grep -q "def_double_tap_sleep_gesture_lite" "$ldefaults"; then
    sed -i 's#</resources>#    <bool name="def_double_tap_sleep_gesture_lite">true</bool>\n</resources>#' "$ldefaults"
fi
grep -q "def_advanced_reboot_lite" "$ldefaults" && grep -q "def_double_tap_sleep_gesture_lite" "$ldefaults" || {
    echo "Failed to add def_*_lite bools in $ldefaults" >&2
    exit 1
}
echo "lite default bools added: $ldefaults"

# Battery percentage in status bar: AOSP Settings.System.SHOW_BATTERY_PERCENT has no def resource,
# so seed it to 1 in the SettingsProvider base loader (loadSystemSettings runs at fresh DB creation).
adh=$(grep -rl --include=DatabaseHelper.java "def_pointer_speed" "$root/frameworks/base/packages/SettingsProvider/src" || true)
if [ -z "$adh" ]; then
    echo "AOSP SettingsProvider DatabaseHelper.java (def_pointer_speed) not found; update this patch" >&2
    exit 1
fi
if ! grep -q "Settings.System.SHOW_BATTERY_PERCENT" "$adh"; then
    grep -q "R.integer.def_pointer_speed);" "$adh" || {
        echo "anchor def_pointer_speed missing in $adh; update this patch" >&2
        exit 1
    }
    sed -i '/R\.integer\.def_pointer_speed);/a\
            loadSetting(stmt, Settings.System.SHOW_BATTERY_PERCENT, 1);' "$adh"
fi
grep -q "Settings.System.SHOW_BATTERY_PERCENT" "$adh" || {
    echo "Failed to seed SHOW_BATTERY_PERCENT in $adh" >&2
    exit 1
}
echo "battery percent default on: $adh"
