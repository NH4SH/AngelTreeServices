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
    func updateQuote(id: String, input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail
    func duplicateQuote(id: String) async throws -> MobileQuoteDetail
    func invoiceDirectory(scope: MobileInvoiceScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileInvoicePage, cached: Bool)
    func invoiceDetail(id: String, userID: String, allowCached: Bool) async throws -> (payload: MobileInvoicePayload, cached: Bool)
    func recordManualPayment(invoiceID: String, input: MobileManualPaymentRequest) async throws -> MobileInvoicePayload
}

actor LiveFieldDataService: FieldDataService {
    private let authentication: any AuthenticationService
    private let api: any MobileAPIClientProtocol
    private let cache: FieldCache

    init(authentication: any AuthenticationService, api: any MobileAPIClientProtocol, cache: FieldCache) {
        self.authentication = authentication
        self.api = api
        self.cache = cache
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
}
