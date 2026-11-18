package se.foric.masterlab.live

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import rikka.shizuku.Shizuku
import java.util.concurrent.Executors

/**
 * Bryggan mellan webbgränssnittet (src/livedsp.js) och live-motorn.
 * Händelsen "status" skickas varje gång något ändras (sessioner, på/av, behörigheter).
 */
@CapacitorPlugin(
    name = "LiveDsp",
    permissions = [
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
        Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO]),
    ],
)
class LiveDspPlugin : Plugin() {
    private val listener: () -> Unit = { notifyListeners("status", statusObj()) }
    private val io = Executors.newSingleThreadExecutor()
    private var shizukuCall: PluginCall? = null
    private var matching = false

    private val shizukuResult = Shizuku.OnRequestPermissionResultListener { code, result ->
        if (code != ShizukuHelper.REQUEST_CODE) return@OnRequestPermissionResultListener
        val call = shizukuCall ?: return@OnRequestPermissionResultListener
        shizukuCall = null
        if (result == PackageManager.PERMISSION_GRANTED) runGrant(call)
        else call.reject("Masterlab fick inte använda Shizuku.")
    }

    override fun load() {
        LiveDspEngine.init(context)
        LiveDspEngine.dumpGranted = LiveDspService.hasDump(context)
        LiveDspEngine.addListener(listener)
        try { Shizuku.addRequestPermissionResultListener(shizukuResult) } catch (_: Throwable) {}
        // Motorn var igång när appen/telefonen stängdes: starta den igen
        if (LiveDspEngine.wasRunning() && !LiveDspEngine.running) LiveDspService.start(context)
    }

    override fun handleOnDestroy() {
        LiveDspEngine.removeListener(listener)
        try { Shizuku.removeRequestPermissionResultListener(shizukuResult) } catch (_: Throwable) {}
    }

    private fun statusObj(): JSObject = JSObject.fromJSONObject(LiveDspEngine.status(context))

    @PluginMethod
    fun getStatus(call: PluginCall) {
        LiveDspEngine.dumpGranted = LiveDspService.hasDump(context)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun start(call: PluginCall) {
        LiveDspService.start(context)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        LiveDspService.stop(context)
        LiveDspEngine.setRunning(false)
        call.resolve(statusObj())
    }

    /** Stora på/av-knappen. Startar motorn om den inte redan går. */
    @PluginMethod
    fun setOn(call: PluginCall) {
        val value = call.getBoolean("on", false) == true
        LiveDspEngine.setOn(value)
        if (value && !LiveDspEngine.running) LiveDspService.start(context)
        call.resolve(statusObj())
    }

    @PluginMethod
    fun setParams(call: PluginCall) {
        LiveDspEngine.setParams(LiveParams.fromJson(call.getObject("params")))
        call.resolve()
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

    // ---- Behörigheter ----

    private fun granted(p: String) = context.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    @PluginMethod
    fun getPermissions(call: PluginCall) {
        val pm = context.getSystemService(PowerManager::class.java)
        call.resolve(JSObject().apply {
            put("notifications", Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS))
            put("microphone", granted(Manifest.permission.RECORD_AUDIO))
            put("battery", pm.isIgnoringBatteryOptimizations(context.packageName))
            put("dump", LiveDspService.hasDump(context))
            put("shizukuInstalled", ShizukuHelper.installed(context))
            put("shizukuRunning", ShizukuHelper.running())
            put("shizukuGranted", ShizukuHelper.granted())
            put("globalActive", LiveDspEngine.globalActive())
            put("running", LiveDspEngine.running)
        })
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        when (call.getString("name")) {
            "notifications" ->
                if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) call.resolve()
                else if (getPermissionState("notifications") == PermissionState.DENIED) openAppSettings(call)
                else requestPermissionForAlias("notifications", call, "afterPermission")
            "microphone" ->
                if (getPermissionState("microphone") == PermissionState.GRANTED) call.resolve()
                else if (getPermissionState("microphone") == PermissionState.DENIED) openAppSettings(call)
                else requestPermissionForAlias("microphone", call, "afterPermission")
            "battery" -> launch(call, Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
            "developer" -> launch(call, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
            "appSettings" -> openAppSettings(call)
            "shizukuApp" -> {
                val open = context.packageManager.getLaunchIntentForPackage(ShizukuHelper.PKG)
                launch(call, open ?: Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${ShizukuHelper.PKG}")))
            }
            else -> call.reject("Okänd behörighet")
        }
    }

    @PermissionCallback
    private fun afterPermission(call: PluginCall) = call.resolve()

    private fun openAppSettings(call: PluginCall) =
        launch(call, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))

    private fun launch(call: PluginCall, intent: Intent) {
        try {
            activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            call.resolve()
        } catch (t: Throwable) {
            call.reject("Kunde inte öppna: ${t.message}")
        }
    }

    /** Ger appen DUMP-behörigheten via Shizuku (sessionsdetektering utan dator). */
    @PluginMethod
    fun grantDumpWithShizuku(call: PluginCall) {
        if (!ShizukuHelper.installed(context)) { call.reject("Shizuku är inte installerat."); return }
        if (!ShizukuHelper.running()) { call.reject("Shizuku är inte igång. Öppna Shizuku och starta den via Trådlös felsökning."); return }
        if (ShizukuHelper.granted()) { runGrant(call); return }
        shizukuCall = call
        Shizuku.requestPermission(ShizukuHelper.REQUEST_CODE)
    }

    private fun runGrant(call: PluginCall) {
        io.execute {
            val result = try { ShizukuHelper.grantDump(context) } catch (t: Throwable) { -1 to "${t.javaClass.simpleName}: ${t.message}" }
            activity.runOnUiThread {
                val ok = LiveDspService.hasDump(context)
                LiveDspEngine.dumpGranted = ok
                LiveDspEngine.changed()
                if (ok) call.resolve(JSObject().put("ok", true))
                else call.reject("Kommandot misslyckades (kod ${result.first}): ${result.second}")
            }
        }
    }

    /** Mäter nivån med och utan bearbetning och svarar med hur mycket utgången ska ändras (dB). */
    @PluginMethod
    fun autoLevel(call: PluginCall) {
        if (!granted(Manifest.permission.RECORD_AUDIO)) { call.reject("Mikrofonbehörighet krävs för nivåmätningen (se Behörigheter)."); return }
        if (!LiveDspEngine.running) { call.reject("Starta Masterlab och spela en låt först."); return }
        if (matching) { call.reject("Mätning pågår redan."); return }
        matching = true
        LevelMatcher { ok, delta, msg ->
            matching = false
            call.resolve(JSObject().put("ok", ok).put("deltaDb", delta.toDouble()).put("message", msg))
        }.start()
    }
}
