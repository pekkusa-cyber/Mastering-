package se.foric.masterlab.live

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import kotlin.math.abs

/**
 * "Jämn volym": håller ljudnivån jämn mellan appar och låtar (YouTube → Suno utan att röra volymen) genom att
 * styra förstärkningen in i live-kedjan. Varje läge (PÅ = mastrat, AV = original) har sin egen förstärkning, så
 * att PÅ och AV också hamnar på samma nivå – en nivåmatchad A/B av sig själv.
 *
 * Två saker som varierar mellan telefoner avgörs automatiskt och sparas:
 *  - closedLoop: ser mätningen ljudet efter effekten? Avgörs en gång med en kort sänkning (4 dB i 1 s).
 *  - postVolume: är mätningen påverkad av volymknapparna? Avgörs när volymen ändras. Om ja räknas volymen bort,
 *    annars skulle regleringen motverka volymknapparna.
 */
object AgcController {
    private var prefs: SharedPreferences? = null
    private var appCtx: Context? = null
    var on = false; private set
    var targetDb = -14.0; private set
    var closedLoop: Boolean? = null; private set
    var postVolume = true; private set
    private val agcOn = AgcMath()
    private val agcOff = AgcMath()
    private var lastMs = 0L
    private var pauseUntil = 0L

    // Provet som avgör closedLoop
    private var probeState = 0 // 0 = inget, 1 = mäter före, 2 = mäter under sänkning
    private var probeStart = 0L
    private val probeBefore = ArrayList<Double>()
    private val probeAfter = ArrayList<Double>()
    private const val PROBE_DB = -4.0

    // Volymkontrollen
    private var volCheck: Triple<Long, Double, Double>? = null // (tid, förväntad ändring dB, nivå före)
    private val recent = ArrayDeque<Pair<Long, Double>>()

    private val listener: (LiveAnalyzer.Frame) -> Unit = { onFrame(it) }

    fun init(ctx: Context) {
        if (prefs != null) return
        appCtx = ctx.applicationContext
        val p = ctx.applicationContext.getSharedPreferences("agc", Context.MODE_PRIVATE)
        prefs = p
        on = p.getBoolean("on", false)
        targetDb = p.getFloat("target", -14f).toDouble()
        closedLoop = if (p.contains("closed")) p.getBoolean("closed", true) else null
        postVolume = p.getBoolean("postVolume", true)
        agcOn.targetDb = targetDb; agcOff.targetDb = targetDb
    }

    private fun save() {
        prefs?.edit()?.apply {
            putBoolean("on", on); putFloat("target", targetDb.toFloat()); putBoolean("postVolume", postVolume)
            closedLoop?.let { putBoolean("closed", it) } ?: remove("closed")
        }?.apply()
    }

    /** Slår på/av. Svarar ett felmeddelande om analysen inte kunde starta (t.ex. mikrofonbehörighet saknas). */
    fun setOn(ctx: Context, value: Boolean, target: Double? = null): String? {
        init(ctx)
        target?.let { targetDb = it.coerceIn(-24.0, -6.0); agcOn.targetDb = targetDb; agcOff.targetDb = targetDb }
        on = value
        save()
        return if (value) attach(ctx) else { detach(); null }
    }

    /** Anropas när tjänsten startar. */
    fun attach(ctx: Context): String? {
        if (!on) return null
        if (!LiveAnalyzer.retain(ctx, "agc")) { LiveDspEngine.setAgcGain(0f); return LiveAnalyzer.error }
        LiveAnalyzer.removeListener(listener)
        LiveAnalyzer.addListener(listener)
        LiveDspEngine.refreshEffects()
        return null
    }

    fun detach() {
        LiveAnalyzer.removeListener(listener)
        LiveAnalyzer.release("agc")
        probeState = 0
        LiveDspEngine.setAgcGain(0f)
        LiveDspEngine.refreshEffects()
    }

    private fun current() = if (LiveDspEngine.on) agcOn else agcOff

    private fun volumeDb(): Double = appCtx?.let { AudioOut.volumeDb(it) } ?: 0.0

    private var volDbNow = Double.NaN

    /** Volymen ändrades (VOLUME_CHANGED): kontrollera om mätningen följer med. */
    fun onVolumeChanged() {
        val before = volDbNow
        volDbNow = volumeDb()
        if (before.isNaN() || !on) return
        val expected = volDbNow - before
        if (abs(expected) < 3) return
        val levelBefore = recentLevel(1000) ?: return
        volCheck = Triple(System.currentTimeMillis(), expected, levelBefore)
        pauseUntil = System.currentTimeMillis() + 1600
    }

    private fun recentLevel(ms: Long, until: Long = System.currentTimeMillis()): Double? {
        val vals = recent.filter { it.first in (until - ms)..until && it.second > AgcMath.SILENCE_DB }.map { it.second }
        if (vals.size < 4) return null
        return AnalyzerMath.db(vals.map { Math.pow(10.0, it / 10) }.average())
    }

    private fun onFrame(f: LiveAnalyzer.Frame) {
        val now = System.currentTimeMillis()
        if (volDbNow.isNaN()) volDbNow = volumeDb()
        recent.addLast(now to f.rmsDb)
        while (recent.size > 80) recent.removeFirst()
        val dt = if (lastMs == 0L) 0.05 else ((now - lastMs) / 1000.0).coerceIn(0.01, 0.5)
        lastMs = now

        volCheck?.let { (t, expected, levelBefore) ->
            if (now - t > 1500) {
                val after = recentLevel(900)
                if (after != null) {
                    val observed = after - levelBefore
                    if (abs(observed - expected) < abs(expected) * 0.4) postVolume = true
                    else if (abs(observed) < abs(expected) * 0.3) postVolume = false
                    save()
                }
                volCheck = null
            }
        }

        // Prov för att avgöra om mätningen ser effekten (görs en gång när musik spelar)
        if (closedLoop == null && f.rmsDb > -45) { runProbe(now, f.rmsDb); return }
        if (probeState != 0) { runProbe(now, f.rmsDb); return }
        if (now < pauseUntil) return

        val measured = f.rmsDb - (if (postVolume) volDbNow else 0.0)
        val agc = current()
        agc.closedLoop = closedLoop ?: true
        val g = agc.step(measured, dt)
        LiveDspEngine.setAgcGain(g.toFloat())
    }

    private fun runProbe(now: Long, rmsDb: Double) {
        when (probeState) {
            0 -> { probeState = 1; probeStart = now; probeBefore.clear(); probeAfter.clear() }
            1 -> {
                probeBefore += rmsDb
                if (now - probeStart > 1000) {
                    probeState = 2; probeStart = now
                    LiveDspEngine.setAgcGain((current().gain + PROBE_DB).toFloat())
                }
            }
            2 -> {
                if (now - probeStart > 250) probeAfter += rmsDb // låt effekten hinna slå igenom
                if (now - probeStart > 1250) {
                    val result = ProbeMath.isClosedLoop(probeBefore, probeAfter, PROBE_DB)
                    probeState = 0
                    LiveDspEngine.setAgcGain(current().gain.toFloat())
                    if (result != null) { closedLoop = result; save() }
                }
            }
        }
    }

    fun status(): JSONObject = JSONObject().apply {
        put("on", on)
        put("target", targetDb)
        put("gain", LiveDspEngine.agcGain.toDouble())
        put("gainOn", agcOn.gain)
        put("gainOff", agcOff.gain)
        put("closedLoop", closedLoop?.toString() ?: "okänt")
        put("postVolume", postVolume)
        put("probing", probeState != 0)
    }
}
