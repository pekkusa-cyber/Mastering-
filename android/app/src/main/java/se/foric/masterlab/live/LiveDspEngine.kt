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
        /** Har vi kontrollen över effekten? (En annan app, t.ex. Wavelet, kan ta den.) */
        var control: Boolean = true,
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
    /** Helt neutral – även limitern av – när Masterlab är avstängt. */
    private val NEUTRAL_OFF = NEUTRAL.copy(limiter = NEUTRAL.limiter.copy(ratio = 1f, threshold = 0f))
    /** Säkerhetslimiter när hörlurskorrigeringen är på: snabb, nästan oåterkallelig (20:1) vid −0,5 dB. */
    private val SAFETY_LIMITER = LimiterP(attack = 0.5f, release = 60f, ratio = 20f, threshold = -0.5f, postGain = 0f)

    /** PÅ (mastrat) eller AV (original) just nu – mätningen kan tillfälligt styra det. */
    private fun mastered() = measureOverride ?: on

    /**
     * Parametrarna som ligger på effekten: PÅ = kedjan, AV med jämn volym = neutral kedja (bara nivån),
     * plus förstärkningen från jämn volym. Utan jämn volym är effekten helt avstängd i AV.
     */
    fun applied(): LiveParams {
        if (bypass) return safe(NEUTRAL_OFF) // bara hörlurskorrigeringen (läggs på i post-EQ) – inget annat
        val base = if (mastered()) params else NEUTRAL
        val off = if (mastered()) thresholdOffset() else 0f
        val mbc = if (off == 0f) base.mbc else base.mbc.map { it.copy(threshold = (it.threshold + off).coerceIn(-90f, 0f)) }
        return safe(base.copy(inputGain = base.inputGain + agcGain, mbc = mbc))
    }

    /**
     * Hörlurskorrigeringen är nivåkompenserad (samma volym som utan) och höjer därför vissa band över 0 dB.
     * Är den på ser vi till att en limiter alltid finns sist, så att inget kan klippa.
     */
    private fun safe(p: LiveParams): LiveParams =
        if (correctionActive() && p.limiter.ratio < 4f) p.copy(limiter = SAFETY_LIMITER) else p

    /**
     * Masterlab av (bypass): resten av kedjan – mastring, jämn volym, volymkompensation – gör ingenting.
     * Hörlurskorrigeringen är en egen huvudbrytare och fungerar oberoende av den här.
     */
    var bypass = false; private set
    private fun effectEnabled() = correctionActive() || (!bypass && (mastered() || AgcController.on))

    /** Stoppa i notisen/appen: allt av, så att inget ser påslaget ut när motorn står still. */
    fun stopAll() {
        on = false
        correctionOn = false
        save()
        changed()
    }

    fun setBypass(value: Boolean): JSONObject { bypass = value; save(); val r = refreshEffects(); changed(); return r }

    // ---- Hörlurskorrigering, volymoberoende kompression och profiler per ljudutgång ----
    var correction: PostEq.Correction? = null; private set
    var correctionOn = false; private set
    var volComp = true; private set
    /** Volymens dB (≤ 0) som trösklarna flyttas med när volymoberoende kompression är på. */
    var volOffset = 0f; private set
    private var profiles = JSONObject()
    var output: AudioOut.Output? = null; private set
    var lastProfile: String = ""; private set
    var lastReport = JSONObject(); private set

    private fun correctionActive() = correctionOn && correction?.isEmpty == false

    /** Trösklarna i multibandet följer volymen (om ljudet bearbetas efter volymknappen, se AgcController.postVolume). */
    private fun thresholdOffset(): Float = if (volComp && AgcController.postVolumeKnown && AgcController.postVolume) volOffset.coerceAtLeast(-30f) else 0f

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
        correctionOn = p.getBoolean("corrOn", false)
        correction = try { parseCorrection(JSONObject(p.getString("corr", "{}") ?: "{}")) } catch (_: Throwable) { null }
        volComp = p.getBoolean("volComp", true)
        bypass = p.getBoolean("bypass", false)
        profiles = try { JSONObject(p.getString("profiles", "{}") ?: "{}") } catch (_: Throwable) { JSONObject() }
    }

    fun wasRunning(): Boolean = prefs?.getBoolean("running", false) == true

    private fun save() {
        prefs?.edit()?.putBoolean("on", on)?.putBoolean("global", globalWanted)?.putBoolean("running", running)
            ?.putString("params", params.toJson().toString())
            ?.putBoolean("corrOn", correctionOn)?.putString("corr", correction?.let { correctionJson(it) }?.toString() ?: "{}")
            ?.putBoolean("volComp", volComp)?.putBoolean("bypass", bypass)?.putString("profiles", profiles.toString())?.apply()
    }

    fun parseCorrection(o: JSONObject): PostEq.Correction? {
        val arr = o.optJSONArray("gains") ?: return null
        val g = FloatArray(PostEq.N) { i -> arr.optDouble(i, 0.0).toFloat().coerceIn(-20f, 20f) }
        return PostEq.Correction(g, o.optDouble("preamp", 0.0).toFloat().coerceIn(-20f, 6f), o.optString("name", ""))
    }

    private fun correctionJson(c: PostEq.Correction) = JSONObject().put("gains", JSONArray(c.gains.map { it.toDouble() }))
        .put("preamp", c.preamp.toDouble()).put("name", c.name)

    /** { on, gains[31], preamp, name } */
    fun setCorrection(on: Boolean, c: PostEq.Correction?): JSONObject {
        correctionOn = on
        if (c != null) correction = c
        save()
        val r = refreshEffects()
        changed()
        return r
    }

    fun setVolComp(on: Boolean): JSONObject { volComp = on; save(); val r = refreshEffects(); changed(); return r }

    fun onVolumeChanged(ctx: Context) {
        val v = AudioOut.volumeDb(ctx).toFloat()
        if (kotlin.math.abs(v - volOffset) < 0.5f) return
        volOffset = v
        if (volComp && AgcController.postVolumeKnown && AgcController.postVolume && mastered()) refreshEffects()
    }

    /** Profiler per ljudutgång: { "<nyckel>": { params: {...}, correction: { on, gains, preamp, name } } }. */
    fun setProfiles(p: JSONObject) { profiles = p; save(); changed() }

    /** Ny ljudutgång (t.ex. hörlurarna ansluts): byt till dess profil om det finns en. */
    fun onOutputChanged(ctx: Context) {
        val o = AudioOut.current(ctx)
        val changedDevice = o.key != output?.key
        output = o
        volOffset = AudioOut.volumeDb(ctx).toFloat()
        if (changedDevice) {
            val prof = profiles.optJSONObject(o.key)
            if (prof != null) {
                prof.optJSONObject("params")?.let { params = LiveParams.fromJson(it) }
                prof.optJSONObject("correction")?.let { c -> correctionOn = c.optBoolean("on", false); parseCorrection(c)?.let { correction = it } }
                lastProfile = o.name
                save()
            } else lastProfile = ""
            refreshEffects()
        }
        changed()
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

    /** Svarar en rapport: hur många effekter som tog emot ändringen och om en annan app har kontrollen. */
    fun setParams(p: LiveParams): JSONObject {
        params = p
        save()
        val r = refreshEffects()
        changed()
        return r
    }

    /**
     * Lägger aktuella parametrar och på/av på alla effekter. Rapporten { total, ok, noControl, errors, running }
     * visas i appen som bekräftelse på att ändringen verkligen ligger på ljudet.
     */
    fun refreshEffects(): JSONObject {
        val a = applied()
        var total = 0; var ok = 0; var noControl = 0; var errors = 0; var dropped = 0
        var firstError = ""
        for (s in sessions.values.toList()) s.effect?.let { dp ->
            total++
            val control = try { dp.hasControl() } catch (_: Throwable) { false }
            s.control = control
            if (!control) { noControl++; return@let }
            try {
                applyParams(dp, a)
                applyEnabled(s)
                if (s.error?.startsWith("parametrar") == true) s.error = null
                ok++
            } catch (t: Throwable) {
                val msg = "${t.javaClass.simpleName}: ${t.message}"
                if (firstError.isEmpty()) firstError = msg
                // En session som spelaren redan stängt (död effekt) är inget fel för användaren – släpp den
                if (t is IllegalStateException || t is android.os.DeadObjectException || t.message?.contains("dead", true) == true) {
                    sessions.remove(s.id); release(s); total--; dropped++
                } else { s.error = "parametrar: $msg"; errors++ }
            }
        }
        lastReport = JSONObject().put("total", total).put("ok", ok).put("noControl", noControl).put("errors", errors)
            .put("dropped", dropped).put("firstError", firstError)
            .put("running", running).put("time", System.currentTimeMillis())
        return lastReport
    }

    /** Reserv till kontroll-lyssnaren: upptäck att kontrollen kommit tillbaka och lägg på våra inställningar. */
    fun checkControl() {
        var any = false
        for (s in sessions.values) s.effect?.let { dp ->
            val c = try { dp.hasControl() } catch (_: Throwable) { false }
            if (c != s.control) {
                s.control = c
                any = true
                if (c) try { applyParams(dp, applied()); applyEnabled(s) } catch (_: Throwable) {}
            }
        }
        if (any) changed()
    }

    /** Ta tillbaka kontrollen från en annan app (t.ex. Wavelet): skapa om alla effekter. */
    fun takeControl(): JSONObject {
        for (s in sessions.values) {
            if (s.note != null) continue
            release(s)
            tryCreate(s)
        }
        val r = refreshEffects()
        changed()
        return r
    }

    /** Ny förstärkning från jämn volym – bara ingångsförstärkningen uppdateras (små steg, inga klick). */
    fun setAgcGain(g: Float) {
        if (kotlin.math.abs(g - agcGain) < 0.1f && !(g == 0f && agcGain != 0f)) return
        agcGain = g
        if (bypass) return
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

    /** Antal effekter som faktiskt sitter på något (för notisen). */
    fun attachedCount() = sessions.values.count { it.effect != null }

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
        // Skydd: aldrig fler än 16 egna effekter (dumpsys kan lista många spelare)
        if (id != 0 && sessions.values.count { it.id != 0 } >= 16) return
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
            // Får vi tillbaka kontrollen (t.ex. när Wavelet stängs) läggs våra inställningar på igen direkt –
            // effektmotorn kan annars ligga kvar med den andra appens inställningar eller vara avstängd.
            dp.setControlStatusListener { _, granted ->
                main.post {
                    s.control = granted
                    if (granted && s.effect === dp) {
                        try { applyParams(dp, applied()); applyEnabled(s) } catch (_: Throwable) {}
                    }
                    changed()
                }
            }
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
            true, PostEq.N,
            true,
        )
        // Byggaren tar hela steg (Eq/Mbc) – banden sätts på stegen först
        val pre = DynamicsProcessing.Eq(true, true, p.preEq.size)
        p.preEq.forEachIndexed { i, e -> pre.setBand(i, eqBand(e)) }
        val mbc = DynamicsProcessing.Mbc(true, true, p.mbc.size)
        p.mbc.forEachIndexed { i, m -> mbc.setBand(i, mbcBand(m)) }
        val postBands = PostEq.expand(p.postEq, if (correctionActive()) correction else null, p.post31)
        val post = DynamicsProcessing.Eq(true, true, postBands.size)
        postBands.forEachIndexed { i, e -> post.setBand(i, eqBand(e)) }
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
        PostEq.expand(p.postEq, if (correctionActive()) correction else null, p.post31).forEachIndexed { i, e -> dp.setPostEqBandAllChannelsTo(i, eqBand(e)) }
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
            put("control", sessions.values.filter { it.effect != null }.all { it.control })
            put("report", lastReport)
            put("correction", JSONObject().put("on", correctionOn).put("name", correction?.name ?: "").put("preamp", (correction?.preamp ?: 0f).toDouble()))
            put("volComp", volComp)
            put("bypass", bypass)
            put("volOffset", volOffset.toDouble())
            put("output", output?.let { JSONObject().put("key", it.key).put("name", it.name).put("kind", it.kind) } ?: JSONObject())
            put("profileApplied", lastProfile)
            put("profiles", JSONArray(profiles.keys().asSequence().toList()))
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
