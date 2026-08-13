import XCTest
@testable import AngelTree

final class ScheduleLogicTests: XCTestCase {
    func testCancelledJobSessionsAreHiddenButCancelledNonJobEventsRemainReadable() {
        let values = SchedulePresentation.visibleItems([
            makeItem(id: "cancelled-job", status: "cancelled"),
            makeItem(id: "cancelled-estimate", eventType: "estimate", status: "cancelled"),
            makeItem(id: "scheduled-job"),
        ])

        XCTAssertEqual(values.map(\.id), ["cancelled-estimate", "scheduled-job"])
    }

    func testMissingOptionalPartyAndLocationDataRemainUsable() throws {
        let data = try JSONEncoder().encode(makeItem(
            id: "sparse",
            party: nil,
            location: nil
        ))
        let decoded = try JSONDecoder().decode(MobileScheduleItem.self, from: data)

        XCTAssertNil(decoded.party)
        XCTAssertNil(decoded.location)
        XCTAssertEqual(decoded.operationalTitle, "Tree removal")
    }

    func testMultidayLabelMapsFromBackendSequence() {
        let item = makeItem(id: "day-two", workdayNumber: 2, workdayCount: 3)
        XCTAssertEqual(item.workdayLabel, "Day 2 of 3")
    }
}
