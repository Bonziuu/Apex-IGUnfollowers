import Foundation

/// Pamięć panelu (odpowiednik chrome.storage.local): klucz → tekst JSON, jeden plik na klucz
/// w Application Support aplikacji (bez kopii w iCloud). Wartości zapisujemy dokładnie tak, jak przysłał skrypt.
/// Używana z jednej kolejki szeregowej (WebViewController.io).
final class KeyValueStore {
    private let dir: URL

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var dir = base.appendingPathComponent("apex-store", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        self.dir = dir
    }

    private func fileURL(for key: String) -> URL {
        let hex = key.utf8.map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(hex + ".json")
    }

    private func key(of url: URL) -> String? {
        guard url.pathExtension == "json" else { return nil }
        let hex = url.deletingPathExtension().lastPathComponent
        guard hex.count % 2 == 0 else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let b = UInt8(hex[index..<next], radix: 16) else { return nil }
            bytes.append(b)
            index = next
        }
        return String(bytes: bytes, encoding: .utf8)
    }

    func get(_ keys: [String]?) throws -> [String: String] {
        var out = [String: String]()
        if let keys = keys {
            for k in keys {
                let url = fileURL(for: k)
                if FileManager.default.fileExists(atPath: url.path) {
                    out[k] = try String(contentsOf: url, encoding: .utf8)
                }
            }
        } else {
            let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
            for url in files {
                if let k = key(of: url) { out[k] = try String(contentsOf: url, encoding: .utf8) }
            }
        }
        return out
    }

    func set(_ items: [String: String]) throws {
        for (k, v) in items {
            try v.write(to: fileURL(for: k), atomically: true, encoding: .utf8)
        }
    }

    func remove(_ keys: [String]) {
        for k in keys { try? FileManager.default.removeItem(at: fileURL(for: k)) }
    }

    func clear() {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        for url in files { try? FileManager.default.removeItem(at: url) }
    }
}
