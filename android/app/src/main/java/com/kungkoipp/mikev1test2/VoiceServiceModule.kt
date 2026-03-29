package com.kungkoipp.mikev1test2

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.*

class VoiceServiceModule(private val ctx: ReactApplicationContext)
    : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "VoiceServiceModule"

    @ReactMethod
    fun start(username: String, promise: Promise) {
        try {
            val vi = Intent(ctx, VoiceService::class.java).apply {
                action = VoiceService.ACTION_START
                putExtra(VoiceService.EXTRA_USERNAME, username)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ctx.startForegroundService(vi) else ctx.startService(vi)

            if (hasOverlayPermission()) {
                ctx.startService(Intent(ctx, FloatingIconService::class.java).apply {
                    action = FloatingIconService.ACTION_START
                })
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("ERR_START", e.message) }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            ctx.startService(Intent(ctx, VoiceService::class.java).apply { action = VoiceService.ACTION_STOP })
            ctx.startService(Intent(ctx, FloatingIconService::class.java).apply { action = FloatingIconService.ACTION_STOP })
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("ERR_STOP", e.message) }
    }

    @ReactMethod
    fun isRunning(promise: Promise) = promise.resolve(VoiceService.isRunning)

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        if (hasOverlayPermission()) { promise.resolve(true); return }
        try {
            ctx.startActivity(Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${ctx.packageName}")
            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK })
            promise.resolve(false)
        } catch (e: Exception) { promise.reject("ERR_OVERLAY", e.message) }
    }

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) = promise.resolve(hasOverlayPermission())

    // ── ขอยกเว้น battery optimization — สำคัญมากให้รัน background ได้ ────────
    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { promise.resolve(true); return }
        val pm = ctx.getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(ctx.packageName)) { promise.resolve(true); return }
        try {
            ctx.startActivity(Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${ctx.packageName}")
            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK })
            promise.resolve(false)
        } catch (e: Exception) { promise.reject("ERR_BATTERY", e.message) }
    }

    private fun hasOverlayPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx)
}