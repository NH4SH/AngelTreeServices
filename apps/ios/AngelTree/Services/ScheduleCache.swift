import Foundation

struct CachedSchedule: Codable, Equatable, Sendable {
    let payload: MobileSchedulePayload
    let savedAt: Date
}

enum CacheFreshness {
    static let defaultMaximumAge: TimeInterval = 15 * 60

    static func isStale(
        savedAt: Date,
        now: Date = Date(),
        maximumAge: TimeInterval = defaultMaximumAge
    ) -> Bool {
        now.timeIntervalSince(savedAt) > maximumAge
    }
}

actor ScheduleCache {
    private let directory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(directory: URL? = nil) {
        self.directory = directory ?? Self.defaultDirectory()
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func read(key: String) -> CachedSchedule? {
        let url = fileURL(for: key)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(CachedSchedule.self, from: data)
    }

    func write(_ value: CachedSchedule, key: String) {
        do {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
            let data = try encoder.encode(value)
            try data.write(to: fileURL(for: key), options: .atomic)
        } catch {
            // Schedule remains usable in memory when the cache is unavailable.
        }
    }

    func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }

    static func key(startDate: String, endDate: String, scope: ScheduleScope) -> String {
        "\(scope.rawValue)-\(startDate)-\(endDate)"
    }

    private func fileURL(for key: String) -> URL {
        directory.appendingPathComponent("\(key).json")
    }

    private static func defaultDirectory() -> URL {
        let root = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.temporaryDirectory
        return root.appendingPathComponent("AngelTree/ScheduleCache", isDirectory: true)
    }
}
