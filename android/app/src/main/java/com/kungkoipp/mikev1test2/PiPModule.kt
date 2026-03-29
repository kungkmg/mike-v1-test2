package com.kungkoipp.mikev1test2

import android.os.Build
import com.facebook.react.bridge.*

class PiPModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "PiPModule"

    @ReactMethod
    fun enter(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false)
            return
        }
        try {
            activity.runOnUiThread {
                (activity as? MainActivity)?.enterPiP()
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("PIP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isSupported(promise: Promise) {
        promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    }
}
