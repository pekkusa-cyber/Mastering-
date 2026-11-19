package se.foric.masterlab.live

import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlin.math.log10
import kotlin.math.pow

/**
 * Automatisk nivåmatchning (utan "Jämn volym"): mäter nivån med bearbetningen förbikopplad och sedan påslagen
 * (via LiveAnalyzer) och föreslår hur mycket utgången ska ändras för att PÅ och AV ska låta lika högt.
 */
class LevelMatcher(private val ctx: Context, private val done: (ok: Boolean, deltaDb: Float, message: String) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val off = mutableListOf<Double>()
    private val on = mutableListOf<Double>()
    private var target: MutableList<Double>? = null
    private val listener: (LiveAnalyzer.Frame) -> Unit = { f -> target?.add(f.rmsDb * 100) }

    companion object {
        const val SETTLE_MS = 700L
        const val MEASURE_MS = 3000L
        /** Tystare än så räknas som tystnad (paus mellan låtar) och tas inte med (millibel). */
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
        if (!LiveAnalyzer.retain(ctx, "match")) { finish(false, 0f, LiveAnalyzer.error ?: "Kunde inte mäta nivån."); return }
        LiveAnalyzer.addListener(listener)
        LiveDspEngine.setMeasureOverride(false)
        main.postDelayed({ target = off; main.postDelayed({ target = null; phaseOn() }, MEASURE_MS) }, SETTLE_MS)
    }

    private fun phaseOn() {
        LiveDspEngine.setMeasureOverride(true)
        main.postDelayed({ target = on; main.postDelayed({ target = null; result() }, MEASURE_MS) }, SETTLE_MS)
    }

    private fun result() {
        val a = meanDb(off)
        val b = meanDb(on)
        when {
            a == null || b == null -> finish(false, 0f, "Inget ljud uppmättes. Spela en låt och försök igen.")
            kotlin.math.abs(a - b) < 0.05 -> finish(false, 0f,
                "Nivån var exakt lika med och utan bearbetning – mätaren ser troligen ljudet före effekten på den här telefonen. Använd Jämn volym eller nivåmatcha med reglaget.")
            else -> finish(true, (a - b).toFloat(), "Utgången justerad %+.1f dB".format(a - b))
        }
    }

    private fun finish(ok: Boolean, delta: Float, msg: String) {
        LiveDspEngine.setMeasureOverride(null)
        LiveAnalyzer.removeListener(listener)
        LiveAnalyzer.release("match")
        done(ok, delta, msg)
    }
}
