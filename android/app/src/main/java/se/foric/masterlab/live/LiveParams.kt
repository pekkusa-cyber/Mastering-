package se.foric.masterlab.live

import org.json.JSONArray
import org.json.JSONObject

/**
 * Live-kedjans parametrar – samma modell som src/chain.js. Värdena hålls inom samma gränser som i webben,
 * så att en trasig eller handskriven preset aldrig kan skicka orimliga värden till DynamicsProcessing.
 */
data class EqBandP(val cutoff: Float, val gain: Float)

data class MbcBandP(
    val cutoff: Float, val threshold: Float, val ratio: Float, val attack: Float, val release: Float,
    val knee: Float, val preGain: Float, val postGain: Float,
)

data class LimiterP(val attack: Float, val release: Float, val ratio: Float, val threshold: Float, val postGain: Float)

data class LiveParams(
    val inputGain: Float,
    val preEq: List<EqBandP>,
    val mbc: List<MbcBandP>,
    val postEq: List<EqBandP>,
    val limiter: LimiterP,
    val outputGain: Float,
) {
    /** Limiterns efterförstärkning plus utgångsnivån (nivåmatchningen), eftersom kedjan slutar i limitern. */
    val finalGain: Float get() = (limiter.postGain + outputGain).coerceIn(-36f, 24f)

    fun toJson(): JSONObject = JSONObject().apply {
        put("inputGain", inputGain.toDouble())
        put("preEq", JSONArray(preEq.map { JSONObject().put("cutoff", it.cutoff.toDouble()).put("gain", it.gain.toDouble()) }))
        put("mbc", JSONArray(mbc.map {
            JSONObject().put("cutoff", it.cutoff.toDouble()).put("threshold", it.threshold.toDouble()).put("ratio", it.ratio.toDouble())
                .put("attack", it.attack.toDouble()).put("release", it.release.toDouble()).put("knee", it.knee.toDouble())
                .put("preGain", it.preGain.toDouble()).put("postGain", it.postGain.toDouble())
        }))
        put("postEq", JSONArray(postEq.map { JSONObject().put("cutoff", it.cutoff.toDouble()).put("gain", it.gain.toDouble()) }))
        put("limiter", JSONObject().put("attack", limiter.attack.toDouble()).put("release", limiter.release.toDouble())
            .put("ratio", limiter.ratio.toDouble()).put("threshold", limiter.threshold.toDouble()).put("postGain", limiter.postGain.toDouble()))
        put("outputGain", outputGain.toDouble())
    }

    companion object {
        val EQ_CUTOFFS = floatArrayOf(60f, 120f, 250f, 500f, 1000f, 3000f, 8000f, 20000f)
        val MBC_CUTOFFS = floatArrayOf(120f, 2000f, 8000f, 20000f)

        fun neutral(): LiveParams = fromJson(JSONObject())

        private fun JSONObject?.f(key: String, lo: Float, hi: Float, dflt: Float): Float {
            if (this == null || !has(key)) return dflt
            val v = optDouble(key, Double.NaN)
            return if (v.isNaN() || v.isInfinite()) dflt else v.toFloat().coerceIn(lo, hi)
        }

        private fun eq(arr: JSONArray?): List<EqBandP> = EQ_CUTOFFS.mapIndexed { i, c ->
            val o = arr?.optJSONObject(i)
            EqBandP(o.f("cutoff", 20f, 24000f, c), o.f("gain", -12f, 12f, 0f))
        }

        fun fromJson(o: JSONObject?): LiveParams {
            val mbcArr = o?.optJSONArray("mbc")
            val lim = o?.optJSONObject("limiter")
            return LiveParams(
                inputGain = o.f("inputGain", -12f, 12f, 0f),
                preEq = eq(o?.optJSONArray("preEq")),
                mbc = MBC_CUTOFFS.mapIndexed { i, c ->
                    val b = mbcArr?.optJSONObject(i)
                    MbcBandP(
                        cutoff = b.f("cutoff", 20f, 24000f, c),
                        threshold = b.f("threshold", -60f, 0f, 0f),
                        ratio = b.f("ratio", 1f, 20f, 1f),
                        attack = b.f("attack", 0.1f, 200f, 10f),
                        release = b.f("release", 10f, 2000f, 150f),
                        knee = b.f("knee", 0f, 24f, 6f),
                        preGain = b.f("preGain", -12f, 12f, 0f),
                        postGain = b.f("postGain", -12f, 12f, 0f),
                    )
                },
                postEq = eq(o?.optJSONArray("postEq")),
                limiter = LimiterP(
                    attack = lim.f("attack", 0.1f, 50f, 1f),
                    release = lim.f("release", 10f, 1000f, 60f),
                    ratio = lim.f("ratio", 1f, 50f, 10f),
                    threshold = lim.f("threshold", -30f, 0f, -1f),
                    postGain = lim.f("postGain", -12f, 12f, 0f),
                ),
                outputGain = o.f("outputGain", -24f, 12f, 0f),
            )
        }
    }
}
