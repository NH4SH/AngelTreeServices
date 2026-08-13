import XCTest
@testable import AngelTree

final class AppConfigurationTests: XCTestCase {
    func testV1ForcesLightAppearanceAtTheUIKitAndSwiftUIBoundaries() throws {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let infoPlistURL = iosRoot.appendingPathComponent("AngelTree/Info.plist")
        let appEntryURL = iosRoot.appendingPathComponent("AngelTree/AngelTreeApp.swift")

        let plistData = try Data(contentsOf: infoPlistURL)
        let plist = try XCTUnwrap(
            PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any]
        )
        let appEntry = try String(contentsOf: appEntryURL, encoding: .utf8)

        XCTAssertEqual(plist["UIUserInterfaceStyle"] as? String, "Light")
        XCTAssertTrue(appEntry.contains(".preferredColorScheme(.light)"))
    }

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
