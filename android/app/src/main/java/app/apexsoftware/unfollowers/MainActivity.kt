package app.apexsoftware.unfollowers

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Apex Unfollowers na Androida.
 *
 * Aplikacja to WebView z mobilną stroną instagram.com (logujesz się na ekranie Instagrama, hasło nie
 * trafia do aplikacji) i ten sam panel co we wtyczce Chrome: skrypt assets/apex-unfollowers.js
 * (budowany przez tools/build-mobile.mjs z content/*.js). Bez reklam, analityki i usług zewnętrznych –
 * jedyne połączenia to Instagram (i Facebook, jeśli logujesz się przez Facebooka).
 *
 * Most skrypt ↔ aplikacja: obiekt ApexUnfNative (WebViewCompat.addWebMessageListener), dostępny
 * wyłącznie dla https://www.instagram.com w głównej ramce. Protokół opisuje mobile/web/bridge.js.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var offline: View
    private lateinit var store: KeyValueStore
    private lateinit var bundle: String

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private var documentStartScript = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: PendingSave? = null

    private class PendingSave(val text: String, val reply: (JSONObject) -> Unit)

    // Wczytanie kopii zapasowej (<input type="file"> w ustawieniach panelu)
    private val openDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    // Zapis CSV / kopii zapasowej: systemowe okno „Zapisz jako”
    private val createDocument = registerForActivityResult(CreateDocument()) { uri ->
        val save = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        if (uri == null) {
            save.reply(JSONObject().put("result", JSONObject().put("saved", false)))
            return@registerForActivityResult
        }
        io.execute {
            val ok = try {
                contentResolver.openOutputStream(uri, "wt")?.use { it.write(save.text.toByteArray(Charsets.UTF_8)) } != null
            } catch (e: Exception) {
                false
            }
            main.post {
                Toast.makeText(this, if (ok) R.string.saved else R.string.save_failed, Toast.LENGTH_SHORT).show()
                save.reply(if (ok) JSONObject().put("result", JSONObject().put("saved", true)) else JSONObject().put("error", getString(R.string.save_failed)))
            }
        }
    }

    private class CreateDocument : ActivityResultContract<Pair<String, String>, Uri?>() {
        override fun createIntent(context: Context, input: Pair<String, String>): Intent =
            Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(input.second)
                .putExtra(Intent.EXTRA_TITLE, input.first)

        override fun parseResult(resultCode: Int, intent: Intent?): Uri? =
            if (resultCode == RESULT_OK) intent?.data else null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        store = KeyValueStore(filesDir)
        bundle = assets.open("apex-unfollowers.js").bufferedReader(Charsets.UTF_8).use { it.readText() }

        val root = FrameLayout(this)
        root.setBackgroundColor(ContextCompat.getColor(this, R.color.bg))
        webView = WebView(this)
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            visibility = View.GONE
        }
        root.addView(progress, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4)).apply { gravity = Gravity.TOP })
        offline = buildOfflineView()
        root.addView(offline, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Strona nie wchodzi pod pasek stanu i nawigacji ani pod klawiaturę
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // Bez bezpiecznego mostu panel nie zapisze wyników – prosimy o aktualizację WebView
            Toast.makeText(this, R.string.webview_old, Toast.LENGTH_LONG).show()
        }
        setupWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.__apexUnfBack ? window.__apexUnfBack() : false)") { result ->
                    if (result == "true") return@evaluateJavascript
                    if (webView.canGoBack()) webView.goBack() else finish()
                }
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // Instagram traktuje WebView jak zwykłego Chrome na telefonie (bez dopisków „wv” i „Version/4.0”)
            userAgentString = userAgentString
                .replace("; wv)", ")")
                .replace(Regex("""Version/\d+(\.\d+)* """), "")
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, BRIDGE_NAME, setOf(INSTAGRAM_ORIGIN)) { _, message, sourceOrigin, isMainFrame, replyProxy ->
                if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != INSTAGRAM_ORIGIN) return@addWebMessageListener
                handleMessage(message.data ?: return@addWebMessageListener, replyProxy)
            }
        }
        // Skrypt panelu na początku każdej strony instagram.com (sam czeka na DOMContentLoaded);
        // na starszym WebView – po załadowaniu strony (onPageFinished).
        documentStartScript = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (documentStartScript) {
            WebViewCompat.addDocumentStartJavaScript(webView, bundle, setOf(INSTAGRAM_ORIGIN))
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                return routeNavigation(request.url)
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.GONE
                if (Uri.parse(url ?: "").host == INSTAGRAM_HOST) {
                    offline.visibility = View.GONE
                    if (!documentStartScript) view.evaluateJavascript(bundle, null)
                }
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    progress.visibility = View.GONE
                    offline.visibility = View.VISIBLE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    openDocument.launch(arrayOf("application/json", "text/plain", "application/octet-stream", "*/*"))
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }
    }

    /** true = otwórz poza aplikacją; false = zostań w WebView (Instagram, logowanie przez Facebooka). */
    private fun routeNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return true
        val host = uri.host?.lowercase().orEmpty()
        if ((scheme == "https" || scheme == "http") && isInAppHost(host)) return false
        if (scheme == "intent") {
            // Instagram czasem proponuje otwarcie swojej aplikacji – pozwalamy, ale tylko jako zwykły link
            openIntentUri(uri.toString())
            return true
        }
        openExternal(uri)
        return true
    }

    private fun isInAppHost(host: String): Boolean =
        host == "instagram.com" || host.endsWith(".instagram.com") ||
            host == "facebook.com" || host.endsWith(".facebook.com")

    private fun openIntentUri(raw: String) {
        try {
            val intent = Intent.parseUri(raw, Intent.URI_INTENT_SCHEME).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                component = null
                selector = null
            }
            startActivity(intent)
        } catch (e: Exception) {
            val fallback = Regex("""S\.browser_fallback_url=([^;]+)""").find(raw)?.groupValues?.get(1)
            if (fallback != null) openExternal(Uri.parse(Uri.decode(fallback)))
        }
    }

    private fun openExternal(uri: Uri) {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http" && scheme != "mailto") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show()
        }
    }

    // ---------------------------------------------------------------- most skrypt ↔ aplikacja

    private fun handleMessage(data: String, replyProxy: JavaScriptReplyProxy) {
        val msg = try { JSONObject(data) } catch (e: Exception) { return }
        val id = msg.opt("id")
        val reply: (JSONObject) -> Unit = { body ->
            body.put("id", id)
            val text = body.toString()
            main.post { replyProxy.postMessage(text) }
        }
        when (val op = msg.optString("op")) {
            "get", "set", "remove", "clear" -> io.execute {
                val body = try {
                    JSONObject().put("result", storageOp(op, msg) ?: JSONObject.NULL)
                } catch (e: Exception) {
                    JSONObject().put("error", "storage: ${e.message}")
                }
                reply(body)
            }
            "save" -> {
                pendingSave?.reply?.invoke(JSONObject().put("result", JSONObject().put("saved", false)))
                val name = msg.optString("name").replace(Regex("""[\\/:*?"<>|]"""), "_").ifBlank { "apex-unfollowers.txt" }
                val mime = msg.optString("mime").ifBlank { "application/octet-stream" }
                pendingSave = PendingSave(msg.optString("text"), reply)
                try {
                    createDocument.launch(name to mime)
                } catch (e: ActivityNotFoundException) {
                    pendingSave = null
                    reply(JSONObject().put("error", getString(R.string.save_failed)))
                }
            }
            "open" -> {
                openExternal(Uri.parse(msg.optString("url")))
                reply(JSONObject().put("result", JSONObject.NULL))
            }
            else -> reply(JSONObject().put("error", "unknown op: $op"))
        }
    }

    private fun storageOp(op: String, msg: JSONObject): JSONObject? {
        when (op) {
            "get" -> {
                val keys = msg.optJSONArray("keys")?.let { arr -> List(arr.length()) { arr.getString(it) } }
                val out = JSONObject()
                for ((k, v) in store.get(keys)) out.put(k, v)
                return out
            }
            "set" -> {
                val items = msg.getJSONObject("items")
                val map = LinkedHashMap<String, String>()
                for (k in items.keys()) map[k] = items.getString(k)
                store.set(map)
            }
            "remove" -> {
                val arr = msg.optJSONArray("keys") ?: JSONArray()
                store.remove(List(arr.length()) { arr.getString(it) })
            }
            "clear" -> store.clear()
        }
        return null
    }

    // ---------------------------------------------------------------- widok „brak połączenia”

    private fun buildOfflineView(): View {
        val fg = ContextCompat.getColor(this, R.color.fg)
        val muted = ContextCompat.getColor(this, R.color.muted)
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.bg))
            visibility = View.GONE
            isClickable = true
            addView(TextView(context).apply {
                setText(R.string.offline_title)
                setTextColor(fg)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                gravity = Gravity.CENTER
            })
            addView(TextView(context).apply {
                setText(R.string.offline_text)
                setTextColor(muted)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, dp(20))
            })
            addView(Button(context).apply {
                setText(R.string.retry)
                setOnClickListener {
                    offline.visibility = View.GONE
                    if (webView.url.isNullOrBlank() || webView.url == "about:blank") webView.loadUrl(START_URL) else webView.reload()
                }
            })
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.destroy()
        io.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val INSTAGRAM_HOST = "www.instagram.com"
        private const val INSTAGRAM_ORIGIN = "https://www.instagram.com"
        private const val START_URL = "https://www.instagram.com/"
        private const val BRIDGE_NAME = "ApexUnfNative"
    }
}
