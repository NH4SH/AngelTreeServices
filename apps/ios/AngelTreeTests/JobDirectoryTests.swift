import Foundation
import XCTest
@testable import AngelTree

@MainActor
final class JobDirectoryTests: XCTestCase {
    func testEveryOperationalViewLoadsThroughTheDirectory() async {
        for scope in MobileJobDirectoryScope.allCases {
            let job = makeJobDirectoryItem(id: scope.rawValue)
            let service = JobDirectoryServiceStub(pages: [.success(.init(results: [job], nextCursor: nil))])
            let store = JobDirectoryStore(service: service, userID: "user-one")

            await store.load(scope: scope)

            XCTAssertEqual(store.directoryResults.map(\.id), [scope.rawValue])
        }
    }

    func testPaginationDeduplicatesJobsAndPreservesMultiDayContext() async {
        let first = makeJobDirectoryItem(id: "job-one")
        let second = makeJobDirectoryItem(id: "job-two")
        let service = JobDirectoryServiceStub(pages: [
            .success(.init(results: [first], nextCursor: "page-two")),
            .success(.init(results: [first, second], nextCursor: nil)),
        ])
        let store = JobDirectoryStore(service: service, userID: "user-one")

        await store.load(scope: .upcoming)
        await store.loadNextPage(scope: .upcoming)

        XCTAssertEqual(store.directoryResults.map(\.id), ["job-one", "job-two"])
        XCTAssertEqual(store.directoryResults.first?.workdayCount, 2)
        XCTAssertFalse(store.hasMore)
    }

    func testSearchReplacesVisibleResultsAndClearRestoresDirectory() async {
        let directoryJob = makeJobDirectoryItem(id: "directory-job")
        let searchJob = makeJobDirectoryItem(id: "search-job")
        let service = JobDirectoryServiceStub(
            pages: [.success(.init(results: [directoryJob], nextCursor: nil))],
            searches: [.success(.init(results: [searchJob], nextCursor: nil))]
        )
        let store = JobDirectoryStore(service: service, userID: "user-one")

        await store.load(scope: .active)
        await store.search(query: "Donna", scope: .active)
        XCTAssertEqual(store.searchResults, [searchJob])
        XCTAssertEqual(store.directoryResults, [directoryJob])

        store.clearSearch()
        XCTAssertTrue(store.searchResults.isEmpty)
        XCTAssertEqual(store.directoryResults, [directoryJob])
    }

    func testCachedDirectoryIsMarkedStaleThenRefreshed() async {
        let cached = makeJobDirectoryItem(id: "cached-job")
        let current = makeJobDirectoryItem(id: "current-job")
        let service = JobDirectoryServiceStub(pages: [
            .success((page: MobileJobDirectoryPage(results: [cached], nextCursor: nil), cached: true)),
            .success((page: MobileJobDirectoryPage(results: [current], nextCursor: nil), cached: false)),
        ])
        let store = JobDirectoryStore(service: service, userID: "user-one")

        await store.load(scope: MobileJobDirectoryScope.upcoming)

        XCTAssertEqual(store.directoryResults, [current])
        XCTAssertFalse(store.isShowingSavedData)
    }
}

private actor JobDirectoryServiceStub: FieldDataService {
    typealias DirectoryResult = (page: MobileJobDirectoryPage, cached: Bool)
    private var pages: [Result<DirectoryResult, Error>]
    private var searches: [Result<MobileJobDirectoryPage, Error>]

    init(
        pages: [Result<MobileJobDirectoryPage, Error>] = [],
        searches: [Result<MobileJobDirectoryPage, Error>] = []
    ) {
        self.pages = pages.map { result in result.map { (page: $0, cached: false) } }
        self.searches = searches
    }

    init(pages: [Result<DirectoryResult, Error>]) {
        self.pages = pages
        searches = []
    }

    func jobDirectory(
        scope: MobileJobDirectoryScope,
        cursor: String?,
        query: String?,
        userID: String,
        allowCached: Bool
    ) async throws -> DirectoryResult {
        if query != nil {
            guard !searches.isEmpty else { return (.init(results: [], nextCursor: nil), false) }
            return (try searches.removeFirst().get(), false)
        }
        guard !pages.isEmpty else { return (.init(results: [], nextCursor: nil), false) }
        return try pages.removeFirst().get()
    }

    func partyDirectory(cursor: String?, limit: Int) async throws -> MobilePartyDirectoryPage {
        .init(results: [], nextCursor: nil)
    }
    func searchParties(query: String) async throws -> [MobilePartySearchResult] { [] }
    func createParty(_ input: MobilePartyCreateRequest) async throws -> MobilePartySearchResult {
        throw MobileAPIError.requestRejected("Not configured.")
    }
    func recentParties(userID: String) async -> [MobilePartySearchResult] { [] }
    func partyDetail(
        kind: MobilePartyKind,
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobilePartyDetail, cached: Bool) {
        throw MobileAPIError.requestRejected("Not configured.")
    }
    func jobDetail(
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobileJobDetail, cached: Bool) {
        throw MobileAPIError.requestRejected("Not configured.")
    }
}
