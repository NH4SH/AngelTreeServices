import XCTest
@testable import AngelTree

final class BusinessCalendarTests: XCTestCase {
    func testEasternDateBoundaryUsesPriorLocalDay() throws {
        let instant = try XCTUnwrap(CRMDateParser.date(from: "2026-08-12T03:30:00.000Z"))
        XCTAssertEqual(BusinessCalendar.dateKey(for: instant), "2026-08-11")
    }

    func testWeekAlwaysContainsSevenNavigableDaysStartingMonday() throws {
        let date = try XCTUnwrap(BusinessCalendar.date(fromKey: "2026-08-12"))
        let week = BusinessCalendar.week(containing: date)

        XCTAssertEqual(week.count, 7)
        XCTAssertEqual(BusinessCalendar.dateKey(for: week.first!), "2026-08-10")
        XCTAssertEqual(BusinessCalendar.dateKey(for: week.last!), "2026-08-16")
    }

    func testTodayGroupingUsesEasternBusinessDate() throws {
        let date = try XCTUnwrap(BusinessCalendar.date(fromKey: "2026-08-11"))
        let grouped = BusinessCalendar.items([
            makeItem(id: "late", startsAt: "2026-08-12T03:30:00.000Z"),
            makeItem(id: "next", startsAt: "2026-08-12T12:00:00.000Z"),
        ], on: date)

        XCTAssertEqual(grouped.map(\.id), ["late"])
    }
}
