import Foundation

enum ScheduleScope: String, Codable, CaseIterable, Sendable {
    case mine
    case team

    var label: String {
        switch self {
        case .mine: "My work"
        case .team: "Team"
        }
    }
}

struct MobileSchedulePayload: Codable, Equatable, Sendable {
    struct Range: Codable, Equatable, Sendable {
        let startDate: String
        let endDate: String
    }

    let generatedAt: String
    let range: Range
    let scope: ScheduleScope
    let items: [MobileScheduleItem]
}

struct MobileScheduleItem: Codable, Equatable, Hashable, Identifiable, Sendable {
    struct Party: Codable, Equatable, Hashable, Sendable {
        enum Kind: String, Codable, Sendable {
            case customer
            case organization
        }

        let id: String?
        let kind: Kind
        let name: String
        let email: String?
        let phone: String?
    }

    struct Location: Codable, Equatable, Hashable, Sendable {
        let label: String?
        let fullAddress: String?
        let accessNotes: String?
        let serviceNotes: String?
    }

    struct Assignee: Codable, Equatable, Hashable, Identifiable, Sendable {
        let id: String
        let authUserId: String?
        let name: String
    }

    let id: String
    let source: String
    let title: String
    let eventType: String
    let status: String
    let startsAt: String
    let endsAt: String?
    let allDay: Bool
    let jobId: String?
    let serviceLocationId: String?
    let party: Party?
    let location: Location?
    let assignees: [Assignee]
    let customerFacingScope: String?
    let teamNotes: String?
    let equipment: [String]
    let materials: [String]
    let workdayNumber: Int?
    let workdayCount: Int?

    var startsAtDate: Date? { CRMDateParser.date(from: startsAt) }
    var endsAtDate: Date? { endsAt.flatMap(CRMDateParser.date(from:)) }

    var operationalTitle: String {
        if let partyName = party?.name, !partyName.isEmpty {
            return partyName
        }
        return title
    }

    var typeLabel: String {
        eventType.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var statusLabel: String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var workdayLabel: String? {
        guard let workdayNumber, let workdayCount, workdayCount > 1 else { return nil }
        return "Day \(workdayNumber) of \(workdayCount)"
    }
}

enum CRMDateParser {
    static func date(from value: String) -> Date? {
        let withFractionalSeconds = ISO8601DateFormatter()
        withFractionalSeconds.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractionalSeconds.date(from: value) {
            return date
        }

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }
}
