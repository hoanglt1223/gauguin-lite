PRODUCT_PACKAGES += MiuiCamera

# System-app JNI libs live next to the APK, not inside it, so they are copied as files.
MIUICAMERA_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
PRODUCT_COPY_FILES += \
    $(foreach f,$(notdir $(wildcard $(MIUICAMERA_DIR)lib/arm64/*.so)),\
        $(MIUICAMERA_DIR)lib/arm64/$(f):$(TARGET_COPY_OUT_SYSTEM)/priv-app/MiuiCamera/lib/arm64/$(f))

# Extra system libraries and MIUI framework pieces the app loads; list filled from the dependency walk.
-include $(MIUICAMERA_DIR)deps.mk
