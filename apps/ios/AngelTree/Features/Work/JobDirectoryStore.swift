import Combine
import Foundation

@MainActor
final class JobDirectoryStore: ObservableObject {
    @Published private(set) var directoryResults: [MobileJobDirectoryItem] = []
    @Published private(set) var searchResults: [MobileJobDirectoryItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isSearching = false
    @Published private(set) var isShowingSavedData = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var searchError: String?
    @Published private(set) var hasMore = true

    private let service: any FieldDataService
    private let userID: String
    private var currentScope: MobileJobDirectoryScope?
    private var nextCursor: String?
    private var hasLoadedCurrentScope = false
    private var activeSearchQuery: String?

    init(service: any FieldDataService, userID: String) {
        self.service = service
        self.userID = userID
    }

    func load(scope: MobileJobDirectoryScope, force: Bool = false) async {
        if currentScope != scope {
            currentScope = scope
            directoryResults = []
            nextCursor = nil
            hasMore = true
            errorMessage = nil
            isShowingSavedData = false
            hasLoadedCurrentScope = false
        }
        guard force || !hasLoadedCurrentScope else { return }

        isLoading = directoryResults.isEmpty
        errorMessage = nil
        do {
            let result = try await service.jobDirectory(
                scope: scope,
                cursor: nil,
                query: nil,
                userID: userID,
                allowCached: !force
            )
            guard currentScope == scope else { return }
            directoryResults = Self.merged([], result.page.results)
            nextCursor = result.page.nextCursor
            hasMore = result.page.nextCursor != nil
            isShowingSavedData = result.cached
            hasLoadedCurrentScope = true
            isLoading = false
            if result.cached && !force { await load(scope: scope, force: true) }
        } catch {
            guard currentScope == scope else { return }
            isLoading = false
            errorMessage = Self.message(for: error)
            isShowingSavedData = !directoryResults.isEmpty
        }
    }

    func loadMoreIfNeeded(current: MobileJobDirectoryItem, scope: MobileJobDirectoryScope) async {
        guard let index = directoryResults.firstIndex(of: current),
              index >= max(directoryResults.count - 4, 0) else { return }
        await loadNextPage(scope: scope)
    }

    func loadNextPage(scope: MobileJobDirectoryScope) async {
        guard currentScope == scope, hasMore, !isLoadingMore, let cursor = nextCursor else { return }
        isLoadingMore = true
        errorMessage = nil
        do {
            let result = try await service.jobDirectory(
                scope: scope,
                cursor: cursor,
                query: nil,
                userID: userID,
                allowCached: false
            )
            guard currentScope == scope else { return }
            directoryResults = Self.merged(directoryResults, result.page.results)
            nextCursor = result.page.nextCursor
            hasMore = result.page.nextCursor != nil
        } catch {
            errorMessage = Self.message(for: error)
        }
        isLoadingMore = false
    }

    func search(query: String, scope: MobileJobDirectoryScope) async {
        activeSearchQuery = query
        isSearching = true
        searchError = nil
        do {
            let result = try await service.jobDirectory(
                scope: scope,
                cursor: nil,
                query: query,
                userID: userID,
                allowCached: false
            )
            guard currentScope == scope, activeSearchQuery == query else { return }
            searchResults = result.page.results
        } catch {
            guard activeSearchQuery == query else { return }
            searchResults = []
            searchError = Self.message(for: error)
        }
        if activeSearchQuery == query { isSearching = false }
    }

    func clearSearch() {
        activeSearchQuery = nil
        searchResults = []
        searchError = nil
        isSearching = false
    }

    static func merged(
        _ existing: [MobileJobDirectoryItem],
        _ incoming: [MobileJobDirectoryItem]
    ) -> [MobileJobDirectoryItem] {
        var seen = Set(existing.map(\.id))
        return existing + incoming.filter { seen.insert($0.id).inserted }
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "Check your connection and try again."
    }
}
