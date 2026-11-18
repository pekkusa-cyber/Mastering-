package se.foric.masterlab.live

import android.media.audiofx.Visualizer
import android.os.Handler
import android.os.Looper
import kotlin.math.log10
import kotlin.math.pow

/**
 * Automatisk nivåmatchning: mäter ljudnivån (RMS) på hela utgången med Visualizer, först med bearbetningen
 * förbikopplad och sedan påslagen, och föreslår hur mycket utgången ska sänkas/höjas för att låta lika högt.
 * Kräver mikrofonbehörighet (Android kräver den för Visualizer) – inget spelas in eller sparas.
 */
class LevelMatcher(private val done: (ok: Boolean, deltaDb: Float, message: String) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var vis: Visualizer? = null
    private val off = mutableListOf<Double>()
    private val on = mutableListOf<Double>()

    companion object {
        const val SETTLE_MS = 700L
        const val MEASURE_MS = 3000L
        const val SAMPLE_MS = 100L
        /** Tystare än så räknas som tystnad (paus mellan låtar) och tas inte med. */
        const val SILENCE_MB = -6000

        /** Medelnivå i dB räknat på effekt (inte på dB-värdena direkt). Null om inget hördes. */
        fun meanDb(samplesMb: List<Double>): Double? {
            val loud = samplesMb.filter { it > SILENCE_MB }
            if (loud.size < 5) return null
            val power = loud.map { 10.0.pow(it / 1000.0) }.average()
            return 10 * log10(power)
        }
    }

    fun start() {
        try {
            val v = Visualizer(0)
            v.measurementMode = Visualizer.MEASUREMENT_MODE_PEAK_RMS
            v.enabled = true
            vis = v
        } catch (t: Throwable) {
            finish(false, 0f, "Kunde inte mäta nivån: ${t.javaClass.simpleName}: ${t.message}")
            return
        }
        LiveDspEngine.setMeasureOverride(false)
        main.postDelayed({ sample(off, MEASURE_MS) { phaseOn() } }, SETTLE_MS)
    }

    private fun phaseOn() {
        LiveDspEngine.setMeasureOverride(true)
        main.postDelayed({ sample(on, MEASURE_MS) { result() } }, SETTLE_MS)
    }

    private fun sample(into: MutableList<Double>, remaining: Long, then: () -> Unit) {
        if (remaining <= 0) { then(); return }
        try {
            val m = Visualizer.MeasurementPeakRms()
            if (vis?.getMeasurementPeakRms(m) == Visualizer.SUCCESS) into += m.mRms.toDouble()
        } catch (_: Throwable) {}
        main.postDelayed({ sample(into, remaining - SAMPLE_MS, then) }, SAMPLE_MS)
    }

    private fun result() {
        val a = meanDb(off)
        val b = meanDb(on)
        when {
            a == null || b == null -> finish(false, 0f, "Inget ljud uppmättes. Spela en låt och försök igen.")
            kotlin.math.abs(a - b) < 0.05 -> finish(false, 0f,
                "Nivån var exakt lika med och utan bearbetning – mätaren ser troligen ljudet före effekten på den här telefonen. Nivåmatcha med reglaget i stället.")
            else -> finish(true, (a - b).toFloat(), "Utgången justerad %+.1f dB".format(a - b))
        }
    }

    private fun finish(ok: Boolean, delta: Float, msg: String) {
        LiveDspEngine.setMeasureOverride(null)
        try { vis?.enabled = false; vis?.release() } catch (_: Throwable) {}
        vis = null
        done(ok, delta, msg)
    }
}
