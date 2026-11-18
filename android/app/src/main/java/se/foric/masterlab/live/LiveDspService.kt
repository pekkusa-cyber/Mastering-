package se.foric.masterlab.live

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.audiofx.AudioEffect
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import se.foric.masterlab.MainActivity
import se.foric.masterlab.R

/**
 * Förgrundstjänst (med notis) som håller live-bearbetningen igång medan andra appar spelar.
 * Hittar andra appars ljud-sessioner på tre sätt:
 *  1. ACTION_OPEN/CLOSE_AUDIO_EFFECT_CONTROL_SESSION från spelare som skickar dem
 *  2. `dumpsys audio` (kräver DUMP-behörighet beviljad via ADB, som Wavelet)
 *  3. Global session 0 (om användaren slår på det; blockerat på många nya telefoner)
 */
class LiveDspService : Service() {
    companion object {
        const val ACTION_START = "se.foric.masterlab.START"
        const val ACTION_STOP = "se.foric.masterlab.STOP"
        const val ACTION_TOGGLE = "se.foric.masterlab.TOGGLE"
        private const val CHANNEL = "live"
        private const val NOTIF_ID = 1
        private const val SCAN_INTERVAL_MS = 4000L
        private const val PRUNE_AFTER_MS = 15000L

        fun hasDump(ctx: Context) =
            ctx.checkSelfPermission("android.permission.DUMP") == PackageManager.PERMISSION_GRANTED

        fun start(ctx: Context) =
            ContextCompat.startForegroundService(ctx, Intent(ctx, LiveDspService::class.java).setAction(ACTION_START))

        fun stop(ctx: Context) = ctx.stopService(Intent(ctx, LiveDspService::class.java))
    }

    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var scanning = false
    private val engineListener: () -> Unit = { updateNotification() }

    private val effectReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val id = i.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, -1)
            val pkg = i.getStringExtra(AudioEffect.EXTRA_PACKAGE_NAME) ?: "okänd"
            LiveDspEngine.broadcastsReceived++
            if (id < 0) return
            when (i.action) {
                AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION -> LiveDspEngine.attach(c, id, pkg, "broadcast")
                AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION -> LiveDspEngine.detach(id)
            }
            LiveDspEngine.changed()
        }
    }

    private val playbackCallback = object : AudioManager.AudioPlaybackCallback() {
        override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
            describePlaybackApi(configs)
            // Något började/slutade spela: sök direkt i stället för att vänta på nästa intervall
            main.removeCallbacks(scanTick)
            main.postDelayed(scanTick, 300)
        }
    }

    private val scanTick = object : Runnable {
        override fun run() {
            scan()
            main.removeCallbacks(this)
            main.postDelayed(this, SCAN_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        LiveDspEngine.init(this)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Live-bearbetning", NotificationManager.IMPORTANCE_LOW))
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, NOTIF_ID, buildNotification(), type)

        val filter = IntentFilter().apply {
            addAction(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION)
            addAction(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION)
        }
        ContextCompat.registerReceiver(this, effectReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
        getSystemService(AudioManager::class.java).registerAudioPlaybackCallback(playbackCallback, main)

        LiveDspEngine.setRunning(true)
        LiveDspEngine.addListener(engineListener)
        if (LiveDspEngine.globalWanted) LiveDspEngine.setGlobal(this, true)
        LiveDspEngine.attachPending(this)
        main.post(scanTick)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> LiveDspEngine.setOn(!LiveDspEngine.on)
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
        }
        updateNotification()
        return START_STICKY
    }

    override fun onDestroy() {
        main.removeCallbacks(scanTick)
        try { unregisterReceiver(effectReceiver) } catch (_: Throwable) {}
        try { getSystemService(AudioManager::class.java).unregisterAudioPlaybackCallback(playbackCallback) } catch (_: Throwable) {}
        LiveDspEngine.removeListener(engineListener)
        LiveDspEngine.setRunning(false)
        io.shutdownNow()
        super.onDestroy()
    }

    /** Kör dumpsys i bakgrunden och lägger effekten på musiksessioner från andra appar. */
    private fun scan() {
        LiveDspEngine.dumpGranted = hasDump(this)
        describePlaybackApi(getSystemService(AudioManager::class.java).activePlaybackConfigurations)
        if (!LiveDspEngine.dumpGranted) {
            LiveDspEngine.lastScanInfo = "DUMP-behörighet saknas – sessionssökning av"
            LiveDspEngine.changed()
            return
        }
        if (scanning) return
        scanning = true
        val ctx = applicationContext
        io.execute {
            var info: String
            var entries: List<PlaybackEntry> = emptyList()
            var excerpt = ""
            try {
                val audio = runDumpsys("audio")
                if (SessionParser.isPermissionDenied(audio)) {
                    info = "dumpsys nekades trots behörighet"
                    excerpt = SessionParser.relevantLines(audio)
                } else if (SessionParser.audioHasSessionField(audio)) {
                    entries = SessionParser.parseAudio(audio)
                    excerpt = SessionParser.relevantLines(audio)
                    info = "dumpsys audio: ${entries.size} sessioner"
                } else {
                    val af = runDumpsys("media.audio_flinger")
                    entries = SessionParser.parseAudioFlinger(af)
                    excerpt = SessionParser.relevantLines(audio, 30) + "\n--- audio_flinger ---\n" + SessionParser.relevantLines(af, 60)
                    info = "dumpsys audio saknar session-fält; audio_flinger: ${entries.size} sessioner"
                }
            } catch (t: Throwable) {
                info = "dumpsys misslyckades: ${t.javaClass.simpleName}: ${t.message}"
            }
            main.post {
                scanning = false
                LiveDspEngine.scans++
                LiveDspEngine.lastScanInfo = info
                LiveDspEngine.lastDumpExcerpt = excerpt
                val myUid = Process.myUid()
                val seen = HashSet<Int>()
                for (e in entries) {
                    if (e.uid == myUid || e.uid == Process.SYSTEM_UID) continue
                    if (!SessionParser.isMusicLike(e)) continue
                    seen += e.session
                    LiveDspEngine.attach(ctx, e.session, LiveDspEngine.packageFor(ctx, e.uid, e.pid), e.source, e.state, e.usage)
                }
                LiveDspEngine.pruneScanned(seen, PRUNE_AFTER_MS)
                LiveDspEngine.changed()
            }
        }
    }

    private fun runDumpsys(service: String): String {
        val p = ProcessBuilder("dumpsys", service).redirectErrorStream(true).start()
        val text = StringBuffer()
        val t = Thread { p.inputStream.bufferedReader().use { r -> r.forEachLine { text.append(it).append('\n') } } }
        t.start()
        if (!p.waitFor(5, TimeUnit.SECONDS)) p.destroy()
        t.join(2000)
        return text.toString()
    }

    /** Den officiella listan över uppspelningar – visar om session-id går att läsa utan dumpsys (oftast inte). */
    private fun describePlaybackApi(configs: List<AudioPlaybackConfiguration>) {
        val ids = configs.map { c ->
            try {
                val m = c.javaClass.getMethod("getSessionId")
                m.invoke(c)?.toString() ?: "?"
            } catch (t: Throwable) { "dold" }
        }
        LiveDspEngine.playbackApiInfo = "${configs.size} aktiva enligt AudioManager; session-id via API: ${ids.joinToString().ifEmpty { "–" }}"
    }

    private fun pending(action: String, req: Int): PendingIntent = PendingIntent.getService(
        this, req, Intent(this, LiveDspService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun buildNotification(): Notification {
        val on = LiveDspEngine.on
        val how = if (LiveDspEngine.globalActive()) "allt ljud (global session)"
            else "${LiveDspEngine.status(this).getJSONArray("sessions").length()} ljud-sessioner"
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(if (on) "Masterlab PÅ" else "Masterlab AV (förbikopplad)")
            .setContentText("Bearbetar $how")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(0, if (on) "Slå av" else "Slå på", pending(ACTION_TOGGLE, 1))
            .addAction(0, "Stoppa", pending(ACTION_STOP, 2))
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
    }
}
