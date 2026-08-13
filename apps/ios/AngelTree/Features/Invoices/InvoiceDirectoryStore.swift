import Combine
import Foundation

@MainActor final class InvoiceDirectoryStore: ObservableObject {
    @Published private(set) var results: [MobileInvoiceDirectoryItem] = []; @Published private(set) var searchResults: [MobileInvoiceDirectoryItem] = []
    @Published private(set) var loading = false; @Published private(set) var loadingMore = false; @Published private(set) var searching = false
    @Published private(set) var error: String?; @Published private(set) var searchError: String?; @Published private(set) var hasMore = true; @Published private(set) var stale = false
    private let service: any FieldDataService; private let userID: String; private var cursor: String?; private var loadedScope: MobileInvoiceScope?
    init(service: any FieldDataService, userID: String) { self.service = service; self.userID = userID }
    func load(_ scope: MobileInvoiceScope, force: Bool = false) async { guard force || loadedScope != scope else { return }; loading = true; error = nil
        do { let result = try await service.invoiceDirectory(scope: scope, cursor: nil, query: nil, userID: userID, allowCached: !force); results = result.page.results; cursor = result.page.nextCursor; hasMore = cursor != nil; stale = result.cached; loadedScope = scope; if result.cached { await refresh(scope) } } catch { self.error = message(error) }; loading = false }
    func refresh(_ scope: MobileInvoiceScope) async { do { let result = try await service.invoiceDirectory(scope: scope, cursor: nil, query: nil, userID: userID, allowCached: false); results = result.page.results; cursor = result.page.nextCursor; hasMore = cursor != nil; stale = false; loadedScope = scope; error = nil } catch { if results.isEmpty { self.error = message(error) } } }
    func loadMoreIfNeeded(_ item: MobileInvoiceDirectoryItem, scope: MobileInvoiceScope) async { guard results.firstIndex(of: item).map({ $0 >= max(0, results.count - 4) }) == true else { return }; await loadMore(scope) }
    func loadMore(_ scope: MobileInvoiceScope) async { guard hasMore, !loadingMore, let cursor else { return }; loadingMore = true; do { let page = try await service.invoiceDirectory(scope: scope, cursor: cursor, query: nil, userID: userID, allowCached: false).page; var seen = Set(results.map(\.id)); results += page.results.filter { seen.insert($0.id).inserted }; self.cursor = page.nextCursor; hasMore = page.nextCursor != nil } catch { self.error = message(error) }; loadingMore = false }
    func search(_ query: String, scope: MobileInvoiceScope) async { searching = true; searchError = nil; do { searchResults = try await service.invoiceDirectory(scope: scope, cursor: nil, query: query, userID: userID, allowCached: false).page.results } catch { searchResults = []; searchError = message(error) }; searching = false }
    func clearSearch() { searchResults = []; searchError = nil; searching = false }
    private func message(_ error: Error) -> String { (error as? LocalizedError)?.errorDescription ?? "Check your connection and try again." }
}
