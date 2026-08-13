import Combine
import Foundation

@MainActor
final class QuoteDirectoryStore: ObservableObject {
    @Published private(set) var results: [MobileQuoteDirectoryItem] = []
    @Published private(set) var searchResults: [MobileQuoteDirectoryItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isSearching = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var searchError: String?
    @Published private(set) var hasMore = true
    @Published private(set) var isShowingSavedData = false
    private let service: any FieldDataService
    private let userID: String
    private var cursor: String?
    private var loadedScope: MobileQuoteScope?

    init(service: any FieldDataService, userID: String) { self.service = service; self.userID = userID }

    func load(scope: MobileQuoteScope, force: Bool = false) async {
        guard force || loadedScope != scope else { return }
        isLoading = true; errorMessage = nil; cursor = nil; hasMore = true
        do {
            let cached = try await service.quoteDirectory(scope: scope, cursor: nil, query: nil, userID: userID, allowCached: !force)
            results = cached.page.results; cursor = cached.page.nextCursor; hasMore = cursor != nil; isShowingSavedData = cached.cached; loadedScope = scope
            if cached.cached { await refresh(scope: scope) }
        } catch { errorMessage = message(error) }
        isLoading = false
    }

    func refresh(scope: MobileQuoteScope) async {
        do {
            let fresh = try await service.quoteDirectory(scope: scope, cursor: nil, query: nil, userID: userID, allowCached: false)
            results = fresh.page.results; cursor = fresh.page.nextCursor; hasMore = cursor != nil; isShowingSavedData = false; loadedScope = scope; errorMessage = nil
        } catch { if results.isEmpty { errorMessage = message(error) } }
    }

    func loadMoreIfNeeded(_ item: MobileQuoteDirectoryItem, scope: MobileQuoteScope) async {
        guard results.firstIndex(of: item).map({ $0 >= max(0, results.count - 4) }) == true else { return }
        await loadMore(scope: scope)
    }

    func loadMore(scope: MobileQuoteScope) async {
        guard hasMore, !isLoadingMore, let cursor else { return }
        isLoadingMore = true
        do {
            let page = try await service.quoteDirectory(scope: scope, cursor: cursor, query: nil, userID: userID, allowCached: false).page
            var seen = Set(results.map(\.id)); results += page.results.filter { seen.insert($0.id).inserted }
            self.cursor = page.nextCursor; hasMore = page.nextCursor != nil
        } catch { errorMessage = message(error) }
        isLoadingMore = false
    }

    func search(_ query: String, scope: MobileQuoteScope) async {
        isSearching = true; searchError = nil
        do { searchResults = try await service.quoteDirectory(scope: scope, cursor: nil, query: query, userID: userID, allowCached: false).page.results }
        catch { searchResults = []; searchError = message(error) }
        isSearching = false
    }

    func clearSearch() { searchResults = []; searchError = nil; isSearching = false }
    private func message(_ error: Error) -> String { (error as? LocalizedError)?.errorDescription ?? "Check your connection and try again." }
}
