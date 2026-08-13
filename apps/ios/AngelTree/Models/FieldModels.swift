import Foundation

enum MobilePartyKind: String, Codable, Hashable, Sendable {
    case customer
    case organization

    var label: String { self == .organization ? "Organization" : "Customer" }
}

struct MobilePartySearchResult: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let kind: MobilePartyKind
    let name: String
    let contactName: String?
    let email: String?
    let phone: String?
    let address: String?
}

struct MobileServiceLocation: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let label: String?
    let fullAddress: String
    let accessNotes: String?
    let gateCode: String?
    let serviceNotes: String?
}

struct MobilePartyWorkSummary: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let status: String
    let serviceType: String?
    let priority: String
    let scope: String?
    let scheduledStartAt: String?
    let scheduledEndAt: String?
    let completedAt: String?
    let serviceLocationId: String?
    let serviceLocation: MobileServiceLocation?

    var scheduledStartDate: Date? { scheduledStartAt.flatMap(CRMDateParser.date(from:)) }
    var title: String {
        serviceType?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Tree service"
    }
}

struct MobileRecordSummary: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let number: String?
    let status: String
    let date: String?
}

struct MobilePartyDetail: Codable, Equatable, Sendable {
    struct Contact: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
        let role: String?
        let email: String?
        let phone: String?
    }

    let id: String
    let kind: MobilePartyKind
    let name: String
    let contactName: String?
    let email: String?
    let phone: String?
    let status: String
    let serviceLocations: [MobileServiceLocation]
    let contacts: [Contact]
    let jobs: [MobilePartyWorkSummary]
    let proposals: [MobileRecordSummary]
    let invoices: [MobileRecordSummary]
}

struct MobileJobDetail: Codable, Equatable, Identifiable, Sendable {
    struct Party: Codable, Equatable, Sendable {
        let id: String
        let kind: MobilePartyKind
        let name: String
        let email: String?
        let phone: String?
    }

    struct Note: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let body: String
        let createdAt: String
    }

    struct Employee: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
    }

    struct WorkSession: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let startsAt: String
        let endsAt: String?
        let status: String
        let notes: String?
    }

    let id: String
    let status: String
    let serviceType: String?
    let priority: String
    let scheduledStartAt: String?
    let scheduledEndAt: String?
    let scope: String?
    let completedAt: String?
    let contractingParty: Party?
    let serviceLocation: MobileServiceLocation?
    let crewVisibleNotes: [Note]
    let assignedEmployees: [Employee]
    let workSessions: [WorkSession]
    let equipment: [String]
    let materials: [String]
}

struct CustomerSearchPayload: Codable, Sendable {
    let results: [MobilePartySearchResult]
}

struct PartyDetailPayload: Codable, Sendable {
    let party: MobilePartyDetail
}

struct JobDetailPayload: Codable, Sendable {
    let job: MobileJobDetail
    let warning: String?
}
