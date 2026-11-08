#!/system/bin/sh
# Apply the MIVI vendor-lib SELinux rules live at every boot.
# The module's sepolicy.rule is not reliably applied on this device (preinit folder
# could not be resolved), so enforce the same rules here instead.
magiskpolicy --live "allow priv_app vendor_file file { read open getattr execute map }"
magiskpolicy --live "allow priv_app vendor_file lnk_file { read open getattr }"
