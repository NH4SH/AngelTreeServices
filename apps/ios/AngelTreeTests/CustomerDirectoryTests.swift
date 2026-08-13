import Foundation
import XCTest
@testable import AngelTree

@MainActor
final class CustomerDirectoryTests: XCTestCase {
    func testInitialDirectoryLoadsWithoutSearchAndPaginationDeduplicates() async {
        let first = party(id: "customer-one", kind: .customer, name: "Donna Goodwin")
        let second = party(id: "organization-one", kind: .organization, name: "Fox Point HOA")
        let service = DirectoryServiceStub(pages: [
            .success(.init(results: [first], nextCursor: "page-two")),
            .success(.init(results: [first, second], nextCursor: nil)),
        ])
        let store = CustomerDirectoryStore(service: service, pageSize: 1)

        await store.loadDirectory()
        XCTAssertEqual(store.directoryResults.map(\.id), ["customer-one"])
        XCTAssertTrue(store.hasMore)

        await store.loadNextPage()
        XCTAssertEqual(store.directoryResults.map(\.id), ["customer-one", "organization-one"])
        XCTAssertFalse(store.hasMore)
    }

    func testSearchReplacesDirectoryAndClearingRestoresLoadedDirectory() async {
        let directoryParty = party(id: "customer-one", kind: .customer, name: "Donna Goodwin")
        let searchParty = party(id: "organization-one", kind: .organization, name: "Fox Point HOA")
        let service = DirectoryServiceStub(
            pages: [.success(.init(results: [directoryParty], nextCursor: nil))],
            searchResults: [searchParty]
        )
        let store = CustomerDirectoryStore(service: service)

        await store.loadDirectory()
        await store.search(query: "Fox")
        XCTAssertEqual(store.searchResults, [searchParty])
        XCTAssertEqual(store.directoryResults, [directoryParty])

        store.clearSearch()
        XCTAssertTrue(store.searchResults.isEmpty)
        XCTAssertEqual(store.directoryResults, [directoryParty])
    }

    func testDirectoryFailureCanRetryWithoutLosingAuthorizationBoundary() async {
        let visible = party(id: "assigned-customer", kind: .customer, name: "Assigned Customer")
        let service = DirectoryServiceStub(pages: [
            .failure(MobileAPIError.networkUnavailable),
            .success(.init(results: [visible], nextCursor: nil)),
        ])
        let store = CustomerDirectoryStore(service: service)

        await store.loadDirectory()
        XCTAssertNotNil(store.directoryError)
        await store.loadDirectory(force: true)
        XCTAssertEqual(store.directoryResults, [visible])
    }

    func testSuccessfulCreateRefreshCanReplaceDirectoryWithCreatedRecord() async {
        let existing = party(id: "customer-one", kind: .customer, name: "Donna Goodwin")
        let created = party(id: "customer-two", kind: .customer, name: "New Customer")
        let service = DirectoryServiceStub(pages: [
            .success(.init(results: [existing], nextCursor: nil)),
            .success(.init(results: [created, existing], nextCursor: nil)),
        ])
        let store = CustomerDirectoryStore(service: service)

        await store.loadDirectory()
        await store.loadDirectory(force: true)

        XCTAssertEqual(store.directoryResults.map(\.id), ["customer-two", "customer-one"])
    }

    func testCustomerAndOrganizationKindsRemainAvailableForDetailNavigation() {
        XCTAssertEqual(party(id: "one", kind: .customer, name: "Donna").kind, .customer)
        XCTAssertEqual(party(id: "two", kind: .organization, name: "Fox Point").kind, .organization)
    }

    private func party(id: String, kind: MobilePartyKind, name: String) -> MobilePartySearchResult {
        .init(
            id: id,
            kind: kind,
            name: name,
            contactName: nil,
            email: nil,
            phone: "540-555-0100",
            address: "100 Main St, Fredericksburg, VA"
        )
    }
}

private actor DirectoryServiceStub: FieldDataService {
    private var pages: [Result<MobilePartyDirectoryPage, Error>]
    private let configuredSearchResults: [MobilePartySearchResult]

    init(
        pages: [Result<MobilePartyDirectoryPage, Error>],
        searchResults: [MobilePartySearchResult] = []
    ) {
        self.pages = pages
        configuredSearchResults = searchResults
    }

    func partyDirectory(cursor: String?, limit: Int) async throws -> MobilePartyDirectoryPage {
        guard !pages.isEmpty else { return .init(results: [], nextCursor: nil) }
        return try pages.removeFirst().get()
    }

    func searchParties(query: String) async throws -> [MobilePartySearchResult] {
        configuredSearchResults
    }

    func createParty(_ input: MobilePartyCreateRequest) async throws -> MobilePartySearchResult {
        throw MobileAPIError.requestRejected("Not configured for this test.")
    }

    func jobDirectory(
        scope: MobileJobDirectoryScope,
        cursor: String?,
        query: String?,
        userID: String,
        allowCached: Bool
    ) async throws -> (page: MobileJobDirectoryPage, cached: Bool) {
        throw MobileAPIError.requestRejected("Not configured for this test.")
    }

    func recentParties(userID: String) async -> [MobilePartySearchResult] { [] }

    func partyDetail(
        kind: MobilePartyKind,
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobilePartyDetail, cached: Bool) {
        throw MobileAPIError.requestRejected("Not configured for this test.")
    }

    func jobDetail(
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobileJobDetail, cached: Bool) {
        throw MobileAPIError.requestRejected("Not configured for this test.")
    }
}
