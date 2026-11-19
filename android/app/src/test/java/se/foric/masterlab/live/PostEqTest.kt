package se.foric.masterlab.live

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PostEqTest {
    private val user = LiveParams.fromJson(JSONObject().put("postEq", JSONArray().apply {
        for (g in listOf(1, 2, 3, 4, 5, 6, 7, 8)) put(JSONObject().put("gain", g))
    })).postEq

    @Test fun thirtyOneBandsFollowUserBands() {
        val e = PostEq.expand(user, null)
        assertEquals(31, e.size)
        assertEquals(1f, e[0].gain)                       // 20 Hz → 0–60 Hz-bandet
        assertEquals(2f, e[6].gain)                       // 80 Hz → 60–120 Hz
        assertEquals(6f, e[PostEq.CENTERS.toList().indexOf(2000f)].gain) // 1–3 kHz
        assertEquals(8f, e[30].gain)                      // 20 kHz → 8 kHz+
        for (i in 1 until e.size) assertTrue(e[i].cutoff > e[i - 1].cutoff)
    }

    @Test fun correctionAndPreampAreAdded() {
        val g = FloatArray(31).also { it[10] = 3f }
        val e = PostEq.expand(user, PostEq.Correction(g, -2f))
        assertEquals(3f + 3f - 2f, e[10].gain)            // 200 Hz: användarband 120–250 = 3 dB
        assertEquals(1f - 2f, e[0].gain)
        assertTrue(PostEq.Correction().isEmpty)
    }
}
