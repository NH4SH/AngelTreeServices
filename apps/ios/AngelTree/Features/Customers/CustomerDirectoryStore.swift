import Combine
import Foundation

@MainActor
final class CustomerDirectoryStore: ObservableObject {
    @Published private(set) var directoryResults: [MobilePartySearchResult] = []
    @Published private(set) var searchResults: [MobilePartySearchResult] = []
    @Published private(set) var isLoadingDirectory = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isSearching = false
    @Published private(set) var directoryError: String?
    @Published private(set) var searchError: String?
    @Published private(set) var hasMore = true

    private let service: any FieldDataService
    private let pageSize: Int
    private var nextCursor: String?
    private var hasLoadedDirectory = false

    init(service: any FieldDataService, pageSize: Int = 25) {
        self.service = service
        self.pageSize = pageSize
    }

    func loadDirectory(force: Bool = false) async {
        guard force || !hasLoadedDirectory else { return }
        isLoadingDirectory = true
        directoryError = nil
        if force {
            nextCursor = nil
            hasMore = true
        }

        do {
            let page = try await service.partyDirectory(cursor: nil, limit: pageSize)
            directoryResults = Self.merged([], page.results)
            nextCursor = page.nextCursor
            hasMore = page.nextCursor != nil
            hasLoadedDirectory = true
        } catch {
            directoryError = Self.message(for: error)
        }
        isLoadingDirectory = false
    }

    func loadMoreIfNeeded(current: MobilePartySearchResult) async {
        guard let index = directoryResults.firstIndex(of: current),
              index >= max(directoryResults.count - 4, 0) else { return }
        await loadNextPage()
    }

    func loadNextPage() async {
        guard hasMore, !isLoadingMore, let cursor = nextCursor else { return }
        isLoadingMore = true
        directoryError = nil
        do {
            let page = try await service.partyDirectory(cursor: cursor, limit: pageSize)
            directoryResults = Self.merged(directoryResults, page.results)
            nextCursor = page.nextCursor
            hasMore = page.nextCursor != nil
        } catch {
            directoryError = Self.message(for: error)
        }
        isLoadingMore = false
    }

    func search(query: String) async {
        isSearching = true
        searchError = nil
        do {
            searchResults = try await service.searchParties(query: query)
        } catch {
            searchResults = []
            searchError = Self.message(for: error)
        }
        isSearching = false
    }

    func clearSearch() {
        searchResults = []
        searchError = nil
        isSearching = false
    }

    static func merged(
        _ existing: [MobilePartySearchResult],
        _ incoming: [MobilePartySearchResult]
    ) -> [MobilePartySearchResult] {
        var seen = Set(existing.map(\.partyKey))
        return existing + incoming.filter { seen.insert($0.partyKey).inserted }
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "Check your connection and try again."
    }
}

extension MobilePartySearchResult {
    var partyKey: String { "\(kind.rawValue):\(id)" }
}
