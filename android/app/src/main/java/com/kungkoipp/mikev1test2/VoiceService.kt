package com.kungkoipp.mikev1test2

import android.app.*
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class VoiceService : Service() {

    companion object {
        const val CHANNEL_ID     = "voice_channel"
        const val NOTIF_ID       = 1
        const val ACTION_START   = "START"
        const val ACTION_STOP    = "STOP"
        const val EXTRA_USERNAME = "username"
        var isRunning   = false
        var statusColor = "red"
    }

    private val scope    = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http     = OkHttpClient()
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var username = ""

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                username  = intent.getStringExtra(EXTRA_USERNAME) ?: ""
                isRunning = true
                acquireWakeLock()
                requestAudioFocus()   // ← ขอ audio focus จาก Android
                startForeground(NOTIF_ID, buildNotification("🎙 ระบบเสียงกำลังทำงาน..."))
                startPollingLoop()
            }
            ACTION_STOP -> shutdown()
        }
        return START_STICKY
    }

    private fun requestAudioFocus() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attr = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attr)
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener {}
                .build()
            am.requestAudioFocus(req)
            audioFocusRequest = req
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(
                {},
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
        // บังคับเส้นทางเสียงไป speaker/earpiece ตลอด
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        am.isSpeakerphoneOn = true
    }

    private fun startPollingLoop() {
        scope.launch {
            while (isActive && isRunning) {
                try {
                    val data = fetchMicData(username)
                    if (data != null) {
                        val micOn = data.optString("status") == "online" &&
                                    data.optBoolean("enabled")
                        statusColor = if (micOn) "green" else "red"
                        val text = if (micOn) "🎙 ไมค์เปิด — รับฟังอยู่" else "🔇 ไมค์ปิด"
                        updateNotification(text)
                        FloatingIconService.updateColor(statusColor)
                    }
                } catch (_: Exception) {}
                delay(1000L)
            }
        }
    }

    private fun fetchMicData(tag: String): JSONObject? {
        if (tag.isBlank()) return null
        val body = http.newCall(
            Request.Builder()
                .url("https://api-mike-v2.runaesike.com/mic-data/$tag")
                .build()
        ).execute().use { it.body?.string() }
        return if (body != null) JSONObject(body) else null
    }

    private fun shutdown() {
        isRunning = false
        statusColor = "red"
        scope.cancel()
        wakeLock?.release()
        wakeLock = null
        // คืน audio focus
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus {}
        }
        am.mode = AudioManager.MODE_NORMAL
        FloatingIconService.updateColor("red")
        stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() { shutdown(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "mikev1:VoiceLock"
        ).also { it.acquire(4 * 60 * 60 * 1000L) }
    }

    private fun buildNotification(text: String): Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Mike V1 — ระบบเสียง")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(text: String) {
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIF_ID, buildNotification(text))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Voice Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply { setShowBadge(false); setSound(null, null) }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(ch)
        }
    }
}