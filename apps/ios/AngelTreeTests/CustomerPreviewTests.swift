import Foundation
import XCTest
@testable import AngelTree

final class CustomerPreviewTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-08-12T11:00:00Z")!

    func testEmptyQueryUsesPreviewsAndSearchReplacesThemUntilCleared() {
        XCTAssertTrue(CustomerPreviewPresentation.showsDefaultContent(for: ""))
        XCTAssertTrue(CustomerPreviewPresentation.showsDefaultContent(for: "   "))
        XCTAssertFalse(CustomerPreviewPresentation.showsDefaultContent(for: "Donna"))
        XCTAssertTrue(CustomerPreviewPresentation.showsDefaultContent(for: ""))
    }

    func testUpcomingPartiesAreOrderedAndDeduplicated() {
        let later = makeItem(id: "later", startsAt: "2026-08-13T14:00:00.000Z")
        let first = makeItem(id: "first", startsAt: "2026-08-12T12:00:00.000Z")
        let duplicate = makeItem(id: "duplicate", startsAt: "2026-08-14T12:00:00.000Z")

        let previews = CustomerPreviewPresentation.upcoming(
            from: [later, duplicate, first],
            now: now
        )

        XCTAssertEqual(previews.count, 1)
        XCTAssertEqual(previews.first?.reference.id, "customer-one")
        XCTAssertEqual(previews.first?.reference.address, "6917 Bloomsbury Ln Spotsylvania, VA 22553")
        XCTAssertTrue(previews.first?.context.contains("Today") == true)
    }

    func testOrganizationIdentityIsPreservedForDetailNavigation() {
        let organization = MobileScheduleItem.Party(
            id: "organization-one",
            kind: .organization,
            name: "Rappahannock Properties Inc",
            email: nil,
            phone: "540-555-0199"
        )

        let previews = CustomerPreviewPresentation.upcoming(
            from: [makeItem(id: "estimate", party: organization)],
            now: now
        )

        XCTAssertEqual(previews.first?.reference.kind, .organization)
        XCTAssertEqual(previews.first?.reference.id, "organization-one")
    }

    func testUnavailableOrInactivePartiesDoNotAppear() {
        let missingID = MobileScheduleItem.Party(
            id: nil,
            kind: .customer,
            name: "Unavailable customer",
            email: nil,
            phone: nil
        )
        let cancelled = makeItem(id: "cancelled", status: "cancelled")
        let completed = makeItem(id: "completed", status: "completed")

        let previews = CustomerPreviewPresentation.upcoming(
            from: [makeItem(id: "missing", party: missingID), cancelled, completed],
            now: now
        )

        XCTAssertTrue(previews.isEmpty)
    }

    func testUpcomingPreviewUsesAssignedWorkScopeForEveryRole() {
        XCTAssertEqual(CustomerPreviewPresentation.scheduleScope, .mine)
    }

    func testTrueEmptyScheduleProducesNoPreviewRows() {
        XCTAssertTrue(CustomerPreviewPresentation.upcoming(from: [], now: now).isEmpty)
    }
}
