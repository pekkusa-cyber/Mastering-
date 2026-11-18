package se.foric.masterlab.live

/**
 * Tolkar textutdata från `dumpsys audio` och `dumpsys media.audio_flinger` till en lista med
 * uppspelningar (vem spelar, på vilken ljud-session). Ren Kotlin utan Android-beroenden så att den
 * kan enhetstestas på JVM (app/src/test). Formatet skiljer sig mellan Android-versioner, därför
 * letar vi efter fält i stället för att lita på exakta kolumner.
 */
data class PlaybackEntry(
    val session: Int,
    val uid: Int? = null,
    val pid: Int? = null,
    val state: String? = null,
    val usage: String? = null,
    val source: String,
)

object SessionParser {
    private val UID_PID = Regex("""u/pid:\s*(\d+)\s*/\s*(\d+)""")
    private val SESSION = Regex("""session:\s*(-?\d+)""")
    private val STATE = Regex("""state:\s*([A-Za-z_]+)""")
    private val USAGE = Regex("""usage=\s*([A-Z_]+)""")

    /** Raden "Permission Denial ... android.permission.DUMP" betyder att behörigheten saknas. */
    fun isPermissionDenied(text: String): Boolean =
        text.contains("Permission Denial") || text.contains("missing android.permission.DUMP")

    /** Spelarlistan i `dumpsys audio` (AudioPlaybackConfiguration.toString per spelare). */
    fun parseAudio(text: String): List<PlaybackEntry> {
        val out = LinkedHashMap<Int, PlaybackEntry>()
        for (line in text.lineSequence()) {
            if (!line.contains("u/pid:")) continue
            val s = SESSION.find(line)?.groupValues?.get(1)?.toIntOrNull() ?: continue
            if (s <= 0) continue
            val up = UID_PID.find(line)
            val e = PlaybackEntry(
                session = s,
                uid = up?.groupValues?.get(1)?.toIntOrNull(),
                pid = up?.groupValues?.get(2)?.toIntOrNull(),
                state = STATE.find(line)?.groupValues?.get(1),
                usage = USAGE.find(line)?.groupValues?.get(1),
                source = "dumpsys audio",
            )
            // Samma session kan förekomma flera gånger; en spelare som spelar vinner över en pausad
            val prev = out[s]
            if (prev == null || (prev.state != "started" && e.state == "started")) out[s] = e
        }
        return out.values.toList()
    }

    /** Om `dumpsys audio` alls innehåller session-fält (äldre Android saknar dem). */
    fun audioHasSessionField(text: String): Boolean =
        text.lineSequence().any { it.contains("u/pid:") && SESSION.containsMatchIn(it) }

    /**
     * Spårtabellerna i `dumpsys media.audio_flinger`. Rubrikraden innehåller "Client" och "Session";
     * värdena är högerjusterade under rubrikerna, så vi tar det ord i raden som överlappar rubrikens kolumn.
     */
    fun parseAudioFlinger(text: String): List<PlaybackEntry> {
        val out = LinkedHashMap<Int, PlaybackEntry>()
        var cols: Map<String, IntRange>? = null
        for (line in text.lineSequence()) {
            val trimmed = line.trim()
            if (trimmed.isEmpty()) { cols = null; continue }
            val tokens = tokenize(line)
            val names = tokens.map { it.second }
            if ("Session" in names && ("Client" in names || "Client(pid/uid)" in names)) {
                cols = tokens.associate { (r, n) -> n to r }
                continue
            }
            val c = cols ?: continue
            val sessionCol = c["Session"] ?: continue
            val clientCol = c["Client"] ?: c["Client(pid/uid)"] ?: continue
            val sTok = overlapping(tokens, sessionCol) ?: continue
            val session = sTok.toIntOrNull() ?: continue
            if (session <= 0) continue
            val cTok = overlapping(tokens, clientCol)
            val parts = cTok?.split("/")?.map { it.trim().toIntOrNull() } ?: emptyList()
            val activeCol = c["Active"]
            val active = activeCol?.let { overlapping(tokens, it) }
            out.putIfAbsent(session, PlaybackEntry(
                session = session,
                pid = parts.getOrNull(0),
                uid = parts.getOrNull(1),
                state = when (active) { "yes" -> "started"; "no" -> "idle"; else -> null },
                source = "dumpsys audio_flinger",
            ))
        }
        return out.values.toList()
    }

    private fun tokenize(line: String): List<Pair<IntRange, String>> =
        Regex("""\S+""").findAll(line).map { it.range to it.value }.toList()

    private fun overlapping(tokens: List<Pair<IntRange, String>>, col: IntRange): String? =
        tokens.firstOrNull { (r, _) -> r.first <= col.last && r.last >= col.first }?.second

    /** Användningar vi lägger effekten på: musik/media, spel och okänt (t.ex. vissa webbspelare). */
    fun isMusicLike(e: PlaybackEntry): Boolean =
        e.usage == null || e.usage in setOf("USAGE_MEDIA", "USAGE_GAME", "USAGE_UNKNOWN")

    /** De rader ur dumpsys som är intressanta i en felsökningsrapport. */
    fun relevantLines(text: String, max: Int = 80): String =
        text.lineSequence().filter { it.contains("u/pid:") || it.contains("Session") || it.contains("Permission Denial") }
            .take(max).joinToString("\n")
}
