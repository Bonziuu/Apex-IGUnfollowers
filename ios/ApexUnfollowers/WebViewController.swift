import UIKit
import WebKit

/// Apex Unfollowers na iPhone'a.
///
/// WKWebView z mobilną stroną instagram.com (logujesz się na ekranie Instagrama, hasło nie trafia do
/// aplikacji) i ten sam panel co we wtyczce Chrome: skrypt apex-unfollowers.js (budowany przez
/// tools/build-mobile.mjs z plików content wtyczki). Bez reklam, analityki i usług zewnętrznych.
///
/// Most skrypt ↔ aplikacja: window.webkit.messageHandlers.apexUnf (WKScriptMessageHandlerWithReply),
/// przyjmowany tylko z głównej ramki https://www.instagram.com. Protokół opisuje mobile/web/bridge.js.
final class WebViewController: UIViewController {
    private static let startURL = URL(string: "https://www.instagram.com/")!
    private static let instagramHost = "www.instagram.com"

    private var webView: WKWebView!
    private let progress = UIProgressView(progressViewStyle: .bar)
    private let offline = UIStackView()
    private let store = KeyValueStore()
    private let io = DispatchQueue(label: "app.apexsoftware.unfollowers.store")
    private var progressObservation: NSKeyValueObservation?

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = .all
        // Instagram traktuje aplikację jak zwykłe Safari na iPhonie
        let os = ProcessInfo.processInfo.operatingSystemVersion
        config.applicationNameForUserAgent = "Version/\(os.majorVersion).\(os.minorVersion) Mobile/15E148 Safari/604.1"

        let controller = WKUserContentController()
        if let url = Bundle.main.url(forResource: "apex-unfollowers", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        }
        controller.addScriptMessageHandler(BridgeProxy(self), contentWorld: .page, name: "apexUnf")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, *) {
            #if DEBUG
            webView.isInspectable = true
            #endif
        }

        let root = UIView()
        root.backgroundColor = .systemBackground
        root.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.progressTintColor = UIColor(red: 0.8, green: 0.086, blue: 0.44, alpha: 1)
        root.addSubview(progress)
        buildOfflineView(in: root)

        let guide = root.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
            progress.topAnchor.constraint(equalTo: guide.topAnchor),
            progress.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: root.trailingAnchor),
        ])

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] web, _ in
            guard let self = self else { return }
            self.progress.isHidden = web.estimatedProgress >= 1
            self.progress.setProgress(Float(web.estimatedProgress), animated: true)
        }
        view = root
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: Self.startURL))
    }

    @objc private func pullToRefresh(_ sender: UIRefreshControl) {
        if webView.url == nil { webView.load(URLRequest(url: Self.startURL)) } else { webView.reload() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { sender.endRefreshing() }
    }

    // MARK: - widok „brak połączenia”

    private func buildOfflineView(in root: UIView) {
        let title = UILabel()
        title.text = NSLocalizedString("offline.title", comment: "")
        title.font = .preferredFont(forTextStyle: .headline)
        title.textAlignment = .center
        title.numberOfLines = 0
        let text = UILabel()
        text.text = NSLocalizedString("offline.text", comment: "")
        text.font = .preferredFont(forTextStyle: .subheadline)
        text.textColor = .secondaryLabel
        text.textAlignment = .center
        text.numberOfLines = 0
        let button = UIButton(type: .system)
        button.setTitle(NSLocalizedString("retry", comment: ""), for: .normal)
        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        button.addTarget(self, action: #selector(retry), for: .touchUpInside)

        offline.axis = .vertical
        offline.spacing = 12
        offline.alignment = .center
        offline.isHidden = true
        [title, text, button].forEach(offline.addArrangedSubview)
        offline.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(offline)
        NSLayoutConstraint.activate([
            offline.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            offline.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 32),
            offline.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -32),
        ])
    }

    @objc private func retry() {
        offline.isHidden = true
        webView.isHidden = false
        if webView.url == nil { webView.load(URLRequest(url: Self.startURL)) } else { webView.reload() }
    }

    private func showOffline() {
        progress.isHidden = true
        offline.isHidden = false
        webView.isHidden = true
    }

    // MARK: - linki

    private static func isInAppHost(_ host: String) -> Bool {
        let h = host.lowercased()
        return h == "instagram.com" || h.hasSuffix(".instagram.com") || h == "facebook.com" || h.hasSuffix(".facebook.com")
    }

    fileprivate func openExternal(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["https", "http", "mailto"].contains(scheme) else { return }
        // profil na Instagramie otworzy się w aplikacji Instagram, jeśli jest zainstalowana
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    // MARK: - most skrypt ↔ aplikacja

    fileprivate func handle(_ message: WKScriptMessage, reply: @escaping (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "https", origin.host == Self.instagramHost,
              let text = message.body as? String,
              let data = text.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let op = msg["op"] as? String else {
            reply(nil, "bad message")
            return
        }
        let respond: ([String: Any]) -> Void = { body in
            let json = (try? JSONSerialization.data(withJSONObject: body)).flatMap { String(data: $0, encoding: .utf8) } ?? "{\"error\":\"encode\"}"
            DispatchQueue.main.async { reply(json, nil) }
        }

        switch op {
        case "get", "set", "remove", "clear":
            io.async { [store] in
                do {
                    switch op {
                    case "get":
                        let keys = msg["keys"] as? [String]
                        respond(["result": try store.get(keys)])
                    case "set":
                        try store.set((msg["items"] as? [String: String]) ?? [:])
                        respond(["result": NSNull()])
                    case "remove":
                        store.remove((msg["keys"] as? [String]) ?? [])
                        respond(["result": NSNull()])
                    default:
                        store.clear()
                        respond(["result": NSNull()])
                    }
                } catch {
                    respond(["error": "storage: \(error.localizedDescription)"])
                }
            }
        case "save":
            let rawName = (msg["name"] as? String) ?? "apex-unfollowers.txt"
            let name = rawName.components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|")).joined(separator: "_")
            let content = (msg["text"] as? String) ?? ""
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name.isEmpty ? "apex-unfollowers.txt" : name)
            do {
                try content.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                respond(["error": NSLocalizedString("save.failed", comment: "")])
                return
            }
            // systemowe „Udostępnij”: Zapisz w Plikach, AirDrop, poczta…
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            sheet.popoverPresentationController?.permittedArrowDirections = []
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                respond(["result": ["saved": completed]])
            }
            present(sheet, animated: true)
        case "open":
            if let s = msg["url"] as? String, let url = URL(string: s) { openExternal(url) }
            respond(["result": NSNull()])
        default:
            respond(["error": "unknown op: \(op)"])
        }
    }
}

// MARK: - nawigacja

extension WebViewController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let scheme = url.scheme?.lowercased() ?? ""
        // ramki wewnątrz strony (np. weryfikacja przy logowaniu) ładują się normalnie
        if let frame = navigationAction.targetFrame, !frame.isMainFrame {
            decisionHandler(.allow)
            return
        }
        if scheme == "about" || scheme == "blob" || scheme == "data" {
            decisionHandler(.allow)
            return
        }
        if (scheme == "https" || scheme == "http"), let host = url.host, Self.isInAppHost(host) {
            if navigationAction.targetFrame == nil {
                // link „w nowym oknie” do Instagrama – otwieramy w tym samym widoku
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }
        openExternal(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if let host = url.host, Self.isInAppHost(host) { webView.load(navigationAction.request) } else { openExternal(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offline.isHidden = true
        webView.isHidden = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled || code == 102 /* przerwane przez decyzję nawigacji */ { return }
        showOffline()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

/// Słaby pośrednik: WKUserContentController trzyma handler mocno, a kontroler nie może trzymać sam siebie.
private final class BridgeProxy: NSObject, WKScriptMessageHandlerWithReply {
    weak var target: WebViewController?
    init(_ target: WebViewController) { self.target = target }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let target = target else { replyHandler(nil, "gone"); return }
        target.handle(message, reply: replyHandler)
    }
}
