# Inherit this from the device makefile to build the Lite variant.
# Pick features in features.mk.
LITE_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
include $(LITE_DIR)features.mk

# $(strip) guards against trailing spaces in features.mk values before an inline comment.

# --- Cameras that need system privileges (GCam ports install as user apps after flashing)
ifeq ($(strip $(LITE_CAM_MIUI)),true)
$(call inherit-product, $(LITE_DIR)../miui-ports/MiuiCamera/miuicamera.mk)
endif

# --- Google apps (MindTheGapps)
ifeq ($(strip $(LITE_GAPPS)),true)
$(call inherit-product, vendor/gapps/arm64/arm64-vendor.mk)
endif

# --- Properties: report bootloader locked, etc.
PRODUCT_PRODUCT_PROPERTIES += $(call collapse-pairs, $(shell grep -hvE '^\#|^\s*$$' $(LITE_DIR)lite-props.prop))

# --- Drop bulky, non-essential media (boot animation / extra wallpapers when wallpapers are off)
PRODUCT_PACKAGES_REMOVE += \
    $(if $(filter false,$(strip $(LITE_KEEP_WALLPAPERS))),LineageWallpapers PhotoTable)
