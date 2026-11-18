package se.foric.masterlab

import android.content.Intent
import android.media.audiofx.AudioEffect
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import se.foric.masterlab.live.LiveDspEngine
import se.foric.masterlab.live.LiveDspPlugin
import se.foric.masterlab.live.LiveDspService

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(LiveDspPlugin::class.java)
        super.onCreate(savedInstanceState)
        handlePanel(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handlePanel(intent)
    }

    /** En musikapps "Equalizer"-knapp öppnade Masterlab med sitt session-id: lägg effekten på den sessionen. */
    private fun handlePanel(i: Intent?) {
        if (i?.action != AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL) return
        val id = i.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, -1)
        if (id < 0) return
        LiveDspEngine.panelSession(this, id, i.getStringExtra(AudioEffect.EXTRA_PACKAGE_NAME) ?: callingPackage ?: "okänd")
        LiveDspService.start(this)
    }
}
