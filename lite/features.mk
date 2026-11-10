# LineageOS Lite feature selection for gauguin.
# Set each toggle to true (keep) or false (remove), or override on the command line:
#   LITE_KEEP_BROWSER=true m bacon
# Core pieces (Settings, SystemUI, launcher, Dialer, Contacts, keyboard, providers) are not listed
# because removing them breaks calls or first boot.
# Check the final list on the build machine: get_build_var PRODUCT_PACKAGES | tr ' ' '\n' | sort

# --- Google apps (MindTheGapps, built in)
# Keeps Play Services (push notifications via FCM), Play Store, Services Framework and account sync.
LITE_GAPPS ?= true
LITE_KEEP_GOOGLE_APP ?= false  # Velvet/VelvetTitan: Google search app and Assistant
LITE_KEEP_GOOGLE_SPEECH ?= false  # SpeechServicesByGoogle: voice typing and Google TTS
LITE_KEEP_GOOGLE_MARKUP ?= false  # MarkupGoogle_v2: screenshot editor
LITE_KEEP_TALKBACK ?= false  # talkback: screen reader
LITE_KEEP_GOOGLE_SETUP ?= true  # SetupWizard: Google first-boot setup and account restore

# --- LineageOS apps that Google apps from the Play Store replace
LITE_KEEP_GALLERY_GLIMPSE ?= false  # Glimpse -> MIUI Gallery port or Google Photos
LITE_KEEP_MUSIC_TWELVE ?= false  # Twelve -> YouTube Music
LITE_KEEP_BROWSER ?= false  # Jelly -> Chrome
LITE_KEEP_CALENDAR ?= false  # Etar -> Google Calendar
LITE_KEEP_MESSAGING ?= true  # Messaging -> Google Messages (install it from Play on first boot)
LITE_KEEP_CALCULATOR ?= false  # ExactCalculator -> Google Calculator / MIUI Calculator port
LITE_KEEP_CLOCK ?= false  # DeskClock -> Google Clock
LITE_KEEP_PDF_VIEWER ?= false  # Camelot -> Google Drive / Files
LITE_KEEP_SEEDVAULT ?= false  # Seedvault -> Google One backup

# --- Cameras (all three can be installed side by side)
LITE_KEEP_CAMERA_APERTURE ?= true  # Aperture: LineageOS camera
LITE_CAM_MIUI ?= true  # MIUI Camera port (miui-ports/MiuiCamera)
# GCam ports are ordinary user apps: install them after flashing (APKs kept in miui-ports/GCam).

# --- Phone and contacts: Google Phone / Contacts / Gboard are installed from Play on first boot.
# The AOSP keyboard stays so you can type a Wi-Fi password during setup.
LITE_KEEP_DIALER ?= true  # Dialer -> Google Phone
LITE_KEEP_CONTACTS ?= true  # Contacts -> Google Contacts

# --- Media
LITE_KEEP_AUDIOFX ?= false  # AudioFX: equalizer
LITE_KEEP_RECORDER ?= true  # Recorder: sound recorder
LITE_KEEP_FM_RADIO ?= false  # FMRadio: gauguin has an FM tuner

# --- System extras
LITE_KEEP_UPDATER ?= true  # Updater: OTA client, points at lineage.updater.uri (self-hosted OTA)
LITE_KEEP_FLIPFLAP ?= false  # FlipFlap: flip-cover cases
LITE_KEEP_PROFILES ?= false  # Profiles: LineageOS system profiles
LITE_KEEP_PRINT_SERVICE ?= true  # BuiltInPrintService: printing
LITE_KEEP_WALLPAPERS ?= true  # Backgrounds: wallpaper set
LITE_KEEP_WEBCAM ?= true  # DeviceAsWebcam: use the phone as a USB webcam
LITE_KEEP_TRACEUR ?= false  # Traceur: developer system tracing

# --- Mapping: toggle -> module names
LITE_MODULES_GOOGLE_APP := Velvet VelvetTitan
LITE_MODULES_GOOGLE_SPEECH := SpeechServicesByGoogle
LITE_MODULES_GOOGLE_MARKUP := MarkupGoogle_v2
LITE_MODULES_TALKBACK := talkback
LITE_MODULES_GOOGLE_SETUP := SetupWizard
LITE_MODULES_GALLERY_GLIMPSE := Glimpse
LITE_MODULES_MUSIC_TWELVE := Twelve
LITE_MODULES_BROWSER := Jelly
LITE_MODULES_CALENDAR := Etar
LITE_MODULES_MESSAGING := messaging
LITE_MODULES_CALCULATOR := ExactCalculator
LITE_MODULES_CLOCK := DeskClock
LITE_MODULES_PDF_VIEWER := Camelot
LITE_MODULES_SEEDVAULT := Seedvault
LITE_MODULES_CAMERA_APERTURE := Aperture
LITE_MODULES_DIALER := Dialer
LITE_MODULES_CONTACTS := Contacts
LITE_MODULES_AUDIOFX := AudioFX
LITE_MODULES_RECORDER := Recorder
LITE_MODULES_FM_RADIO := FMRadio
LITE_MODULES_UPDATER := Updater
LITE_MODULES_FLIPFLAP := FlipFlap
LITE_MODULES_PROFILES := Profiles
LITE_MODULES_PRINT_SERVICE := BuiltInPrintService
LITE_MODULES_WALLPAPERS := Backgrounds
LITE_MODULES_WEBCAM := DeviceAsWebcam
LITE_MODULES_TRACEUR := Traceur

LITE_FEATURES := GOOGLE_APP GOOGLE_SPEECH GOOGLE_MARKUP TALKBACK GOOGLE_SETUP \
    GALLERY_GLIMPSE MUSIC_TWELVE BROWSER CALENDAR MESSAGING CALCULATOR CLOCK PDF_VIEWER SEEDVAULT \
    CAMERA_APERTURE DIALER CONTACTS AUDIOFX RECORDER FM_RADIO \
    UPDATER FLIPFLAP PROFILES PRINT_SERVICE WALLPAPERS WEBCAM TRACEUR

# PRODUCT_PACKAGES_REMOVE is not implemented by this build system, so removal goes through
# override modules (lite/remove/Android.bp): each lite_remove_<FEATURE> overrides its LITE_MODULES_*.
PRODUCT_PACKAGES += $(foreach f,$(LITE_FEATURES),$(if $(filter false,$(strip $(LITE_KEEP_$(f)))),lite_remove_$(f)))

# System-wide ad blocking through /system/etc/hosts (StevenBlack list, lite/hosts/)
LITE_ADBLOCK_HOSTS := true
