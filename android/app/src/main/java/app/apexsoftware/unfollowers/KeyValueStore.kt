package app.apexsoftware.unfollowers

import java.io.File

/**
 * Pamięć panelu (odpowiednik chrome.storage.local): klucz → tekst JSON, jeden plik na klucz
 * w prywatnym katalogu aplikacji. Wartości nie są rozbierane – zapisujemy dokładnie to, co przysłał skrypt.
 * Wywoływana z jednego wątku (MainActivity.io), więc nie potrzebuje blokad.
 */
class KeyValueStore(root: File) {
    private val dir = File(root, "apex-store").apply { mkdirs() }

    private fun fileFor(key: String): File {
        val hex = key.toByteArray(Charsets.UTF_8).joinToString("") { "%02x".format(it) }
        return File(dir, "$hex.json")
    }

    private fun keyOf(file: File): String? {
        val hex = file.name.removeSuffix(".json")
        if (hex.length % 2 != 0 || !file.name.endsWith(".json")) return null
        return try {
            String(ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }, Charsets.UTF_8)
        } catch (e: NumberFormatException) {
            null
        }
    }

    fun get(keys: List<String>?): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        if (keys == null) {
            dir.listFiles()?.forEach { f -> keyOf(f)?.let { out[it] = f.readText(Charsets.UTF_8) } }
        } else {
            for (k in keys) {
                val f = fileFor(k)
                if (f.isFile) out[k] = f.readText(Charsets.UTF_8)
            }
        }
        return out
    }

    fun set(items: Map<String, String>) {
        for ((k, v) in items) {
            val target = fileFor(k)
            val tmp = File(dir, target.name + ".tmp")
            tmp.writeText(v, Charsets.UTF_8)
            if (!tmp.renameTo(target)) {
                target.delete()
                if (!tmp.renameTo(target)) throw IllegalStateException("cannot write $k")
            }
        }
    }

    fun remove(keys: List<String>) {
        for (k in keys) fileFor(k).delete()
    }

    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }
}
