import Foundation

enum MobilePartyKind: String, Codable, Hashable, Sendable {
    case customer
    case organization

    var label: String { self == .organization ? "Organization" : "Customer" }
}

enum MobileJobDirectoryScope: String, CaseIterable, Codable, Hashable, Sendable {
    case upcoming
    case active
    case unscheduled
    case completed

    var label: String {
        switch self {
        case .upcoming: "Upcoming"
        case .active: "Active"
        case .unscheduled: "Unscheduled"
        case .completed: "Completed"
        }
    }
}

enum MobileQuoteScope: String, CaseIterable, Codable, Hashable, Sendable {
    case draft, sent, approved, declined, closed

    var label: String {
        switch self {
        case .draft: "Draft"
        case .sent: "Sent"
        case .approved: "Accepted"
        case .declined: "Declined"
        case .closed: "Closed"
        }
    }
}

struct MobileQuoteLine: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String?
    var name: String
    var description: String?
    var quantity: Double
    var unitPriceCents: Int
    let totalCents: Int?

    var stableID: String { id ?? "\(name)-\(quantity)-\(unitPriceCents)" }
}

struct MobileQuoteDirectoryItem: Codable, Equatable, Hashable, Identifiable, Sendable {
    struct Party: Codable, Equatable, Hashable, Sendable {
        let id: String
        let kind: MobilePartyKind
        let name: String
    }
    struct Location: Codable, Equatable, Hashable, Sendable {
        let id: String
        let label: String?
        let fullAddress: String
    }
    let id: String
    let proposalNumber: String?
    let status: String
    let title: String
    let totalCents: Int
    let createdAt: String
    let sentAt: String?
    let approvedAt: String?
    let expiresAt: String?
    let updatedAt: String
    let party: Party?
    let serviceLocation: Location
    let linkedJobId: String?
    let linkedInvoiceId: String?
}

struct MobileQuoteDetail: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let proposalNumber: String?
    let status: String
    let title: String
    let totalCents: Int
    let createdAt: String
    let sentAt: String?
    let approvedAt: String?
    let expiresAt: String?
    let updatedAt: String
    let party: MobileQuoteDirectoryItem.Party?
    let serviceLocation: MobileQuoteDirectoryItem.Location
    let linkedJobId: String?
    let linkedInvoiceId: String?
    let recipientContactId: String?
    let approvalContactId: String?
    let customerMessage: String?
    let lines: [MobileQuoteLine]
    let portalStatus: String
}

struct MobileQuoteWriteRequest: Codable, Equatable, Sendable {
    let customerId: String?
    let organizationId: String?
    let serviceLocationId: String
    let customerMessage: String?
    let expiresAt: String?
    let recipientContactId: String?
    let approvalContactId: String?
    let lines: [MobileQuoteLine]
}

struct MobileQuoteDirectoryPayload: Codable, Sendable { let results: [MobileQuoteDirectoryItem]; let nextCursor: String? }
struct MobileQuotePage: Equatable, Sendable { let results: [MobileQuoteDirectoryItem]; let nextCursor: String? }
struct MobileQuotePayload: Codable, Sendable { let quote: MobileQuoteDetail }

enum MobileInvoiceScope: String, CaseIterable, Codable, Hashable, Sendable {
    case draft, outstanding, paid, overdue, void
    var label: String { rawValue.capitalized }
}

struct MobileInvoiceDirectoryItem: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String; let invoiceNumber: String?; let status: String; let totalCents: Int; let balanceDueCents: Int
    let createdAt: String; let sentAt: String?; let paidAt: String?; let dueAt: String?; let updatedAt: String
    let party: MobileQuoteDirectoryItem.Party?; let serviceLocation: MobileQuoteDirectoryItem.Location
    let linkedJobId: String?; let linkedQuoteId: String?
}

struct MobileInvoiceLine: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String; let name: String; let description: String?; let quantity: Double; let unitPriceCents: Int; let totalCents: Int
}
struct MobileInvoicePayment: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String; let amountCents: Int; let method: String?; let source: String; let status: String; let paidAt: String?; let reference: String?; let notes: String?
}
struct MobileInvoiceActivity: Codable, Equatable, Hashable, Identifiable, Sendable { let id: String; let eventType: String; let createdAt: String }
struct MobileInvoiceDetail: Codable, Equatable, Hashable, Identifiable, Sendable {
    let id: String; let invoiceNumber: String?; let status: String; let totalCents: Int; let balanceDueCents: Int
    let createdAt: String; let sentAt: String?; let paidAt: String?; let dueAt: String?; let updatedAt: String
    let party: MobileQuoteDirectoryItem.Party?; let serviceLocation: MobileQuoteDirectoryItem.Location
    let linkedJobId: String?; let linkedQuoteId: String?; let lines: [MobileInvoiceLine]; let payments: [MobileInvoicePayment]
    let activity: [MobileInvoiceActivity]; let portalStatus: String; let canRecordManualPayment: Bool; let customerPayable: Bool; let reminderEligible: Bool
}
struct MobileInvoiceDirectoryPayload: Codable, Sendable { let results: [MobileInvoiceDirectoryItem]; let nextCursor: String? }
struct MobileInvoicePage: Equatable, Sendable { let results: [MobileInvoiceDirectoryItem]; let nextCursor: String? }
struct MobileInvoicePayload: Codable, Sendable { let invoice: MobileInvoiceDetail; let canRecordPayments: Bool }
struct MobileManualPaymentRequest: Codable, Equatable, Sendable { let amountCents: Int; let method: String; let receivedAt: String; let reference: String?; let notes: String? }

struct MobileJobDirectoryItem: Codable, Equatable, Hashable, Identifiable, Sendable {
    struct Party: Codable, Equatable, Hashable, Sendable {
        let id: String
        let kind: MobilePartyKind
        let name: String
    }

    struct ServiceLocation: Codable, Equatable, Hashable, Sendable {
        let id: String
        let fullAddress: String
        let city: String?
    }

    let id: String
    let status: String
    let operationalState: String
    let priority: String
    let serviceType: String?
    let title: String
    let party: Party?
    let serviceLocation: ServiceLocation?
    let scheduledStartAt: String?
    let scheduledEndAt: String?
    let completedAt: String?
    let updatedAt: String
    let assignedCrewNames: [String]
    let workdayCount: Int

    var scheduledStartDate: Date? { scheduledStartAt.flatMap(CRMDateParser.date(from:)) }
}

struct MobileJobDirectoryPayload: Codable, Sendable {
    let results: [MobileJobDirectoryItem]
    let nextCursor: String?
}

struct MobileJobDirectoryPage: Equatable, Sendable {
    let results: [MobileJobDirectoryItem]
    let nextCursor: String?
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
    let nextCursor: String?
}

struct MobilePartyDirectoryPage: Equatable, Sendable {
    let results: [MobilePartySearchResult]
    let nextCursor: String?
}

struct MobilePartyCreateRequest: Codable, Equatable, Sendable {
    struct ServiceLocation: Codable, Equatable, Sendable {
        let street: String
        let city: String
        let state: String
        let postalCode: String?
    }

    let kind: MobilePartyKind
    let name: String
    let contactName: String?
    let email: String?
    let phone: String?
    let organizationType: String?
    let serviceLocation: ServiceLocation?
}

struct CreatedPartyPayload: Codable, Sendable {
    let party: MobilePartySearchResult
}

struct PartyDetailPayload: Codable, Sendable {
    let party: MobilePartyDetail
}

struct JobDetailPayload: Codable, Sendable {
    let job: MobileJobDetail
    let warning: String?
}
