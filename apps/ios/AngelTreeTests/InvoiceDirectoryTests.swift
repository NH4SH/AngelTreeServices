import XCTest
@testable import AngelTree

@MainActor final class InvoiceDirectoryTests: XCTestCase {
    func testEveryInvoiceViewLoadsServerResults() async {
        for scope in MobileInvoiceScope.allCases {
            let item = invoice(id: scope.rawValue, status: scope.rawValue)
            let store = InvoiceDirectoryStore(service: InvoiceServiceStub(pages: [.success((.init(results: [item], nextCursor: nil), false))]), userID: "office-one")
            await store.load(scope)
            XCTAssertEqual(store.results, [item])
        }
    }
    func testPaginationDoesNotDuplicateInvoices() async {
        let first = invoice(id: "one", status: "sent"), second = invoice(id: "two", status: "sent")
        let store = InvoiceDirectoryStore(service: InvoiceServiceStub(pages: [.success((.init(results: [first], nextCursor: "next"), false)), .success((.init(results: [first, second], nextCursor: nil), false))]), userID: "office-one")
        await store.load(.outstanding); await store.loadMore(.outstanding)
        XCTAssertEqual(store.results.map(\.id), ["one", "two"])
    }
    func testSearchReplacesDirectoryResults() async {
        let match = invoice(id: "match", status: "paid")
        let store = InvoiceDirectoryStore(service: InvoiceServiceStub(searches: [.success(.init(results: [match], nextCursor: nil))]), userID: "admin-one")
        await store.search("INV-42", scope: .paid)
        XCTAssertEqual(store.searchResults, [match]); store.clearSearch(); XCTAssertTrue(store.searchResults.isEmpty)
    }
    func testRowsKeepTotalAndRemainingBalanceSeparate() {
        let partial = invoice(id: "partial", status: "partially_paid", total: 200_00, balance: 75_00)
        XCTAssertEqual(partial.totalCents, 200_00); XCTAssertEqual(partial.balanceDueCents, 75_00)
    }
    private func invoice(id: String, status: String, total: Int = 200_00, balance: Int = 200_00) -> MobileInvoiceDirectoryItem {
        .init(id: id, invoiceNumber: "INV-42", status: status, totalCents: total, balanceDueCents: balance, createdAt: "2026-08-13T12:00:00Z", sentAt: nil, paidAt: nil, dueAt: "2026-08-28T12:00:00Z", updatedAt: "2026-08-13T12:00:00Z", party: .init(id: "customer-one", kind: .customer, name: "Donna"), serviceLocation: .init(id: "location-one", label: nil, fullAddress: "100 Main St"), linkedJobId: nil, linkedQuoteId: nil)
    }
}

private actor InvoiceServiceStub: FieldDataService {
    typealias Page = (page: MobileInvoicePage, cached: Bool); private var pages: [Result<Page, Error>]; private var searches: [Result<MobileInvoicePage, Error>]
    init(pages: [Result<Page, Error>] = [], searches: [Result<MobileInvoicePage, Error>] = []) { self.pages = pages; self.searches = searches }
    func invoiceDirectory(scope: MobileInvoiceScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> Page { if query != nil { return (try searches.removeFirst().get(), false) }; return try pages.removeFirst().get() }
    func partyDirectory(cursor: String?, limit: Int) async throws -> MobilePartyDirectoryPage { .init(results: [], nextCursor: nil) }; func searchParties(query: String) async throws -> [MobilePartySearchResult] { [] }; func createParty(_ input: MobilePartyCreateRequest) async throws -> MobilePartySearchResult { throw MobileAPIError.invalidRequest }
    func jobDirectory(scope: MobileJobDirectoryScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileJobDirectoryPage, cached: Bool) { throw MobileAPIError.invalidRequest }; func recentParties(userID: String) async -> [MobilePartySearchResult] { [] }; func partyDetail(kind: MobilePartyKind, id: String, userID: String, allowCached: Bool) async throws -> (detail: MobilePartyDetail, cached: Bool) { throw MobileAPIError.invalidRequest }; func jobDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileJobDetail, cached: Bool) { throw MobileAPIError.invalidRequest }
}
