package se.foric.masterlab.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class AnalyzerMathTest {
    @Test fun sineLandsInRightBand() {
        val fs = 48000.0
        val frame = DoubleArray(1024) { 0.5 * sin(2 * PI * 1100 * it / fs) }
        val bands = AnalyzerMath.frameBandPowers(frame, fs)
        val loudest = bands.indices.maxByOrNull { bands[it] }!!
        assertTrue(AnalyzerMath.BAND_EDGES[loudest] <= 1100 && AnalyzerMath.BAND_EDGES[loudest + 1] > 1100)
        assertEquals(24, AnalyzerMath.NBANDS)
    }

    @Test fun unsigned8Conversion() {
        val x = AnalyzerMath.fromUnsigned8(byteArrayOf(128.toByte(), 255.toByte(), 0))
        assertEquals(0.0, x[0], 1e-9)
        assertEquals(127 / 128.0, x[1], 1e-9)
        assertEquals(-1.0, x[2], 1e-9)
    }

    @Test fun agcClosedLoopConvergesAndBringsSourcesTogether() {
        val agc = AgcMath(-14.0)
        // Högt källjud (−6 dB): effekten sänker; mätningen sker efter effekten (källa + gain)
        repeat(400) { agc.step(-6.0 + agc.gain, 0.05) }
        assertEquals(-8.0, agc.gain, 0.3)
        // Byt till en tyst källa (−20 dB): höjs till +6 dB
        repeat(400) { agc.step(-20.0 + agc.gain, 0.05) }
        assertEquals(6.0, agc.gain, 0.3)
    }

    @Test fun agcLowersFasterThanItRaises() {
        val up = AgcMath(-14.0); repeat(20) { up.step(-24.0 + up.gain, 0.05) } // 1 s
        val down = AgcMath(-14.0); repeat(20) { down.step(-4.0 + down.gain, 0.05) }
        assertTrue(abs(down.gain) > abs(up.gain) * 2)
    }

    @Test fun agcHoldsDuringSilenceAndClamps() {
        val agc = AgcMath(-14.0)
        repeat(1000) { agc.step(-40.0, 0.05) } // öppen eller stängd slinga: kläms vid +12
        assertEquals(12.0, agc.gain, 1e-9)
        val g = agc.gain
        repeat(100) { agc.step(-80.0, 0.05) } // paus i musiken
        assertEquals(g, agc.gain, 1e-9)
    }

    @Test fun agcOpenLoop() {
        val agc = AgcMath(-14.0).apply { closedLoop = false }
        repeat(400) { agc.step(-10.0, 0.05) } // mätningen påverkas inte av gain
        assertEquals(-4.0, agc.gain, 0.3)
    }

    @Test fun probeDecidesLoop() {
        val before = List(20) { -12.0 }
        assertEquals(true, ProbeMath.isClosedLoop(before, List(20) { -16.0 }, -4.0))
        assertEquals(false, ProbeMath.isClosedLoop(before, List(20) { -12.2 }, -4.0))
        assertNull(ProbeMath.isClosedLoop(before, List(20) { -70.0 }, -4.0))
    }

    @Test fun accumulatorSkipsSilence() {
        val acc = ProfileAccumulator(20.0)
        acc.add(DoubleArray(24) { 1.0 }, 0.5, -10.0, -2.0)
        acc.add(DoubleArray(24) { 1.0 }, 0.5, -80.0, -70.0)
        assertEquals(1, acc.frames)
        assertEquals(0.5, acc.meanBands()[3], 1e-12)
        assertEquals(8.0, acc.crest[0], 1e-12)
        assertEquals(0.05, acc.seconds, 1e-12)
    }
}
