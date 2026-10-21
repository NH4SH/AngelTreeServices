import Foundation

protocol FieldDataService: Sendable {
    func partyDirectory(cursor: String?, limit: Int) async throws -> MobilePartyDirectoryPage
    func searchParties(query: String) async throws -> [MobilePartySearchResult]
    func createParty(_ input: MobilePartyCreateRequest) async throws -> MobilePartySearchResult
    func jobDirectory(
        scope: MobileJobDirectoryScope,
        cursor: String?,
        query: String?,
        userID: String,
        allowCached: Bool
    ) async throws -> (page: MobileJobDirectoryPage, cached: Bool)
    func recentParties(userID: String) async -> [MobilePartySearchResult]
    func partyDetail(
        kind: MobilePartyKind,
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobilePartyDetail, cached: Bool)
    func jobDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileJobDetail, cached: Bool)
    func quoteDirectory(scope: MobileQuoteScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileQuotePage, cached: Bool)
    func quoteDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileQuoteDetail, cached: Bool)
    func createQuote(_ input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail
    func createQuoteCopy(_ input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail
    func updateQuote(id: String, input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail
    func duplicateQuote(id: String) async throws -> MobileQuoteDetail
    func invoiceDirectory(scope: MobileInvoiceScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileInvoicePage, cached: Bool)
    func invoiceDetail(id: String, userID: String, allowCached: Bool) async throws -> (payload: MobileInvoicePayload, cached: Bool)
    func recordManualPayment(invoiceID: String, input: MobileManualPaymentRequest) async throws -> MobileInvoicePayload
    func resolveManualPayment(invoiceID: String, requestID: String) async throws -> MobileInvoicePayload
    func recoveryPartyDetail(kind: MobilePartyKind, id: String, session: MobileQuoteRecoverySession) async throws -> MobilePartyDetail
    func inspectQuoteRecovery(context: MobileQuoteRecoveryContext, userID: String) async throws -> MobileQuoteRecoveryDocument
    func openQuoteRecovery(context: MobileQuoteRecoveryContext, userID: String) async throws -> MobileQuoteRecoverySession
    func saveQuoteDraft(_ draft: MobileQuoteEditorDraft, session: MobileQuoteRecoverySession) async throws
    func quoteRecoveryDocument(_ session: MobileQuoteRecoverySession) async throws -> MobileQuoteRecoveryDocument
    func submitQuoteRecovery(_ pending: MobileQuotePendingRequest, session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail
    func retryQuoteRecovery(_ session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail
    func reviewQuoteRecovery(_ session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail
    func acknowledgeQuoteRecovery(quoteID: String, session: MobileQuoteRecoverySession) async throws
    func resetQuoteRecovery(_ session: MobileQuoteRecoverySession, reviewedRequest: Bool) async throws -> MobileQuoteRecoverySession
}

actor LiveFieldDataService: FieldDataService {
    private let authentication: any AuthenticationService
    private let api: any MobileAPIClientProtocol
    private let cache: FieldCache
    private let recoveryEnvironment: String?
    private let recovery: QuoteRecoveryStore

    init(authentication: any AuthenticationService, api: any MobileAPIClientProtocol, cache: FieldCache, recoveryEnvironment: String? = nil, recovery: QuoteRecoveryStore = .shared) {
        self.authentication = authentication
        self.api = api
        self.cache = cache
        self.recoveryEnvironment = recoveryEnvironment
        self.recovery = recovery
    }

    func searchParties(query: String) async throws -> [MobilePartySearchResult] {
        let token = try await authentication.validAccessToken()
        return try await api.searchCustomers(query: query, accessToken: token)
    }

    func partyDirectory(cursor: String?, limit: Int) async throws -> MobilePartyDirectoryPage {
        let token = try await authentication.validAccessToken()
        return try await api.customerDirectory(cursor: cursor, limit: limit, accessToken: token)
    }

    func createParty(_ input: MobilePartyCreateRequest) async throws -> MobilePartySearchResult {
        let token = try await authentication.validAccessToken()
        return try await api.createParty(input, accessToken: token)
    }

    func jobDirectory(
        scope: MobileJobDirectoryScope,
        cursor: String?,
        query: String?,
        userID: String,
        allowCached: Bool
    ) async throws -> (page: MobileJobDirectoryPage, cached: Bool) {
        let normalizedQuery = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        if allowCached, cursor == nil, normalizedQuery?.isEmpty != false,
           let cached = await cache.readJobDirectory(userID: userID, scope: scope) {
            return (.init(results: cached, nextCursor: nil), true)
        }

        let token = try await authentication.validAccessToken()
        let page = try await api.jobs(
            scope: scope,
            cursor: cursor,
            limit: 25,
            query: normalizedQuery,
            accessToken: token
        )
        if cursor == nil, normalizedQuery?.isEmpty != false {
            await cache.writeJobDirectory(page.results, userID: userID, scope: scope)
        }
        return (page, false)
    }

    func recentParties(userID: String) async -> [MobilePartySearchResult] {
        await cache.readRecentParties(userID: userID)
    }

    func partyDetail(
        kind: MobilePartyKind,
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobilePartyDetail, cached: Bool) {
        if allowCached, let cached = await cache.readParty(userID: userID, kind: kind, id: id) {
            await cache.recordRecentParty(cached, userID: userID)
            return (cached, true)
        }
        let token = try await authentication.validAccessToken()
        let detail = try await api.partyDetail(kind: kind, id: id, accessToken: token)
        await cache.writeParty(detail, userID: userID)
        return (detail, false)
    }

    func jobDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileJobDetail, cached: Bool) {
        if allowCached, let cached = await cache.readJob(userID: userID, id: id) {
            return (cached, true)
        }
        let token = try await authentication.validAccessToken()
        let detail = try await api.jobDetail(jobID: id, accessToken: token)
        await cache.writeJob(detail, userID: userID)
        return (detail, false)
    }

    func quoteDirectory(scope: MobileQuoteScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileQuotePage, cached: Bool) {
        let normalized = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        if allowCached, cursor == nil, normalized?.isEmpty != false, let cached = await cache.readQuoteDirectory(userID: userID, scope: scope) {
            return (.init(results: cached, nextCursor: nil), true)
        }
        let token = try await authentication.validAccessToken()
        let page = try await api.quotes(scope: scope, cursor: cursor, limit: 25, query: normalized, accessToken: token)
        if cursor == nil, normalized?.isEmpty != false { await cache.writeQuoteDirectory(page.results, userID: userID, scope: scope) }
        return (page, false)
    }

    func quoteDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileQuoteDetail, cached: Bool) {
        if allowCached, let cached = await cache.readQuote(userID: userID, id: id) { return (cached, true) }
        let token = try await authentication.validAccessToken()
        let detail = try await api.quoteDetail(id: id, accessToken: token)
        await cache.writeQuote(detail, userID: userID)
        return (detail, false)
    }

    func createQuote(_ input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail {
        let token = try await authentication.validAccessToken()
        return try await api.createQuote(input, accessToken: token)
    }

    func createQuoteCopy(_ input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail {
        let token = try await authentication.validAccessToken()
        return try await api.createQuoteCopy(input, accessToken: token)
    }

    func updateQuote(id: String, input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail {
        let token = try await authentication.validAccessToken()
        return try await api.updateQuote(id: id, input: input, accessToken: token)
    }

    func duplicateQuote(id: String) async throws -> MobileQuoteDetail {
        let token = try await authentication.validAccessToken()
        return try await api.duplicateQuote(id: id, accessToken: token)
    }

    func invoiceDirectory(scope: MobileInvoiceScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileInvoicePage, cached: Bool) {
        let normalized = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        if allowCached, cursor == nil, normalized?.isEmpty != false, let cached = await cache.readInvoiceDirectory(userID: userID, scope: scope) { return (.init(results: cached, nextCursor: nil), true) }
        let token = try await authentication.validAccessToken(); let page = try await api.invoices(scope: scope, cursor: cursor, limit: 25, query: normalized, accessToken: token)
        if cursor == nil, normalized?.isEmpty != false { await cache.writeInvoiceDirectory(page.results, userID: userID, scope: scope) }
        return (page, false)
    }
    func invoiceDetail(id: String, userID: String, allowCached: Bool) async throws -> (payload: MobileInvoicePayload, cached: Bool) {
        if allowCached, let cached = await cache.readInvoice(userID: userID, id: id) { return (.init(invoice: cached, canRecordPayments: false), true) }
        let token = try await authentication.validAccessToken(); let payload = try await api.invoiceDetail(id: id, accessToken: token); await cache.writeInvoice(payload.invoice, userID: userID); return (payload, false)
    }
    func recordManualPayment(invoiceID: String, input: MobileManualPaymentRequest) async throws -> MobileInvoicePayload {
        let token = try await authentication.validAccessToken(); return try await api.recordManualPayment(invoiceID: invoiceID, input: input, accessToken: token)
    }
    func resolveManualPayment(invoiceID: String, requestID: String) async throws -> MobileInvoicePayload {
        let token = try await authentication.validAccessToken(); return try await api.resolveManualPayment(invoiceID: invoiceID, requestID: requestID, accessToken: token)
    }
}


extension LiveFieldDataService {
    func recoveryPartyDetail(kind: MobilePartyKind, id: String, session: MobileQuoteRecoverySession) async throws -> MobilePartyDetail {
        try await assertRecoverySession(session)
        let token = try await recoveryToken(session.userID)
        let detail = try await api.partyDetail(kind: kind, id: id, accessToken: token)
        try await assertRecoverySession(session)
        guard detail.kind == kind && detail.id.lowercased() == id.lowercased() else { throw MobileAPIError.invalidResponse }
        await cache.writeParty(detail, userID: session.userID)
        try await assertRecoverySession(session)
        return detail
    }
    func inspectQuoteRecovery(context: MobileQuoteRecoveryContext, userID: String) async throws -> MobileQuoteRecoveryDocument {
        guard let recoveryEnvironment else { throw QuoteRecoveryError.unavailable }
        try await assertRecoveryAccount(userID)
        let doc = try await recovery.inspect(environment: recoveryEnvironment, userID: userID, context: context)
        try await assertRecoveryAccount(userID)
        return doc
    }
    func openQuoteRecovery(context: MobileQuoteRecoveryContext, userID: String) async throws -> MobileQuoteRecoverySession {
        guard let recoveryEnvironment else { throw QuoteRecoveryError.unavailable }
        try await assertRecoveryAccount(userID)
        let session = try await recovery.open(environment: recoveryEnvironment, userID: userID, context: context)
        try await assertRecoveryAccount(userID)
        return session
    }
    func saveQuoteDraft(_ draft: MobileQuoteEditorDraft, session: MobileQuoteRecoverySession) async throws {
        try await assertRecoverySession(session)
        try await recovery.saveDraft(draft, session: session)
    }
    func quoteRecoveryDocument(_ session: MobileQuoteRecoverySession) async throws -> MobileQuoteRecoveryDocument {
        try await assertRecoverySession(session)
        let doc = try await recovery.document(session)
        try await assertRecoverySession(session)
        return doc
    }
    func submitQuoteRecovery(_ pending: MobileQuotePendingRequest, session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail {
        try await assertRecoverySession(session)
        try validateRecoveryKind(pending.kind, context: session.context)
        let stored = try await recovery.prepare(pending, session: session)
        return try await performQuoteRecovery(stored, session: session)
    }
    func retryQuoteRecovery(_ session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail {
        try await assertRecoverySession(session)
        let doc = try await recovery.document(session)
        guard let pending = doc.pending ?? doc.rejected else { throw QuoteRecoveryError.noRequest }
        guard pending.kind != .emptyCopy else { throw QuoteRecoveryError.pendingReview }
        let stored = doc.pending != nil ? pending : try await recovery.prepare(pending, session: session)
        return try await performQuoteRecovery(stored, session: session)
    }
    func reviewQuoteRecovery(_ session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail {
        let doc = try await quoteRecoveryDocument(session)
        let id = doc.pending?.confirmedQuoteID ?? doc.completedQuoteID ?? (doc.pending?.kind == .edit ? session.context.quoteID : nil)
        guard let id else { throw QuoteRecoveryError.pendingReview }
        try await assertRecoverySession(session)
        let token = try await recoveryToken(session.userID)
        let detail = try await api.quoteDetail(id: id, accessToken: token)
        try await assertRecoverySession(session)
        guard detail.id.lowercased() == id.lowercased() else { throw MobileAPIError.invalidResponse }
        return detail
    }
    func acknowledgeQuoteRecovery(quoteID: String, session: MobileQuoteRecoverySession) async throws {
        try await assertRecoverySession(session)
        try await recovery.acknowledge(quoteID: quoteID, session: session)
        try await assertRecoverySession(session)
    }
    func resetQuoteRecovery(_ session: MobileQuoteRecoverySession, reviewedRequest: Bool = false) async throws -> MobileQuoteRecoverySession {
        try await assertRecoverySession(session)
        let fresh = try await recovery.startAnother(session, reviewedRequest: reviewedRequest)
        try await assertRecoverySession(fresh)
        return fresh
    }
    private func performQuoteRecovery(_ pending: MobileQuotePendingRequest, session: MobileQuoteRecoverySession) async throws -> MobileQuoteDetail {
        try validateRecoveryKind(pending.kind, context: session.context)
        try await assertRecoverySession(session)
        let token = try await recoveryToken(session.userID)
        try await recovery.beginSend(session)
        do {
        let saved: MobileQuoteDetail
        switch pending.kind {
        case .create: saved = try await api.createQuote(pending.request, accessToken: token)
        case .copy: saved = try await api.createQuoteCopy(pending.request, accessToken: token)
        case .edit:
            guard let id = session.context.quoteID else { throw QuoteRecoveryError.unavailable }
            saved = try await api.updateQuote(id: id, input: pending.request, accessToken: token)
        case .emptyCopy:
            guard let id = session.context.quoteID else { throw QuoteRecoveryError.unavailable }
            saved = try await api.duplicateQuote(id: id, accessToken: token)
        }
        try await assertRecoverySession(session)
        guard UUID(uuidString: saved.id) != nil, let requestID = pending.request.requestId else { throw MobileAPIError.invalidResponse }
        switch pending.kind {
        case .create, .copy:
            guard saved.creationRequestId == requestID, saved.creationReplayed != nil else { throw MobileAPIError.invalidResponse }
            if pending.kind == .copy, UUID(uuidString: saved.id) == session.context.quoteID.flatMap(UUID.init(uuidString:)) { throw MobileAPIError.invalidResponse }
        case .edit:
            guard saved.id.lowercased() == session.context.quoteID?.lowercased(), saved.quoteEditVersion == 1,
                  let before = pending.request.expectedRevision, before > 0, before < Int.max,
                  let after = saved.editRevision, after > before else { throw MobileAPIError.invalidResponse }
        case .emptyCopy:
            guard UUID(uuidString: saved.id) != session.context.quoteID.flatMap(UUID.init(uuidString:)) else { throw MobileAPIError.invalidResponse }
        }
        try await recovery.confirm(quoteID: saved.id, requestID: requestID, session: session)
        try await assertRecoverySession(session)
        await recovery.endSend(session)
        return saved
        } catch {
            await recovery.endSend(session)
            if case MobileAPIError.quoteNotSubmitted = error, let id = pending.request.requestId {
                try? await recovery.releaseRejectedFirstAttempt(requestID: id, session: session)
            }
            throw error
        }
    }
    private func validateRecoveryKind(_ kind: MobileQuotePendingRequest.Kind, context: MobileQuoteRecoveryContext) throws {
        switch (context, kind) { case (.newProposal, .create), (.edit, .edit), (.copy, .copy), (.copy, .emptyCopy): return; default: throw QuoteRecoveryError.pendingReview }
    }
    private func assertRecoverySession(_ session: MobileQuoteRecoverySession) async throws {
        guard let recoveryEnvironment, session.scope == QuoteRecoveryStore.scope(environment: recoveryEnvironment, userID: session.userID) else { throw QuoteRecoveryError.accountChanged }
        try await assertRecoveryAccount(session.userID)
    }
    private func assertRecoveryAccount(_ userID: String) async throws {
        let identity: AuthIdentity?
        do { identity = try await authentication.restoreSession() }
        catch { throw QuoteRecoveryError.accountChanged }
        guard let expected = UUID(uuidString: userID), let identity,
              UUID(uuidString: identity.userID) == expected else { throw QuoteRecoveryError.accountChanged }
    }
    private func recoveryToken(_ userID: String) async throws -> String {
        try await assertRecoveryAccount(userID)
        let token: String
        do { token = try await authentication.validAccessToken() }
        catch { throw MobileAPIError.authenticationRequired }
        // Scope binding only; the server still verifies the signature and live access.
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { throw QuoteRecoveryError.accountChanged }
        var encoded = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = object["sub"] as? String, let subject = UUID(uuidString: sub), subject == UUID(uuidString: userID) else { throw QuoteRecoveryError.accountChanged }
        try await assertRecoveryAccount(userID)
        return token
    }
}
