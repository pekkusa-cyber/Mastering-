package se.foric.masterlab.live

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.media.audiofx.DynamicsProcessing
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Håller reda på ljud-sessioner och den DynamicsProcessing-effekt vi lagt på var och en.
 * Allt tillstånd ändras bara på huvudtråden (main), så inga lås behövs.
 *
 * Kedjan (fas 2): ingångsförstärkning → pre-EQ (8 band) → multiband-kompressor (4 band) → post-EQ (8 band)
 * → limiter (med utgångsnivån inräknad). Parametrarna kommer från webben (src/chain.js) och sparas lokalt,
 * så att tjänsten kan återställa dem om Android startar om den.
 *
 * Global session (0) är förvald – den fungerar på Armins telefon och tar allt ljud (app, Chrome, YouTube).
 * När den är aktiv läggs ingen effekt på enskilda sessioner, annars skulle ljudet bearbetas två gånger.
 */
object LiveDspEngine {
    class Session(
        val id: Int,
        var pkg: String,
        var source: String,
        var state: String? = null,
        var usage: String? = null,
        var lastSeen: Long = System.currentTimeMillis(),
        var effect: DynamicsProcessing? = null,
        var error: String? = null,
        var note: String? = null,
    )

    private val main = Handler(Looper.getMainLooper())
    private val sessions = LinkedHashMap<Int, Session>()
    private val listeners = mutableListOf<() -> Unit>()
    private var prefs: SharedPreferences? = null

    var running = false; private set
    /** Bearbetningen på (true) eller förbikopplad (false). */
    var on = false; private set
    var globalWanted = true; private set
    var params: LiveParams = LiveParams.neutral(); private set
    /** Under automatisk nivåmatchning styr mätningen på/av tillfälligt. */
    private var measureOverride: Boolean? = null
    /** Förstärkning från "Jämn volym" (AgcController), läggs på kedjans ingång i både PÅ och AV. */
    var agcGain = 0f; private set
    private val NEUTRAL = LiveParams.neutral()

    /** PÅ (mastrat) eller AV (original) just nu – mätningen kan tillfälligt styra det. */
    private fun mastered() = measureOverride ?: on

    /**
     * Parametrarna som ligger på effekten: PÅ = kedjan, AV med jämn volym = neutral kedja (bara nivån),
     * plus förstärkningen från jämn volym. Utan jämn volym är effekten helt avstängd i AV.
     */
    fun applied(): LiveParams {
        val base = if (mastered()) params else NEUTRAL
        return if (agcGain == 0f) base else base.copy(inputGain = base.inputGain + agcGain)
    }

    private fun effectEnabled() = mastered() || AgcController.on

    var broadcastsReceived = 0
    var scans = 0
    var lastScanInfo: String = "Ingen sökning ännu"
    var dumpGranted = false
    var lastDumpExcerpt: String = ""
    var playbackApiInfo: String = ""

    fun init(ctx: Context) {
        if (prefs != null) return
        AgcController.init(ctx)
        val p = ctx.applicationContext.getSharedPreferences("live", Context.MODE_PRIVATE)
        prefs = p
        on = p.getBoolean("on", false)
        globalWanted = p.getBoolean("global", true)
        params = try { LiveParams.fromJson(JSONObject(p.getString("params", "{}") ?: "{}")) } catch (_: Throwable) { LiveParams.neutral() }
    }

    fun wasRunning(): Boolean = prefs?.getBoolean("running", false) == true

    private fun save() {
        prefs?.edit()?.putBoolean("on", on)?.putBoolean("global", globalWanted)?.putBoolean("running", running)
            ?.putString("params", params.toJson().toString())?.apply()
    }

    fun addListener(l: () -> Unit) { listeners += l }
    fun removeListener(l: () -> Unit) { listeners -= l }
    fun changed() { main.post { listeners.toList().forEach { it() } } }

    fun setRunning(isRunning: Boolean) {
        running = isRunning
        if (!isRunning) releaseAll()
        save()
        changed()
    }

    fun setOn(value: Boolean) {
        on = value
        save()
        refreshEffects()
        changed()
    }

    fun setMeasureOverride(value: Boolean?) {
        measureOverride = value
        refreshEffects()
    }

    fun setParams(p: LiveParams) {
        params = p
        save()
        refreshEffects()
        changed()
    }

    /** Lägger aktuella parametrar och på/av på alla effekter. */
    fun refreshEffects() {
        val a = applied()
        for (s in sessions.values) s.effect?.let { dp ->
            try { applyParams(dp, a) } catch (t: Throwable) { s.error = "parametrar: ${t.javaClass.simpleName}: ${t.message}" }
            applyEnabled(s)
        }
    }

    /** Ny förstärkning från jämn volym – bara ingångsförstärkningen uppdateras (små steg, inga klick). */
    fun setAgcGain(g: Float) {
        if (kotlin.math.abs(g - agcGain) < 0.1f && !(g == 0f && agcGain != 0f)) return
        agcGain = g
        val gain = applied().inputGain
        for (s in sessions.values) s.effect?.let { dp -> try { dp.setInputGainAllChannelsTo(gain) } catch (_: Throwable) {} }
    }

    fun setGlobal(ctx: Context, value: Boolean) {
        globalWanted = value
        save()
        if (value && running) attach(ctx, 0, "global (session 0)", "global") else detach(0)
        refreshSessionEffects(ctx)
        changed()
    }

    /** Global session kopplad utan fel. */
    fun globalActive(): Boolean = sessions[0]?.let { it.effect != null && it.error == null } == true

    /** Lägger effekten på en session (eller uppdaterar "senast sedd" om den redan finns). */
    fun attach(ctx: Context, id: Int, pkg: String, source: String, state: String? = null, usage: String? = null) {
        if (!running) return
        val existing = sessions[id]
        if (existing != null) {
            existing.lastSeen = System.currentTimeMillis()
            existing.state = state ?: existing.state
            existing.usage = usage ?: existing.usage
            if (existing.pkg.startsWith("uid ") && !pkg.startsWith("uid ")) existing.pkg = pkg
            return
        }
        val s = Session(id, pkg, source, state, usage)
        sessions[id] = s
        if (id != 0 && globalActive()) s.note = "global session används – ingen egen effekt"
        else tryCreate(s)
        if (id == 0) refreshSessionEffects(ctx)
        changed()
    }

    /** När global session slås på/av: släpp eller skapa effekterna på de enskilda sessionerna. */
    private fun refreshSessionEffects(@Suppress("UNUSED_PARAMETER") ctx: Context) {
        val global = globalActive()
        for (s in sessions.values) {
            if (s.id == 0) continue
            if (global) {
                release(s)
                s.error = null
                s.note = "global session används – ingen egen effekt"
            } else if (s.effect == null) {
                s.note = null
                tryCreate(s)
            }
        }
    }

    private fun tryCreate(s: Session) {
        try {
            val dp = DynamicsProcessing(Int.MAX_VALUE, s.id, buildConfig(applied()))
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
            dp.setEnabled(effectEnabled())
        } catch (t: Throwable) {
            s.error = "setEnabled: ${t.javaClass.simpleName}: ${t.message}"
        }
    }

    private fun eqBand(b: EqBandP) = DynamicsProcessing.EqBand(true, b.cutoff, b.gain)

    private fun mbcBand(b: MbcBandP) = DynamicsProcessing.MbcBand(
        true, b.cutoff, b.attack, b.release, b.ratio, b.threshold, b.knee,
        -90f, 1f, // ingen noise gate / expander
        b.preGain, b.postGain,
    )

    private fun limiter(p: LiveParams) = DynamicsProcessing.Limiter(
        true, true, 0, p.limiter.attack, p.limiter.release, p.limiter.ratio, p.limiter.threshold, p.finalGain,
    )

    fun buildConfig(p: LiveParams): DynamicsProcessing.Config {
        val b = DynamicsProcessing.Config.Builder(
            DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
            2,
            true, p.preEq.size,
            true, p.mbc.size,
            true, p.postEq.size,
            true,
        )
        // Byggaren tar hela steg (Eq/Mbc) – banden sätts på stegen först
        val pre = DynamicsProcessing.Eq(true, true, p.preEq.size)
        p.preEq.forEachIndexed { i, e -> pre.setBand(i, eqBand(e)) }
        val mbc = DynamicsProcessing.Mbc(true, true, p.mbc.size)
        p.mbc.forEachIndexed { i, m -> mbc.setBand(i, mbcBand(m)) }
        val post = DynamicsProcessing.Eq(true, true, p.postEq.size)
        p.postEq.forEachIndexed { i, e -> post.setBand(i, eqBand(e)) }
        b.setPreEqAllChannelsTo(pre)
        b.setMbcAllChannelsTo(mbc)
        b.setPostEqAllChannelsTo(post)
        b.setInputGainAllChannelsTo(p.inputGain)
        b.setLimiterAllChannelsTo(limiter(p))
        return b.build()
    }

    private fun applyParams(dp: DynamicsProcessing, p: LiveParams) {
        dp.setInputGainAllChannelsTo(p.inputGain)
        p.preEq.forEachIndexed { i, e -> dp.setPreEqBandAllChannelsTo(i, eqBand(e)) }
        p.mbc.forEachIndexed { i, m -> dp.setMbcBandAllChannelsTo(i, mbcBand(m)) }
        p.postEq.forEachIndexed { i, e -> dp.setPostEqBandAllChannelsTo(i, eqBand(e)) }
        dp.setLimiterAllChannelsTo(limiter(p))
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
                put("note", s.note ?: "")
                put("lastSeen", s.lastSeen)
            })
        }
        return JSONObject().apply {
            put("running", running)
            put("on", on)
            put("globalWanted", globalWanted)
            put("globalActive", globalActive())
            put("dumpGranted", dumpGranted)
            put("broadcastsReceived", broadcastsReceived)
            put("scans", scans)
            put("lastScanInfo", lastScanInfo)
            put("playbackApiInfo", playbackApiInfo)
            put("android", Build.VERSION.RELEASE)
            put("sdk", Build.VERSION.SDK_INT)
            put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("params", params.toJson())
            put("agc", AgcController.status())
            put("analyzer", LiveAnalyzer.status())
            put("analysis", JSONObject().put("running", LiveAnalysis.running).put("seconds", LiveAnalysis.seconds))
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
