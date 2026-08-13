import Foundation

enum WidgetDeepLink: Equatable, Hashable, Sendable {
    case job(id: String)
    case scheduleEvent(id: String)
    case today

    var url: URL {
        switch self {
        case .job(let id):
            return URL(string: "angeltree://job/\(Self.safePath(id))")!
        case .scheduleEvent(let id):
            return URL(string: "angeltree://schedule/\(Self.safePath(id))")!
        case .today:
            return URL(string: "angeltree://today")!
        }
    }

    init?(url: URL) {
        guard url.scheme?.lowercased() == "angeltree" else { return nil }
        let identifier = url.pathComponents.dropFirst().first
        switch url.host?.lowercased() {
        case "job":
            guard let identifier, !identifier.isEmpty else { return nil }
            self = .job(id: identifier)
        case "schedule":
            guard let identifier, !identifier.isEmpty else { return nil }
            self = .scheduleEvent(id: identifier)
        case "today":
            self = .today
        default:
            return nil
        }
    }

    static func forItem(_ item: WidgetScheduleItem) -> WidgetDeepLink {
        if let jobID = item.jobID { return .job(id: jobID) }
        return .scheduleEvent(id: item.id)
    }

    private static func safePath(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
}
