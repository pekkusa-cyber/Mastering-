package se.foric.masterlab.live

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.audiofx.Visualizer
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lyssnar på allt ljud som spelas (Visualizer på global session 0) och delar ut en ram ~20 gånger i sekunden:
 * spektrum i 24 band (från normaliserad vågform, så att även tyst ljud får bra upplösning) och verklig nivå
 * (RMS/topp i dB från Visualizers mätläge). Kräver mikrofonbehörighet – Android kräver den för Visualizer,
 * men inget spelas in eller sparas.
 *
 * Används av: Jämn volym (AgcController), live-analysen/referenser (LiveAnalysis), spektrumvisningen och
 * auto-nivåmatchningen (LevelMatcher). Startas när någon behöver den och stängs när ingen gör det (retain/release).
 */
object LiveAnalyzer {
    class Frame(val bandsNorm: DoubleArray, val scale: Double, val rmsDb: Double, val peakDb: Double, val timeMs: Long)

    private var vis: Visualizer? = null
    private val users = HashSet<String>()
    private val listeners = mutableListOf<(Frame) -> Unit>()
    var error: String? = null; private set
    var framesPerSecond = 20.0; private set
    var lastFrame: Frame? = null; private set

    val running get() = vis != null

    fun hasPermission(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun addListener(l: (Frame) -> Unit) { listeners += l }
    fun removeListener(l: (Frame) -> Unit) { listeners -= l }

    /** Någon (tag) behöver analysen. Svarar false (och sätter error) om den inte kan startas. */
    fun retain(ctx: Context, tag: String): Boolean {
        users += tag
        return running || start(ctx)
    }

    fun release(tag: String) {
        users -= tag
        if (users.isEmpty()) stop()
    }

    private fun start(ctx: Context): Boolean {
        if (!hasPermission(ctx)) { error = "Mikrofonbehörighet saknas (Mer → Behörigheter)."; return false }
        return try {
            val v = Visualizer(0)
            v.enabled = false
            v.captureSize = Visualizer.getCaptureSizeRange()[1]
            v.scalingMode = Visualizer.SCALING_MODE_NORMALIZED
            v.measurementMode = Visualizer.MEASUREMENT_MODE_PEAK_RMS
            val rate = Visualizer.getMaxCaptureRate()
            framesPerSecond = rate / 1000.0
            v.setDataCaptureListener(object : Visualizer.OnDataCaptureListener {
                override fun onWaveFormDataCapture(visualizer: Visualizer?, waveform: ByteArray?, samplingRate: Int) {
                    if (visualizer != null && waveform != null) onWave(visualizer, waveform, samplingRate)
                }
                override fun onFftDataCapture(visualizer: Visualizer?, fft: ByteArray?, samplingRate: Int) {}
            }, rate, true, false)
            v.enabled = true
            vis = v
            error = null
            true
        } catch (t: Throwable) {
            error = "Kunde inte starta analysen: ${t.javaClass.simpleName}: ${t.message}"
            false
        }
    }

    private fun stop() {
        try { vis?.enabled = false; vis?.release() } catch (_: Throwable) {}
        vis = null
        lastFrame = null
    }

    private fun onWave(v: Visualizer, bytes: ByteArray, samplingRateMilliHz: Int) {
        val frame = AnalyzerMath.fromUnsigned8(bytes)
        val m = Visualizer.MeasurementPeakRms()
        val ok = try { v.getMeasurementPeakRms(m) == Visualizer.SUCCESS } catch (_: Throwable) { false }
        val rmsDb = if (ok) m.mRms / 100.0 else -96.0
        val peakDb = if (ok) m.mPeak / 100.0 else -96.0
        val fs = if (samplingRateMilliHz > 0) samplingRateMilliHz / 1000.0 else 48000.0
        val bands = AnalyzerMath.frameBandPowers(frame, fs)
        val ms = AnalyzerMath.meanSquare(frame)
        val scale = if (ms > 1e-9) Math.pow(10.0, rmsDb / 10) / ms else 0.0
        val f = Frame(bands, scale, rmsDb, peakDb, SystemClock.elapsedRealtime())
        lastFrame = f
        listeners.toList().forEach { it(f) }
    }

    fun status(): JSONObject = JSONObject().put("running", running).put("error", error ?: "").put("users", JSONArray(users.toList()))
}

/** Live-analys av en hel låt (t.ex. en referens på YouTube eller en egen låt i Suno). */
object LiveAnalysis {
    private var acc: ProfileAccumulator? = null
    private val listener: (LiveAnalyzer.Frame) -> Unit = { f -> acc?.add(f.bandsNorm, f.scale, f.rmsDb, f.peakDb) }

    val running get() = acc != null
    val seconds get() = acc?.seconds ?: 0.0

    fun start(ctx: Context): Boolean {
        if (!LiveAnalyzer.retain(ctx, "analysis")) return false
        acc = ProfileAccumulator(LiveAnalyzer.framesPerSecond)
        LiveAnalyzer.removeListener(listener)
        LiveAnalyzer.addListener(listener)
        return true
    }

    /** Svarar rådata som src/analysis.js (finishProfile) gör om till en profil. */
    fun stop(): JSONObject? {
        val a = acc ?: return null
        acc = null
        LiveAnalyzer.removeListener(listener)
        LiveAnalyzer.release("analysis")
        return JSONObject().apply {
            put("bandPow", JSONArray(a.meanBands().toList()))
            put("rmsPow", JSONArray(a.rmsPow))
            put("crest", JSONArray(a.crest))
            put("framesPerSecond", a.framesPerSecond)
            put("seconds", a.seconds)
            put("source", "live")
        }
    }
}
