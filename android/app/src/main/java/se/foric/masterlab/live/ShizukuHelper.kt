package se.foric.masterlab.live

import android.content.Context
import android.content.pm.PackageManager
import rikka.shizuku.Shizuku

/**
 * Shizuku låter en app köra kommandon med ADB:s rättigheter direkt på telefonen (startas via Trådlös felsökning).
 * Vi använder det för en enda sak: `pm grant se.foric.masterlab android.permission.DUMP`.
 */
object ShizukuHelper {
    const val PKG = "moe.shizuku.privileged.api"
    const val REQUEST_CODE = 4711

    fun installed(ctx: Context): Boolean = try {
        ctx.packageManager.getPackageInfo(PKG, 0); true
    } catch (_: PackageManager.NameNotFoundException) { false }

    fun running(): Boolean = try { Shizuku.pingBinder() } catch (_: Throwable) { false }

    fun granted(): Boolean = running() && try {
        Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    } catch (_: Throwable) { false }

    /** Kör ett kommando som skal-användaren (ADB). newProcess är privat i Shizuku-API 13, därav reflektion. */
    fun exec(vararg cmd: String): Pair<Int, String> {
        val m = Shizuku::class.java.getDeclaredMethod("newProcess", Array<String>::class.java, Array<String>::class.java, String::class.java)
        m.isAccessible = true
        val p = m.invoke(null, arrayOf(*cmd), null, null) as Process
        val out = p.inputStream.bufferedReader().readText() + p.errorStream.bufferedReader().readText()
        val code = p.waitFor()
        return code to out.trim()
    }

    fun grantDump(ctx: Context): Pair<Int, String> = exec("pm", "grant", ctx.packageName, "android.permission.DUMP")
}
