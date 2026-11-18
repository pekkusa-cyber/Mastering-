package se.foric.masterlab.live

import android.content.Context
import android.content.pm.PackageManager
import android.media.audiofx.DynamicsProcessing
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Håller reda på hittade ljud-sessioner och den DynamicsProcessing-effekt vi lagt på var och en.
 * Allt tillstånd ändras bara på huvudtråden (main), så inga lås behövs.
 *
 * Fas 1 (go/no-go): ett enda testläge – +6 dB ingångsförstärkning och en limiter med tak −20 dB –
 * så att skillnaden hörs direkt när testläget slås på/av.
 */
object LiveDspEngine {
    const val TEST_INPUT_GAIN_DB = 6f
    const val TEST_LIMITER_THRESHOLD_DB = -20f

    class Session(
        val id: Int,
        var pkg: String,
        var source: String,
        var state: String? = null,
        var usage: String? = null,
        var lastSeen: Long = System.currentTimeMillis(),
        var effect: DynamicsProcessing? = null,
        var error: String? = null,
    )

    private val main = Handler(Looper.getMainLooper())
    private val sessions = LinkedHashMap<Int, Session>()
    private val listeners = mutableListOf<() -> Unit>()

    var running = false; private set
    var testOn = false; private set
    var globalWanted = false; private set
    var broadcastsReceived = 0
    var scans = 0
    var lastScanInfo: String = "Ingen sökning ännu"
    var dumpGranted = false
    var lastDumpExcerpt: String = ""
    var playbackApiInfo: String = ""

    fun addListener(l: () -> Unit) { listeners += l }
    fun removeListener(l: () -> Unit) { listeners -= l }
    fun changed() { main.post { listeners.toList().forEach { it() } } }

    fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    fun setRunning(on: Boolean) {
        running = on
        if (!on) releaseAll()
        changed()
    }

    fun setTestMode(on: Boolean) {
        testOn = on
        for (s in sessions.values) applyEnabled(s)
        changed()
    }

    fun setGlobal(ctx: Context, on: Boolean) {
        globalWanted = on
        if (on && running) attach(ctx, 0, "global (session 0)", "global") else detach(0)
        changed()
    }

    /** Lägger effekten på en session (eller uppdaterar "senast sedd" om den redan finns). */
    fun attach(ctx: Context, id: Int, pkg: String, source: String, state: String? = null, usage: String? = null) {
        if (!running) return
        val existing = sessions[id]
        if (existing != null) {
            existing.lastSeen = System.currentTimeMillis()
            existing.state = state ?: existing.state
            existing.usage = usage ?: existing.usage
            if (existing.pkg.startsWith("uid ") && !pkg.startsWith("uid ")) existing.pkg = pkg
            if (existing.effect == null && existing.error == null) tryCreate(existing)
            return
        }
        val s = Session(id, pkg, source, state, usage)
        sessions[id] = s
        tryCreate(s)
        changed()
    }

    private fun tryCreate(s: Session) {
        try {
            val dp = DynamicsProcessing(Int.MAX_VALUE, s.id, testConfig())
            dp.setControlStatusListener { _, _ -> changed() }
            dp.setEnableStatusListener { _, _ -> changed() }
            s.effect = dp
            s.error = null
            applyEnabled(s)
        } catch (t: Throwable) {
            s.effect = null
            s.error = "${t.javaClass.simpleName}: ${t.message}"
        }
    }

    private fun applyEnabled(s: Session) {
        val dp = s.effect ?: return
        try {
            dp.setEnabled(testOn)
        } catch (t: Throwable) {
            s.error = "setEnabled: ${t.javaClass.simpleName}: ${t.message}"
        }
    }

    fun testConfig(): DynamicsProcessing.Config {
        val b = DynamicsProcessing.Config.Builder(
            DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
            2,
            false, 0, // pre-EQ (används i fas 2)
            false, 0, // multiband-kompressor (fas 2)
            false, 0, // post-EQ (fas 2)
            true,     // limiter
        )
        b.setInputGainAllChannelsTo(TEST_INPUT_GAIN_DB)
        // Limiter(inUse, enabled, linkGroup, attack ms, release ms, ratio, threshold dB, postGain dB)
        b.setLimiterAllChannelsTo(DynamicsProcessing.Limiter(true, true, 0, 1f, 60f, 10f, TEST_LIMITER_THRESHOLD_DB, 0f))
        return b.build()
    }

    private val pending = LinkedHashMap<Int, String>()

    /** En spelare öppnade appen som effektpanel (DISPLAY_AUDIO_EFFECT_CONTROL_PANEL) med sitt session-id. */
    fun panelSession(ctx: Context, id: Int, pkg: String) {
        if (running) attach(ctx, id, pkg, "effektpanel") else pending[id] = pkg
    }

    fun attachPending(ctx: Context) {
        pending.forEach { (id, pkg) -> attach(ctx, id, pkg, "effektpanel") }
        pending.clear()
    }

    fun detach(id: Int) {
        val s = sessions.remove(id) ?: return
        release(s)
        changed()
    }

    /** Sessioner hittade via dumpsys som inte syns längre släpps efter en stund. */
    fun pruneScanned(seen: Set<Int>, olderThanMs: Long) {
        val now = System.currentTimeMillis()
        val gone = sessions.values.filter {
            it.source.startsWith("dumpsys") && it.id !in seen && now - it.lastSeen > olderThanMs
        }
        gone.forEach { sessions.remove(it.id); release(it) }
        if (gone.isNotEmpty()) changed()
    }

    private fun release(s: Session) {
        try { s.effect?.release() } catch (_: Throwable) {}
        s.effect = null
    }

    private fun releaseAll() {
        sessions.values.forEach { release(it) }
        sessions.clear()
    }

    fun packageFor(ctx: Context, uid: Int?, pid: Int?): String {
        if (uid == null) return if (pid != null) "pid $pid" else "okänd"
        val pm = ctx.packageManager
        val names = try { pm.getPackagesForUid(uid) } catch (_: Throwable) { null }
        return names?.firstOrNull() ?: try { pm.getNameForUid(uid) } catch (_: Throwable) { null } ?: "uid $uid"
    }

    fun label(ctx: Context, pkg: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, PackageManager.GET_META_DATA)).toString()
    } catch (_: Throwable) { pkg }

    fun status(ctx: Context): JSONObject {
        val list = JSONArray()
        for (s in sessions.values) {
            val dp = s.effect
            list.put(JSONObject().apply {
                put("sessionId", s.id)
                put("pkg", s.pkg)
                put("label", label(ctx, s.pkg))
                put("source", s.source)
                put("state", s.state ?: "")
                put("usage", s.usage ?: "")
                put("attached", dp != null)
                put("enabled", try { dp?.enabled ?: false } catch (_: Throwable) { false })
                put("hasControl", try { dp?.hasControl() ?: false } catch (_: Throwable) { false })
                put("error", s.error ?: "")
                put("lastSeen", s.lastSeen)
            })
        }
        return JSONObject().apply {
            put("running", running)
            put("testOn", testOn)
            put("globalWanted", globalWanted)
            put("dumpGranted", dumpGranted)
            put("broadcastsReceived", broadcastsReceived)
            put("scans", scans)
            put("lastScanInfo", lastScanInfo)
            put("playbackApiInfo", playbackApiInfo)
            put("android", Build.VERSION.RELEASE)
            put("sdk", Build.VERSION.SDK_INT)
            put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("sessions", list)
        }
    }

    fun report(ctx: Context): String = buildString {
        appendLine("Masterlab felsökningsrapport")
        appendLine(status(ctx).toString(2))
        appendLine()
        appendLine("--- utdrag ur dumpsys ---")
        appendLine(lastDumpExcerpt.ifEmpty { "(inget)" })
    }
}
