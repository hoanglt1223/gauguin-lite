package com.gauguin.camcompat;

import java.lang.reflect.Constructor;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodReplacement;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

/**
 * Maps MIUI/HyperOS Camera's legacy Android 13 (API 33) 15-argument
 * {@code StreamConfigurationMap} constructor onto the constructor present on the
 * running platform. API 34+ removed the 15-arg form; API 37 ships a 21-arg form
 * (adds jpegR and heicUltraHDR stream arrays) and a 22-arg form (adds a trailing
 * enforceImplementationDefined flag).
 *
 * The app reaches the constructor through
 * {@code com.xiaomi.compat.camera2.CameraConstructCompat.getStreamConfigurationMap},
 * which is hooked here and reimplemented to call the current constructor, passing
 * null for the formats the legacy call never supplied (the framework converts
 * null into empty arrays).
 */
public class CameraApiCompat implements IXposedHookLoadPackage {

    // Stock MIUI/HyperOS Camera, plus the repackaged Leica port id. The hook is a
    // no-op on bases that lack the compat class (newer ports build the map natively).
    private static final String[] TARGET_PKGS = {
            "com.android.camera",
            "com.kobbin.leica.wmrebuild"
    };
    private static final String COMPAT_CLASS =
            "com.xiaomi.compat.camera2.CameraConstructCompat";
    private static final String TAG = "[camcompat] ";

    @Override
    public void handleLoadPackage(LoadPackageParam lpparam) throws Throwable {
        boolean match = false;
        for (String pkg : TARGET_PKGS) {
            if (pkg.equals(lpparam.packageName)) {
                match = true;
                break;
            }
        }
        if (!match) {
            return;
        }

        final Class<?> compat;
        try {
            compat = XposedHelpers.findClass(COMPAT_CLASS, lpparam.classLoader);
        } catch (Throwable t) {
            XposedBridge.log(TAG + "compat class not found, nothing to do: " + t);
            return;
        }

        XposedBridge.hookAllMethods(compat, "getStreamConfigurationMap",
                new StreamConfigurationMapReplacement());
        XposedBridge.log(TAG + "StreamConfigurationMap constructor compat hook installed");
    }

    /**
     * Named (non-capturing) replacement, kept out of an anonymous class so the
     * module dexes cleanly on the stock build-tools d8.
     */
    private static final class StreamConfigurationMapReplacement extends XC_MethodReplacement {

        private static final String SCM_CLASS =
                "android.hardware.camera2.params.StreamConfigurationMap";

        @Override
        protected Object replaceHookedMethod(MethodHookParam param) throws Throwable {
            // Legacy A13 argument order (15 entries):
            //  0 configurations
            //  1 minFrameDurations
            //  2 stallDurations
            //  3 depthConfigurations
            //  4 depthMinFrameDurations
            //  5 depthStallDurations
            //  6 dynamicDepthConfigurations
            //  7 dynamicDepthMinFrameDurations
            //  8 dynamicDepthStallDurations
            //  9 heicConfigurations
            // 10 heicMinFrameDurations
            // 11 heicStallDurations
            // 12 highSpeedVideoConfigurations
            // 13 inputOutputFormatsMap (ReprocessFormatsMap)
            // 14 listHighResolution (boolean)
            Object[] a = param.args;

            Class<?> scm = Class.forName(SCM_CLASS);
            Constructor<?> ctor = null;
            int arity = -1;
            for (Constructor<?> c : scm.getDeclaredConstructors()) {
                int n = c.getParameterTypes().length;
                if (n == 22) {
                    ctor = c;
                    arity = 22;
                    break;
                }
                if (n == 21 && ctor == null) {
                    ctor = c;
                    arity = 21;
                }
            }
            if (ctor == null) {
                throw new NoSuchMethodException(
                        "no 21/22-arg StreamConfigurationMap constructor on this platform");
            }
            ctor.setAccessible(true);

            Object[] out;
            if (arity == 22) {
                out = new Object[] {
                        a[0], a[1], a[2],       // color
                        a[3], a[4], a[5],       // depth
                        a[6], a[7], a[8],       // dynamic depth
                        a[9], a[10], a[11],     // heic
                        null, null, null,       // jpegR (absent in legacy input)
                        null, null, null,       // heicUltraHDR (absent in legacy input)
                        a[12],                  // highSpeedVideoConfigurations
                        a[13],                  // inputOutputFormatsMap
                        a[14],                  // listHighResolution
                        Boolean.TRUE            // enforceImplementationDefined
                };
            } else {
                out = new Object[] {
                        a[0], a[1], a[2],
                        a[3], a[4], a[5],
                        a[6], a[7], a[8],
                        a[9], a[10], a[11],
                        null, null, null,
                        null, null, null,
                        a[12],
                        a[13],
                        a[14]
                };
            }
            return ctor.newInstance(out);
        }
    }
}
