import Foundation

enum SystemActions {
    static func directionsURL(address: String?) -> URL? {
        guard let address = clean(address) else { return nil }
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "daddr", value: address)]
        return components?.url
    }

    static func phoneURL(_ phone: String?) -> URL? {
        guard let phone = normalizedPhone(phone) else { return nil }
        return URL(string: "tel:\(phone)")
    }

    static func messageURL(_ phone: String?) -> URL? {
        guard let phone = normalizedPhone(phone) else { return nil }
        return URL(string: "sms:\(phone)")
    }

    static func emailURL(_ email: String?) -> URL? {
        guard let email = clean(email),
              let encoded = email.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            return nil
        }
        return URL(string: "mailto:\(encoded)")
    }

    private static func normalizedPhone(_ value: String?) -> String? {
        guard let value = clean(value) else { return nil }
        let allowed = value.filter { $0.isNumber || $0 == "+" }
        return allowed.isEmpty ? nil : allowed
    }

    private static func clean(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}
