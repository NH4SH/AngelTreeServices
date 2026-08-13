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
    @Published var message: String?

    let apiBaseURL: URL?
    let todayStore: ScheduleStore?
    let scheduleStore: ScheduleStore?
    let photoService: (any JobPhotoService)?

    private let authentication: (any AuthenticationService)?
    private let api: (any MobileAPIClientProtocol)?
    private let cache: ScheduleCache?

    init(bundle: Bundle = .main) {
        do {
            let configuration = try AppConfiguration.load(bundle: bundle)
            let authentication = SupabaseAuthenticationService(configuration: configuration)
            let api = MobileAPIClient(baseURL: configuration.apiBaseURL)
            let cache = ScheduleCache()

            self.authentication = authentication
            self.api = api
            self.cache = cache
            apiBaseURL = configuration.apiBaseURL
            todayStore = ScheduleStore(
                authentication: authentication,
                api: api,
                cache: cache
            )
            scheduleStore = ScheduleStore(
                authentication: authentication,
                api: api,
                cache: cache
            )
            photoService = LiveJobPhotoService(authentication: authentication, api: api)
        } catch {
            authentication = nil
            api = nil
            cache = nil
            apiBaseURL = nil
            todayStore = nil
            scheduleStore = nil
            photoService = nil
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
        message = nil
        phase = .signedOut
    }

    private func resolveAccess(
        authentication: any AuthenticationService,
        api: any MobileAPIClientProtocol
    ) async throws {
        let token = try await authentication.validAccessToken()
        let payload = try await api.bootstrap(accessToken: token)
        phase = .signedIn(try AppAccess.resolve(payload))
        message = nil
    }

    private func friendlyMessage(for error: Error, fallback: String) -> String {
        if let error = error as? MobileAPIError {
            return error.localizedDescription
        }
        return fallback
    }
}
