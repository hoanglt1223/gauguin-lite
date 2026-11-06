PRODUCT_PACKAGES += MiuiCamera

# The 3 *.xiaomi.so JNI libs are soong cc_prebuilt_library_shared modules (see Android.bp) and are
# pulled in via MiuiCamera's `required:` list. The APK's own 35 bundled libs travel inside the APK.

# Non-ELF data files the app reads (device feature list, camera filter thumbnails, face model).
MIUICAMERA_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
-include $(MIUICAMERA_DIR)deps.mk
