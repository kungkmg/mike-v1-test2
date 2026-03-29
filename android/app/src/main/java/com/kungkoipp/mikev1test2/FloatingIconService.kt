package com.kungkoipp.mikev1test2

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.*
import android.widget.ImageView
import androidx.core.content.ContextCompat

class FloatingIconService : Service() {

    companion object {
        const val ACTION_START = "FLOAT_START"
        const val ACTION_STOP  = "FLOAT_STOP"

        private var instance: FloatingIconService? = null

        fun updateColor(color: String) {
            instance?.setIconColor(color)
        }
    }

    private var windowManager: WindowManager? = null
    private var floatView: View? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> showFloat()
            ACTION_STOP  -> { removeFloat(); stopSelf() }
        }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        removeFloat()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── สร้าง floating icon ────────────────────────────────────────────────────
    private fun showFloat() {
        if (floatView != null) return

        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            dpToPx(52), dpToPx(52),
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            x = dpToPx(16)
            y = dpToPx(120)
        }

        val iv = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_btn_speak_now)
            setBackgroundResource(android.R.drawable.dialog_holo_light_frame)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dpToPx(6), dpToPx(6), dpToPx(6), dpToPx(6))
            alpha = 0.92f

            // กดแล้วเปิดแอปกลับมา
            setOnClickListener {
                val open = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(open)
            }

            // ลาก icon ได้
            var lastX = 0f; var lastY = 0f; var isDragging = false
            setOnTouchListener { v, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> { lastX = event.rawX; lastY = event.rawY; isDragging = false; false }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - lastX; val dy = event.rawY - lastY
                        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                            isDragging = true
                            params.x -= dx.toInt(); params.y -= dy.toInt()
                            lastX = event.rawX; lastY = event.rawY
                            wm.updateViewLayout(this, params)
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> isDragging
                    else -> false
                }
            }
        }

        floatView = iv
        wm.addView(iv, params)
        setIconColor(VoiceService.statusColor)
    }

    fun setIconColor(color: String) {
        floatView?.post {
            (floatView as? ImageView)?.setColorFilter(
                if (color == "green") 0xFF22C55E.toInt() else 0xFFEF4444.toInt()
            )
        }
    }

    private fun removeFloat() {
        floatView?.let {
            (getSystemService(WINDOW_SERVICE) as? WindowManager)?.removeView(it)
            floatView = null
        }
    }

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density).toInt()
}