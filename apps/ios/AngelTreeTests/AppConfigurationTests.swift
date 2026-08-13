import XCTest
@testable import AngelTree

final class AppConfigurationTests: XCTestCase {
    func testValidConfigurationAcceptsHTTPSAndPublishableKey() throws {
        let configuration = try AppConfiguration(values: [
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example",
            "APP_BASE_URL": "https://admin.angeltreeservices.org",
        ])

        XCTAssertEqual(configuration.supabaseURL.absoluteString, "https://example.supabase.co")
        XCTAssertEqual(configuration.apiBaseURL.absoluteString, "https://admin.angeltreeservices.org")
    }

    func testMissingConfigurationIsRejected() {
        XCTAssertThrowsError(try AppConfiguration(values: [:])) { error in
            XCTAssertEqual(error as? ConfigurationError, .missing("SUPABASE_URL"))
        }
    }

    func testServiceRoleLikeCredentialIsRejected() {
        XCTAssertThrowsError(try AppConfiguration(values: [
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "service_role_must_not_ship",
            "APP_BASE_URL": "https://admin.angeltreeservices.org",
        ])) { error in
            XCTAssertEqual(error as? ConfigurationError, .unsafeCredential)
        }
    }

    func testNonLocalHTTPIsRejected() {
        XCTAssertThrowsError(try AppConfiguration(values: [
            "SUPABASE_URL": "http://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example",
            "APP_BASE_URL": "https://admin.angeltreeservices.org",
        ])) { error in
            XCTAssertEqual(error as? ConfigurationError, .insecureURL("SUPABASE_URL"))
        }
    }
}
