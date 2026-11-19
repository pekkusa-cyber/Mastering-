package se.foric.masterlab.live

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Ren matematik för live-analysen och "Jämn volym" – utan Android-beroenden så att den testas på JVM.
 * Bandindelningen är densamma som i src/analysis.js (BAND_EDGES) – ändra båda samtidigt.
 */
object AnalyzerMath {
    val BAND_EDGES = doubleArrayOf(20.0, 60.0, 100.0, 150.0, 200.0, 250.0, 315.0, 400.0, 500.0, 630.0, 800.0, 1000.0, 1250.0,
        1600.0, 2000.0, 2500.0, 3150.0, 4000.0, 5000.0, 6300.0, 8000.0, 10000.0, 12500.0, 16000.0, 20000.0)
    val NBANDS = BAND_EDGES.size - 1

    fun fft(re: DoubleArray, im: DoubleArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
            j = j xor bit
            if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
        }
        var len = 2
        while (len <= n) {
            val ang = -2 * PI / len
            val wr = cos(ang); val wi = sin(ang)
            var i = 0
            while (i < n) {
                var cr = 1.0; var ci = 0.0
                for (k in 0 until len / 2) {
                    val a = i + k; val b = a + len / 2
                    val tr = re[b] * cr - im[b] * ci; val ti = re[b] * ci + im[b] * cr
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
                    val nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
                }
                i += len
            }
            len = len shl 1
        }
    }

    /** Effekt per band för en ram (Hann-fönster), samma skala som frameBandPowers i src/analysis.js. */
    fun frameBandPowers(frame: DoubleArray, fs: Double): DoubleArray {
        val n = frame.size
        val re = DoubleArray(n) { frame[it] * (0.5 - 0.5 * cos(2 * PI * it / (n - 1))) }
        val im = DoubleArray(n)
        fft(re, im)
        val out = DoubleArray(NBANDS)
        val binHz = fs / n
        var b = 0
        for (k in 1 until n / 2) {
            val f = k * binHz
            if (f < BAND_EDGES[0]) continue
            while (b < NBANDS && f >= BAND_EDGES[b + 1]) b++
            if (b >= NBANDS) break
            out[b] += (re[k] * re[k] + im[k] * im[k]) / (n.toDouble() * n)
        }
        return out
    }

    /** 8-bitars osignerade sampel från Visualizer (128 = noll) till −1…1. */
    fun fromUnsigned8(bytes: ByteArray): DoubleArray = DoubleArray(bytes.size) { ((bytes[it].toInt() and 0xff) - 128) / 128.0 }

    fun meanSquare(x: DoubleArray): Double { var s = 0.0; for (v in x) s += v * v; return s / max(1, x.size) }

    fun db(p: Double) = 10 * log10(max(p, 1e-20))
}

/**
 * Samlar en låts profil under live-analys: medelspektrum (verklig nivå), RMS per ram och toppighet.
 * src/analysis.js (finishProfile) gör om det till samma slags profil som för filer.
 */
class ProfileAccumulator(val framesPerSecond: Double) {
    val bandSum = DoubleArray(AnalyzerMath.NBANDS)
    var frames = 0; private set
    val rmsPow = ArrayList<Double>()
    val crest = ArrayList<Double>()

    /** bandsNorm: band från normaliserad vågform; scale: verklig effekt / normaliserad effekt. */
    fun add(bandsNorm: DoubleArray, scale: Double, rmsDb: Double, peakDb: Double) {
        if (rmsDb < -60) return // tystnad räknas inte
        for (i in bandSum.indices) bandSum[i] += bandsNorm[i] * scale
        frames++
        rmsPow += 10.0.pow(rmsDb / 10)
        crest += max(0.0, peakDb - rmsDb)
    }

    val seconds: Double get() = frames / framesPerSecond
    fun meanBands(): DoubleArray = DoubleArray(bandSum.size) { if (frames > 0) bandSum[it] / frames else 0.0 }
}

/**
 * Regleringen för "Jämn volym": håller den uppmätta nivån nära målet genom att ändra förstärkningen in i kedjan.
 *  - closedLoop = true: mätningen sker efter effekten (vanligast). Felet integreras långsamt.
 *  - closedLoop = false: mätningen ser ljudet före effekten. Då sätts förstärkningen till mål − källa.
 * Sänkning går fortare (3 dB/s) än höjning (1 dB/s) så att en hög låt inte hinner skrälla.
 */
class AgcMath(var targetDb: Double = -14.0) {
    var gain = 0.0
    /** Utjämnad källnivå (dB). */
    var level = Double.NaN; private set
    var closedLoop = true

    companion object {
        const val MIN_GAIN = -12.0
        const val MAX_GAIN = 12.0
        const val SILENCE_DB = -50.0
        const val UP_DB_PER_S = 1.0
        const val DOWN_DB_PER_S = 3.0
        const val SMOOTH_S = 1.5
    }

    /** levelDb: uppmätt RMS (redan volymkompenserad). dt: sekunder sedan förra. Svarar ny förstärkning. */
    fun step(levelDb: Double, dt: Double): Double {
        if (levelDb.isNaN() || levelDb < SILENCE_DB) return gain // paus: håll kvar
        // Källans nivå: i sluten slinga syns vår egen förstärkning i mätningen och dras bort direkt
        val sourceNow = if (closedLoop) levelDb - gain else levelDb
        val a = 1 - kotlin.math.exp(-dt / SMOOTH_S)
        level = if (level.isNaN()) sourceNow else 10 * log10((1 - a) * 10.0.pow(level / 10) + a * 10.0.pow(sourceNow / 10))
        val desired = (targetDb - level).coerceIn(MIN_GAIN, MAX_GAIN)
        val diff = desired - gain
        val maxStep = (if (diff < 0) DOWN_DB_PER_S else UP_DB_PER_S) * dt
        gain = (gain + diff.coerceIn(-maxStep, maxStep)).coerceIn(MIN_GAIN, MAX_GAIN)
        return gain
    }

    fun reset() { level = Double.NaN }
}

/** Mäter om nivån följer en känd förstärkningsändring (avgör closedLoop). */
object ProbeMath {
    /** before/after: RMS-nivåer (dB) före och under en sänkning med probeDb (negativ). Null = går inte att avgöra. */
    fun isClosedLoop(before: List<Double>, after: List<Double>, probeDb: Double): Boolean? {
        val b = before.filter { it > AgcMath.SILENCE_DB }; val a = after.filter { it > AgcMath.SILENCE_DB }
        if (b.size < 5 || a.size < 5) return null
        val mb = AnalyzerMath.db(b.map { 10.0.pow(it / 10) }.average())
        val ma = AnalyzerMath.db(a.map { 10.0.pow(it / 10) }.average())
        val drop = mb - ma
        return when {
            drop > abs(probeDb) * 0.5 -> true
            abs(drop) < abs(probeDb) * 0.25 -> false
            else -> null
        }
    }

    fun rmsOfFrame(x: DoubleArray) = sqrt(AnalyzerMath.meanSquare(x))
    fun clampDb(v: Double) = min(24.0, max(-120.0, v))
}
