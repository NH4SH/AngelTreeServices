import Combine
import Foundation

@MainActor
final class ScheduleStore: ObservableObject {
    @Published private(set) var items: [MobileScheduleItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isStale = false
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var errorMessage: String?

    private let authentication: any AuthenticationService
    private let api: any MobileAPIClientProtocol
    private let cache: ScheduleCache
    private let widgetSync: any WidgetSyncing
    private var activeRequestKey: String?
    private var widgetUserID: String?

    init(
        authentication: any AuthenticationService,
        api: any MobileAPIClientProtocol,
        cache: ScheduleCache,
        widgetSync: any WidgetSyncing
    ) {
        self.authentication = authentication
        self.api = api
        self.cache = cache
        self.widgetSync = widgetSync
    }

    func configureWidget(userID: String) {
        widgetUserID = userID
    }

    func load(
        startDate: String,
        endDate: String,
        scope: ScheduleScope,
        force: Bool = false
    ) async {
        let key = ScheduleCache.key(startDate: startDate, endDate: endDate, scope: scope)
        if isLoading && activeRequestKey == key { return }
        if !force && activeRequestKey == key && !items.isEmpty && !isStale { return }

        activeRequestKey = key
        isLoading = true
        errorMessage = nil

        let cached = await cache.read(key: key)
        if let cached, items.isEmpty || force || activeRequestKey == key {
            items = SchedulePresentation.visibleItems(cached.payload.items)
            lastUpdated = cached.savedAt
            isStale = CacheFreshness.isStale(savedAt: cached.savedAt)
            if let widgetUserID {
                widgetSync.sync(payload: cached.payload, userID: widgetUserID, savedAt: cached.savedAt)
            }
        }

        do {
            let token = try await authentication.validAccessToken()
            let payload = try await api.schedule(
                startDate: startDate,
                endDate: endDate,
                scope: scope,
                accessToken: token
            )
            guard activeRequestKey == key else { return }

            let savedAt = Date()
            items = SchedulePresentation.visibleItems(payload.items)
            lastUpdated = savedAt
            isStale = false
            errorMessage = nil
            await cache.write(CachedSchedule(payload: payload, savedAt: savedAt), key: key)
            if let widgetUserID {
                widgetSync.sync(payload: payload, userID: widgetUserID, savedAt: savedAt)
            }
        } catch {
            guard activeRequestKey == key else { return }
            isStale = cached != nil || !items.isEmpty
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Could not load the schedule."
        }

        if activeRequestKey == key {
            isLoading = false
        }
    }

    func clear() {
        items = []
        isLoading = false
        isStale = false
        lastUpdated = nil
        errorMessage = nil
        activeRequestKey = nil
        widgetUserID = nil
    }
}
