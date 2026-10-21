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
    var editRevision: Int? = nil
    var quoteEditVersion: Int? = nil
    var creationRequestId: String? = nil
    var creationReplayed: Bool? = nil
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
    var expectedRevision: Int? = nil
    var requestId: String? = nil
}

/// One editor keeps the same request identity across retries and validation corrections.
/// This is intentionally in-memory; closing the editor requires reviewing proposals.
struct MobileQuoteCreationAttempt {
    private let id = UUID().uuidString.lowercased()
    private(set) var submitted: MobileQuoteWriteRequest?

    mutating func prepare(_ input: MobileQuoteWriteRequest) -> MobileQuoteWriteRequest {
        var request = input
        request.requestId = id
        // The database rejects changed details if this identity already saved a
        // proposal. Reuse it even after rejection: never mint a replacement here.
        submitted = request
        return request
    }
}

/// A deliberate copy freezes the displayed proposal once. Retrying must not
/// rebuild it from a source that may have changed since the first request.
struct MobileQuoteDuplicateAttempt {
    let sourceQuoteID: String
    let request: MobileQuoteWriteRequest
    private(set) var confirmed: MobileQuoteDetail?

    init(source: MobileQuoteDetail, now: Date = Date()) throws {
        guard UUID(uuidString: source.id) != nil, let party = source.party,
              UUID(uuidString: party.id) != nil, UUID(uuidString: source.serviceLocation.id) != nil,
              !source.lines.isEmpty, source.lines.count <= 1000 else {
            throw MobileAPIError.requestRejected("Refresh this proposal before making a copy.")
        }
        sourceQuoteID = source.id
        let expiration = source.expiresAt.flatMap(CRMDateParser.date(from:))
        request = .init(
            customerId: party.kind == .customer ? party.id : nil,
            organizationId: party.kind == .organization ? party.id : nil,
            serviceLocationId: source.serviceLocation.id,
            customerMessage: source.customerMessage,
            expiresAt: expiration.map { $0 > now } == true ? source.expiresAt : nil,
            recipientContactId: source.recipientContactId,
            approvalContactId: source.approvalContactId,
            lines: source.lines.map { .init(id: nil, name: $0.name, description: $0.description,
                quantity: $0.quantity, unitPriceCents: $0.unitPriceCents, totalCents: nil) },
            requestId: UUID().uuidString.lowercased()
        )
    }

    mutating func confirm(_ quote: MobileQuoteDetail) throws -> Bool {
        guard quote.creationRequestId == request.requestId, let replayed = quote.creationReplayed,
              let savedID = UUID(uuidString: quote.id), savedID != UUID(uuidString: sourceQuoteID) else {
            throw MobileAPIError.requestRejected("The copy could not be confirmed. Keep this proposal open and retry the same copy request.")
        }
        if let confirmed, confirmed.id != quote.id {
            throw MobileAPIError.requestRejected("The saved copy could not be confirmed. Review proposals before making another copy.")
        }
        confirmed = quote
        return replayed
    }
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
struct MobileManualPaymentResult: Codable, Sendable { let requestId: String; let paymentId: String?; let state: String; let replayed: Bool? }
struct MobileInvoicePayload: Codable, Sendable {
    let invoice: MobileInvoiceDetail; let canRecordPayments: Bool
    let manualPayment: MobileManualPaymentResult?; let manualPaymentRequestVersion: Int?
    init(invoice: MobileInvoiceDetail, canRecordPayments: Bool, manualPayment: MobileManualPaymentResult? = nil, manualPaymentRequestVersion: Int? = nil) {
        self.invoice = invoice; self.canRecordPayments = canRecordPayments; self.manualPayment = manualPayment; self.manualPaymentRequestVersion = manualPaymentRequestVersion
    }
}
struct MobileManualPaymentRequest: Codable, Equatable, Sendable { let requestId: String; let amountCents: Int; let method: String; let receivedAt: String; let reference: String?; let notes: String? }

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

// Recovery keeps raw editor text independently from the immutable submitted request.
struct MobileQuoteEditorLine: Codable, Equatable, Identifiable, Sendable {
    var id = UUID()
    var persistedID: String?
    var name = ""
    var description = ""
    var quantity = "1"
    var unitPrice = ""
    static func empty() -> Self { .init() }
    var unitPriceCents: Int? {
        guard let decimal = Decimal(string: unitPrice), decimal >= 0 else { return nil }
        let number = NSDecimalNumber(decimal: decimal * 100)
        guard number != .notANumber, number.compare(NSDecimalNumber(value: Int32.max)) != .orderedDescending else { return nil }
        return number.rounding(accordingToBehavior: NSDecimalNumberHandler(roundingMode: .plain, scale: 0, raiseOnExactness: false, raiseOnOverflow: false, raiseOnUnderflow: false, raiseOnDivideByZero: false)).intValue
    }
    var totalCents: Int {
        guard let quantity = Double(quantity), quantity.isFinite, let price = unitPriceCents else { return 0 }
        let amount = (quantity * Double(price)).rounded()
        return amount >= 0 && amount <= Double(Int32.max) ? Int(amount) : 0
    }
    var requestLine: MobileQuoteLine? {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let value = Double(quantity), value.isFinite, value > 0, let price = unitPriceCents else { return nil }
        return .init(id: persistedID, name: name, description: description.isEmpty ? nil : description, quantity: value, unitPriceCents: price, totalCents: nil)
    }
}

struct MobileQuoteEditorDraft: Codable, Equatable, Sendable {
    var party: MobilePartySearchResult?
    var customerMessage = ""
    var serviceLocationID = ""
    var recipientID = ""
    var approvalID = ""
    var expiration = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()
    var lines: [MobileQuoteEditorLine] = [.empty()]
    var expectedRevision: Int?
    var hasEditCapability = false
    var requestID = UUID().uuidString.lowercased()
}

enum MobileQuoteRecoveryContext: Codable, Equatable, Sendable {
    case newProposal, edit(String), copy(String)
    var key: String {
        switch self { case .newProposal: return "new"; case .edit(let id): return "edit:" + id.lowercased(); case .copy(let id): return "copy:" + id.lowercased() }
    }
    var quoteID: String? { switch self { case .newProposal: nil; case .edit(let id), .copy(let id): id } }
}

struct MobileQuotePendingRequest: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case create, edit, copy, emptyCopy }
    let kind: Kind
    let request: MobileQuoteWriteRequest
    var confirmedQuoteID: String?
    var dispatchCount = 0
}

struct MobileQuoteRecoveryDocument: Codable, Equatable, Sendable {
    var version = 1
    var draft: MobileQuoteEditorDraft?
    var pending: MobileQuotePendingRequest?
    var rejected: MobileQuotePendingRequest?
    var completedQuoteID: String?
}

struct MobileQuoteRecoverySession: Sendable {
    let scope: String
    let userID: String
    let context: MobileQuoteRecoveryContext
    let lease: UUID
    let document: MobileQuoteRecoveryDocument
}

enum QuoteRecoveryError: LocalizedError {
    case unavailable, openedElsewhere, pendingReview, noRequest, accountChanged
    var errorDescription: String? {
        switch self {
        case .unavailable: "Saved proposal recovery could not be read or written. Unlock the device and try again. Keep this draft and review previous requests before starting another."
        case .openedElsewhere: "This draft was opened in another editor. Reopen it to continue safely."
        case .pendingReview: "A previous request needs review. Retry or review it before starting another."
        case .noRequest: "There is no saved request to retry."
        case .accountChanged: "Sign in to the account that owns this draft before continuing."
        }
    }
}
