import Foundation

struct AppConfiguration: Equatable, Sendable {
    let supabaseURL: URL
    let supabasePublishableKey: String
    let apiBaseURL: URL

    static func load(bundle: Bundle = .main) throws -> AppConfiguration {
        try AppConfiguration(values: bundle.infoDictionary ?? [:])
    }

    init(values: [String: Any]) throws {
        supabaseURL = try Self.requiredURL(
            named: "SUPABASE_URL",
            in: values,
            allowLocalHTTP: true
        )
        apiBaseURL = try Self.requiredURL(
            named: "APP_BASE_URL",
            in: values,
            allowLocalHTTP: true
        )

        let key = Self.clean(values["SUPABASE_PUBLISHABLE_KEY"] as? String)
        guard let key else {
            throw ConfigurationError.missing("SUPABASE_PUBLISHABLE_KEY")
        }
        guard !key.localizedCaseInsensitiveContains("service_role"),
              !key.localizedCaseInsensitiveContains("secret") else {
            throw ConfigurationError.unsafeCredential
        }
        supabasePublishableKey = key
    }

    private static func requiredURL(
        named name: String,
        in values: [String: Any],
        allowLocalHTTP: Bool
    ) throws -> URL {
        guard let value = clean(values[name] as? String) else {
            throw ConfigurationError.missing(name)
        }
        guard let url = URL(string: value), let scheme = url.scheme?.lowercased(), url.host != nil else {
            throw ConfigurationError.invalidURL(name)
        }

        let isLocal = url.host == "localhost" || url.host == "127.0.0.1"
        guard scheme == "https" || (allowLocalHTTP && isLocal && scheme == "http") else {
            throw ConfigurationError.insecureURL(name)
        }
        return url
    }

    private static func clean(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty,
              !trimmed.contains("YOUR_PROJECT"),
              !trimmed.contains("YOUR_PUBLISHABLE") else {
            return nil
        }
        return trimmed
    }
}

enum ConfigurationError: LocalizedError, Equatable {
    case missing(String)
    case invalidURL(String)
    case insecureURL(String)
    case unsafeCredential

    var errorDescription: String? {
        switch self {
        case .missing(let name):
            return "Add \(name) to Config/Local.xcconfig."
        case .invalidURL(let name):
            return "\(name) is not a valid URL."
        case .insecureURL(let name):
            return "\(name) must use HTTPS outside local development."
        case .unsafeCredential:
            return "Use only a Supabase publishable or anon key in the app."
        }
    }
}
