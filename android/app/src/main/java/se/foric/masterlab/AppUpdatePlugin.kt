package se.foric.masterlab

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * Uppdateringar utan server: varje bygge lägger webbpaketet (bundle.zip) och APK:n i GitHub-releasen "live".
 *  - Live-uppdatering: webbdelen (gränssnitt, presets, hjälptexter) laddas ner och packas upp här,
 *    och src/updater.js pekar om WebView till den nya mappen.
 *  - Ny APK (när Kotlin-koden ändrats): laddas ner och lämnas till Androids installerare – ett tryck.
 * Nedladdningen sker här i Kotlin eftersom GitHub inte tillåter fetch från en annan webbplats (CORS).
 */
@CapacitorPlugin(name = "AppUpdate")
class AppUpdatePlugin : Plugin() {

    private fun open(url: String): HttpURLConnection {
        require(url.startsWith("https://")) { "bara https" }
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 20000
        c.readTimeout = 60000
        c.instanceFollowRedirects = true
        c.setRequestProperty("Cache-Control", "no-cache")
        if (c.responseCode != 200) throw Exception("HTTP ${c.responseCode}")
        return c
    }

    private fun bg(call: PluginCall, work: () -> Unit) = Thread {
        try { work() } catch (e: Throwable) { call.reject("${e.message ?: e.javaClass.simpleName}") }
    }.start()

    /** Hämtar en liten textfil (latest.json). */
    @PluginMethod
    fun getText(call: PluginCall) = bg(call) {
        val text = open(call.getString("url") ?: "").inputStream.bufferedReader().use { it.readText() }
        call.resolve(JSObject().put("text", text))
    }

    /** Laddar ner och packar upp ett webbpaket till files/bundles/<version>. Svarar med mappens sökväg. */
    @PluginMethod
    fun downloadBundle(call: PluginCall) = bg(call) {
        val version = call.getInt("version") ?: throw Exception("version saknas")
        val keep = call.getString("keep") ?: ""
        val root = File(context.filesDir, "bundles")
        val dir = File(root, version.toString())
        val tmp = File(root, "$version.tmp")
        tmp.deleteRecursively()
        tmp.mkdirs()
        ZipInputStream(open(call.getString("url") ?: "").inputStream.buffered()).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                val out = File(tmp, e.name)
                // Skydd mot sökvägar som pekar ut ur mappen ("../")
                if (!out.canonicalPath.startsWith(tmp.canonicalPath + File.separator)) throw Exception("ogiltig sökväg i paketet")
                if (e.isDirectory) { out.mkdirs(); continue }
                out.parentFile?.mkdirs()
                FileOutputStream(out).use { zip.copyTo(it) }
            }
        }
        if (!File(tmp, "index.html").isFile) throw Exception("paketet saknar index.html")
        dir.deleteRecursively()
        if (!tmp.renameTo(dir)) throw Exception("kunde inte spara paketet")
        // Städa: behåll bara det nya paketet och det som körs nu
        root.listFiles()?.forEach { f -> if (f.absolutePath != dir.absolutePath && f.absolutePath != keep) f.deleteRecursively() }
        call.resolve(JSObject().put("path", dir.absolutePath))
    }

    @PluginMethod
    fun canInstall(call: PluginCall) {
        call.resolve(JSObject().put("allowed", context.packageManager.canRequestPackageInstalls()))
    }

    /** Öppnar sidan där "Installera okända appar" tillåts för Masterlab. */
    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun downloadAndInstall(call: PluginCall) = bg(call) {
        val dir = File(context.cacheDir, "update").apply { mkdirs() }
        val apk = File(dir, "masterlab.apk")
        val c = open(call.getString("url") ?: "")
        val total = c.contentLengthLong
        var done = 0L
        var last = -1
        c.inputStream.use { input ->
            FileOutputStream(apk).use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    out.write(buf, 0, n)
                    done += n
                    if (total > 0) {
                        val pct = (done * 100 / total).toInt()
                        if (pct != last && pct % 5 == 0) { last = pct; notifyListeners("progress", JSObject().put("percent", pct)) }
                    }
                }
            }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }
}
