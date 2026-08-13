import Foundation

enum AngelTreeWidgetConfiguration {
    static let appGroupIdentifier = "group.org.angeltreeservices.field"
    static let kind = "AngelTreeScheduleWidget"
    static let snapshotFileName = "schedule-widget.json"
    static let staleAfter: TimeInterval = 15 * 60
}

struct WidgetScheduleItem: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let jobID: String?
    let title: String
    let partyName: String?
    let city: String?
    let status: String
    let startsAt: Date
    let endsAt: Date?
    let allDay: Bool
    let workdayNumber: Int?
    let workdayCount: Int?

    var workdayLabel: String? {
        guard let workdayNumber, let workdayCount, workdayCount > 1 else { return nil }
        return "Day \(workdayNumber) of \(workdayCount)"
    }
}

struct WidgetScheduleSnapshot: Codable, Equatable, Sendable {
    let userID: String
    let generatedAt: Date
    let savedAt: Date
    let items: [WidgetScheduleItem]
}

struct WidgetSnapshotStore: Sendable {
    private let directory: URL?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: AngelTreeWidgetConfiguration.appGroupIdentifier
        )
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func read() -> WidgetScheduleSnapshot? {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? decoder.decode(WidgetScheduleSnapshot.self, from: data)
    }

    @discardableResult
    func write(_ snapshot: WidgetScheduleSnapshot) -> Bool {
        guard let fileURL else { return false }
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try encoder.encode(snapshot).write(to: fileURL, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    @discardableResult
    func remove() -> Bool {
        guard let fileURL else { return false }
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return true }
        do {
            try FileManager.default.removeItem(at: fileURL)
            return true
        } catch {
            return false
        }
    }

    private var fileURL: URL? {
        directory?.appendingPathComponent(AngelTreeWidgetConfiguration.snapshotFileName)
    }
}
