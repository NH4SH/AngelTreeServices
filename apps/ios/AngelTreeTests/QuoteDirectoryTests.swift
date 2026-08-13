import XCTest
@testable import AngelTree

@MainActor
final class QuoteDirectoryTests: XCTestCase {
    func testDirectoryLoadsEveryOperationalScope() async {
        for scope in MobileQuoteScope.allCases {
            let item = quote(id: scope.rawValue, status: scope == .approved ? "approved" : scope.rawValue)
            let store = QuoteDirectoryStore(service: QuoteServiceStub(pages: [.success((.init(results: [item], nextCursor: nil), false))]), userID: "owner-one")
            await store.load(scope: scope)
            XCTAssertEqual(store.results.map(\.id), [scope.rawValue])
        }
    }

    func testPaginationRemovesDuplicateProposals() async {
        let first = quote(id: "one", status: "draft")
        let second = quote(id: "two", status: "draft")
        let service = QuoteServiceStub(pages: [
            .success((.init(results: [first], nextCursor: "next"), false)),
            .success((.init(results: [first, second], nextCursor: nil), false)),
        ])
        let store = QuoteDirectoryStore(service: service, userID: "owner-one")
        await store.load(scope: .draft); await store.loadMore(scope: .draft)
        XCTAssertEqual(store.results.map(\.id), ["one", "two"])
    }

    func testSearchUsesServerResults() async {
        let match = quote(id: "match", status: "sent")
        let service = QuoteServiceStub(searches: [.success(.init(results: [match], nextCursor: nil))])
        let store = QuoteDirectoryStore(service: service, userID: "estimator-one")
        await store.search("Donna", scope: .sent)
        XCTAssertEqual(store.searchResults, [match])
        store.clearSearch(); XCTAssertTrue(store.searchResults.isEmpty)
    }

    func testProposalScopePreservesNewlinesAndIntegerCents() {
        let line = MobileQuoteLine(id: nil, name: "Oak removal", description: "- Remove oak\n- Haul brush", quantity: 1, unitPriceCents: 160000, totalCents: nil)
        XCTAssertEqual(line.description, "- Remove oak\n- Haul brush")
        XCTAssertEqual(line.unitPriceCents, 160000)
    }

    private func quote(id: String, status: String) -> MobileQuoteDirectoryItem {
        .init(id: id, proposalNumber: "20260813-001", status: status, title: "Tree removal", totalCents: 160000, createdAt: "2026-08-13T12:00:00Z", sentAt: nil, approvedAt: nil, expiresAt: nil, updatedAt: "2026-08-13T12:00:00Z", party: .init(id: "customer-one", kind: .customer, name: "Donna"), serviceLocation: .init(id: "location-one", label: nil, fullAddress: "100 Main St"), linkedJobId: nil, linkedInvoiceId: nil)
    }
}

private actor QuoteServiceStub: FieldDataService {
    typealias ResultPage = (page: MobileQuotePage, cached: Bool)
    private var pages: [Result<ResultPage, Error>]
    private var searches: [Result<MobileQuotePage, Error>]
    init(pages: [Result<ResultPage, Error>] = [], searches: [Result<MobileQuotePage, Error>] = []) { self.pages = pages; self.searches = searches }
    func quoteDirectory(scope: MobileQuoteScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> ResultPage {
        if query != nil { return (try searches.removeFirst().get(), false) }
        return try pages.removeFirst().get()
    }
    func partyDirectory(cursor: String?, limit: Int) async throws -> MobilePartyDirectoryPage { .init(results: [], nextCursor: nil) }
    func searchParties(query: String) async throws -> [MobilePartySearchResult] { [] }
    func createParty(_ input: MobilePartyCreateRequest) async throws -> MobilePartySearchResult { throw MobileAPIError.invalidRequest }
    func jobDirectory(scope: MobileJobDirectoryScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileJobDirectoryPage, cached: Bool) { throw MobileAPIError.invalidRequest }
    func recentParties(userID: String) async -> [MobilePartySearchResult] { [] }
    func partyDetail(kind: MobilePartyKind, id: String, userID: String, allowCached: Bool) async throws -> (detail: MobilePartyDetail, cached: Bool) { throw MobileAPIError.invalidRequest }
    func jobDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileJobDetail, cached: Bool) { throw MobileAPIError.invalidRequest }
}
