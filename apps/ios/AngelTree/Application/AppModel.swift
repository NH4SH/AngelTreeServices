import Combine
import Foundation

@MainActor
final class AppModel: ObservableObject {
    enum Phase {
        case configurationRequired(String)
        case launching
        case signedOut
        case accessRequired(String)
        case signedIn(AppAccess)
    }

    @Published private(set) var phase: Phase = .launching
    @Published private(set) var isWorking = false
    @Published private(set) var pendingDeepLink: WidgetDeepLink?
    @Published var message: String?

    let apiBaseURL: URL?
    let todayStore: ScheduleStore?
    let scheduleStore: ScheduleStore?
    let photoService: (any JobPhotoService)?
    let fieldService: (any FieldDataService)?

    private let authentication: (any AuthenticationService)?
    private let api: (any MobileAPIClientProtocol)?
    private let cache: ScheduleCache?
    private let fieldCache: FieldCache?
    private let widgetSync: (any WidgetSyncing)?

    init(bundle: Bundle = .main) {
        do {
            let configuration = try AppConfiguration.load(bundle: bundle)
            let authentication = SupabaseAuthenticationService(configuration: configuration)
            let api = MobileAPIClient(baseURL: configuration.apiBaseURL)
            let cache = ScheduleCache()
            let fieldCache = FieldCache()
            let widgetSync = LiveWidgetSyncService()

            self.authentication = authentication
            self.api = api
            self.cache = cache
            self.fieldCache = fieldCache
            self.widgetSync = widgetSync
            apiBaseURL = configuration.apiBaseURL
            todayStore = ScheduleStore(
                authentication: authentication,
                api: api,
                cache: cache,
                widgetSync: widgetSync
            )
            scheduleStore = ScheduleStore(
                authentication: authentication,
                api: api,
                cache: cache,
                widgetSync: widgetSync
            )
            photoService = LiveJobPhotoService(authentication: authentication, api: api)
            fieldService = LiveFieldDataService(authentication: authentication, api: api, cache: fieldCache)
        } catch {
            authentication = nil
            api = nil
            cache = nil
            fieldCache = nil
            widgetSync = nil
            apiBaseURL = nil
            todayStore = nil
            scheduleStore = nil
            photoService = nil
            fieldService = nil
            phase = .configurationRequired(
                (error as? LocalizedError)?.errorDescription
                    ?? "The app configuration is incomplete."
            )
        }
    }

    func start() async {
        guard case .launching = phase,
              let authentication,
              let api else { return }

        do {
            guard try await authentication.restoreSession() != nil else {
                widgetSync?.clear()
                phase = .signedOut
                return
            }
            try await resolveAccess(authentication: authentication, api: api)
        } catch {
            phase = .signedOut
            message = friendlyMessage(for: error, fallback: "Sign in to continue.")
        }
    }

    func signIn(email: String, password: String) async {
        guard let authentication, let api else { return }
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !password.isEmpty else {
            message = "Enter your email and password."
            return
        }

        isWorking = true
        message = nil
        defer { isWorking = false }

        do {
            widgetSync?.clear()
            _ = try await authentication.signIn(email: email, password: password)
            try await resolveAccess(authentication: authentication, api: api)
        } catch let error as AccessResolutionError {
            phase = .accessRequired(error.localizedDescription)
        } catch let error as MobileAPIError {
            if case .accessDenied(let detail) = error {
                phase = .accessRequired(detail ?? "This account does not have field app access.")
            } else {
                message = error.localizedDescription
            }
        } catch {
            message = "The email or password was not accepted. Check both and try again."
        }
    }

    func refreshAccess() async {
        guard case .signedIn = phase,
              let authentication,
              let api else { return }

        do {
            try await resolveAccess(authentication: authentication, api: api)
        } catch MobileAPIError.authenticationRequired {
            await signOut()
            message = "Your session expired. Sign in again."
        } catch {
            // Keep cached field data available during a temporary connection loss.
        }
    }

    func signOut() async {
        isWorking = true
        defer { isWorking = false }
        try? await authentication?.signOut()
        todayStore?.clear()
        scheduleStore?.clear()
        await cache?.removeAll()
        await fieldCache?.removeAll()
        widgetSync?.clear()
        pendingDeepLink = nil
        message = nil
        phase = .signedOut
    }

    private func resolveAccess(
        authentication: any AuthenticationService,
        api: any MobileAPIClientProtocol
    ) async throws {
        let token = try await authentication.validAccessToken()
        let payload = try await api.bootstrap(accessToken: token)
        let access = try AppAccess.resolve(payload)
        todayStore?.configureWidget(userID: access.userID)
        scheduleStore?.configureWidget(userID: access.userID)
        phase = .signedIn(access)
        message = nil
    }

    func open(url: URL) {
        guard let deepLink = WidgetDeepLink(url: url) else { return }
        pendingDeepLink = deepLink
    }

    func consumeDeepLink() {
        pendingDeepLink = nil
    }

    private func friendlyMessage(for error: Error, fallback: String) -> String {
        if let error = error as? MobileAPIError {
            return error.localizedDescription
        }
        return fallback
    }
}
