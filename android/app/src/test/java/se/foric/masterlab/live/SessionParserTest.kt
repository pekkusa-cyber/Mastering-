package se.foric.masterlab.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionParserTest {
    private val audio14 = """
        players:
          ID:23 -- type:android.media.SoundPool -- u/pid:1000/1786 -- state:idle -- attr:AudioAttributes: usage=USAGE_ASSISTANCE_SONIFICATION content=CONTENT_TYPE_SONIFICATION flags=0x800 tags= bundle=null -- session:9 -- deviceIds:[] -- mutedBy:[]
          ID:47 -- type:android.media.AudioTrack -- u/pid:10215/24631 -- state:started -- attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_MUSIC flags=0x0 tags= bundle=null -- session:2345 -- deviceIds:[3]
          ID:48 -- type:android.media.AudioTrack -- u/pid:10215/24631 -- state:paused -- attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_MUSIC flags=0x0 tags= bundle=null -- session:2345
          ID:51 -- type:aaudio -- u/pid:10188/5550 -- state:started -- attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_UNKNOWN flags=0x0 tags= bundle=null -- session:2401
        
          12-01 10:00:00.000 player piid:47 event:started
    """.trimIndent()

    @Test fun parsesPlayersWithSessions() {
        val e = SessionParser.parseAudio(audio14)
        assertEquals(listOf(9, 2345, 2401), e.map { it.session })
        val suno = e.first { it.session == 2345 }
        assertEquals(10215, suno.uid)
        assertEquals(24631, suno.pid)
        assertEquals("started", suno.state)
        assertEquals("USAGE_MEDIA", suno.usage)
        assertTrue(SessionParser.isMusicLike(suno))
        assertFalse(SessionParser.isMusicLike(e.first { it.session == 9 }))
        assertTrue(SessionParser.audioHasSessionField(audio14))
    }

    @Test fun olderFormatWithoutSessionGivesNothing() {
        val old = "  ID:47 -- type:android.media.AudioTrack -- u/pid:10215/24631 -- state:started -- attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_MUSIC flags=0x0 tags= bundle=null"
        assertTrue(SessionParser.parseAudio(old).isEmpty())
        assertFalse(SessionParser.audioHasSessionField(old))
    }

    @Test fun detectsPermissionDenial() {
        assertTrue(SessionParser.isPermissionDenied("Permission Denial: can't dump audio from from pid=1, uid=10300 due to missing android.permission.DUMP permission"))
        assertFalse(SessionParser.isPermissionDenied(audio14))
    }

    @Test fun parsesAudioFlingerTrackTable() {
        val af = """
            Output thread 0x7a1 type 0 (MIXER):
              3 Tracks of which 1 are active
                Type     Id Active Client Session Port Id S  Flags   Format Chn mask  SRate ST Usg CT  G db  L dB  R dB  VS dB
                         78    yes  24631    2345     45 A  0x400 00000001 00000003  48000  3  1  2  -inf     0     0     0
                         80     no   5550    2401     46 I  0x000 00000001 00000003  48000  3  1  2  -inf     0     0     0
            
              Effect Chains:
        """.trimIndent()
        val e = SessionParser.parseAudioFlinger(af)
        assertEquals(listOf(2345, 2401), e.map { it.session })
        assertEquals(24631, e[0].pid)
        assertEquals("started", e[0].state)
        assertEquals("idle", e[1].state)
    }
}
