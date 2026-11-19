package se.foric.masterlab.live

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager

/** Vilken utgång musiken går till (hörlurar, högtalare, bil …) och dess volym i dB. */
object AudioOut {
    data class Output(val key: String, val name: String, val kind: String, val type: Int)

    private val PRIORITY = listOf(
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER,
        AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    )

    fun kindOf(type: Int) = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "högtalare"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET -> "hörlurar (sladd)"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER -> "bluetooth"
        else -> "annan"
    }

    fun current(ctx: Context): Output {
        val am = ctx.getSystemService(AudioManager::class.java)
        // Den mest "personliga" anslutna utgången vinner: bluetooth > USB/sladd > högtalare (så väljer Android också)
        val outs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        val dev = PRIORITY.firstNotNullOfOrNull { t -> outs.firstOrNull { it.type == t } }
        if (dev == null) return Output("speaker", "Telefonens högtalare", "högtalare", AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
        val name = if (dev.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) "Telefonens högtalare" else dev.productName?.toString()?.ifBlank { null } ?: kindOf(dev.type)
        return Output("${dev.type}:$name", name, kindOf(dev.type), dev.type)
    }

    /** Musikvolymen i dB för den utgång som används (0 dB = max). */
    fun volumeDb(ctx: Context): Double = try {
        val am = ctx.getSystemService(AudioManager::class.java)
        val idx = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        am.getStreamVolumeDb(AudioManager.STREAM_MUSIC, idx, current(ctx).type).toDouble().coerceIn(-96.0, 0.0)
    } catch (_: Throwable) { 0.0 }
}
