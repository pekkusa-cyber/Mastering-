package se.foric.masterlab.live

import kotlin.math.pow

/**
 * Post-EQ:n i effekten har 31 tersband. Dina 8 post-EQ-band (LiveParams) och hörlurskorrigeringen läggs ihop
 * här: varje tersband får gain = ditt band som täcker tersbandets mitt + korrigeringen + korrigeringens preamp.
 * Samma tersbandsmitter som src/headphones.js (THIRD_OCTAVE) – ändra båda samtidigt.
 */
object PostEq {
    val CENTERS = floatArrayOf(20f, 25f, 31.5f, 40f, 50f, 63f, 80f, 100f, 125f, 160f, 200f, 250f, 315f, 400f, 500f, 630f, 800f,
        1000f, 1250f, 1600f, 2000f, 2500f, 3150f, 4000f, 5000f, 6300f, 8000f, 10000f, 12500f, 16000f, 20000f)
    val N = CENTERS.size // 31
    /** Övre gräns för varje tersband (DynamicsProcessing-banden är "upp till cutoff"). */
    val CUTOFFS = FloatArray(N) { i -> if (i == N - 1) 22000f else CENTERS[i] * 2.0.pow(1.0 / 6).toFloat() }

    /** Korrigering: 31 gains (dB) och preamp (dB). Tom = ingen korrigering. */
    class Correction(val gains: FloatArray = FloatArray(N), val preamp: Float = 0f, val name: String = "") {
        val isEmpty get() = preamp == 0f && gains.all { it == 0f }
    }

    fun expand(user: List<EqBandP>, corr: Correction?): List<EqBandP> = List(N) { i ->
        val c = CENTERS[i]
        val u = user.firstOrNull { c < it.cutoff }?.gain ?: user.last().gain
        val k = if (corr == null) 0f else corr.gains.getOrElse(i) { 0f } + corr.preamp
        EqBandP(CUTOFFS[i], (u + k).coerceIn(-24f, 24f))
    }
}
