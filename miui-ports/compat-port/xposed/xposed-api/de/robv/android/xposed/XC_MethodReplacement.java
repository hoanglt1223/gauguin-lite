package de.robv.android.xposed;

public abstract class XC_MethodReplacement extends XC_MethodHook {
    public XC_MethodReplacement() {}

    public XC_MethodReplacement(int priority) {}

    protected abstract Object replaceHookedMethod(MethodHookParam param) throws Throwable;
}
