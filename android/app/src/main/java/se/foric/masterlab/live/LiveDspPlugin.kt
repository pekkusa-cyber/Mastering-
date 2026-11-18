package se.foric.masterlab.live

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Bryggan mellan webbgränssnittet (src/livedsp.js) och live-motorn.
 * Händelsen "status" skickas varje gång något ändras (sessioner, testläge, behörighet).
 */
@CapacitorPlugin(
    name = "LiveDsp",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class LiveDspPlugin : Plugin() {
    private val listener: () -> Unit = { notifyListeners("status", statusObj()) }

    override fun load() {
        LiveDspEngine.dumpGranted = LiveDspService.hasDump(context)
        LiveDspEngine.addListener(listener)
    }

    override fun handleOnDestroy() {
        LiveDspEngine.removeListener(listener)
    }

    private fun statusObj(): JSObject = JSObject.fromJSONObject(LiveDspEngine.status(context))

    @PluginMethod
    fun getStatus(call: PluginCall) {
        LiveDspEngine.dumpGranted = LiveDspService.hasDump(context)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifications")
            return
        }
        doStart(call)
    }

    @PermissionCallback
    private fun afterNotifications(call: PluginCall) = doStart(call) // notisen är frivillig; tjänsten startar ändå

    private fun doStart(call: PluginCall) {
        LiveDspService.start(context)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        LiveDspService.stop(context)
        LiveDspEngine.setRunning(false)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun setTestMode(call: PluginCall) {
        LiveDspEngine.setTestMode(call.getBoolean("on", false) == true)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun setGlobal(call: PluginCall) {
        LiveDspEngine.setGlobal(context, call.getBoolean("on", false) == true)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun copyReport(call: PluginCall) {
        val text = LiveDspEngine.report(context)
        val cm = context.getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText("Masterlab felsökning", text))
        call.resolve(JSObject().put("text", text))
    }
}
