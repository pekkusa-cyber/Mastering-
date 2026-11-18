package se.foric.masterlab.live

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class LiveParamsTest {
    @Test fun emptyJsonGivesNeutralChain() {
        val p = LiveParams.neutral()
        assertEquals(8, p.preEq.size)
        assertEquals(4, p.mbc.size)
        assertEquals(8, p.postEq.size)
        assertEquals(120f, p.mbc[0].cutoff)
        assertEquals(1f, p.mbc[0].ratio)
        assertEquals(-1f, p.limiter.threshold)
        assertEquals(0f, p.inputGain)
    }

    @Test fun clampsOutOfRangeAndGarbage() {
        val o = JSONObject()
            .put("inputGain", 99)
            .put("mbc", JSONArray().put(JSONObject().put("ratio", 0).put("threshold", "x").put("attack", -5)))
            .put("limiter", JSONObject().put("threshold", 4).put("ratio", 1000))
            .put("outputGain", -100)
        val p = LiveParams.fromJson(o)
        assertEquals(12f, p.inputGain)
        assertEquals(1f, p.mbc[0].ratio)
        assertEquals(0f, p.mbc[0].threshold)
        assertEquals(0.1f, p.mbc[0].attack)
        assertEquals(0f, p.limiter.threshold)
        assertEquals(50f, p.limiter.ratio)
        assertEquals(-24f, p.outputGain)
    }

    @Test fun roundTripsThroughJson() {
        val o = JSONObject().put("inputGain", 3.5).put("outputGain", -4)
            .put("postEq", JSONArray().put(JSONObject().put("gain", 1)).put(JSONObject().put("gain", -2.5)))
            .put("limiter", JSONObject().put("postGain", 1.5))
        val p = LiveParams.fromJson(o)
        assertEquals(p, LiveParams.fromJson(p.toJson()))
        assertEquals(-2.5f, p.postEq[1].gain)
        assertEquals(-2.5f, p.finalGain)
    }
}
