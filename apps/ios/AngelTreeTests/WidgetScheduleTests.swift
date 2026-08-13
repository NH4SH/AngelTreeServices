import Foundation
import XCTest
@testable import AngelTree

final class WidgetScheduleTests: XCTestCase {
    func testNextJobExcludesPastCancelledAndCompletedWork() throws {
        let now = try date("2026-08-13T14:00:00.000Z")
        let snapshot = makeSnapshot(items: [
            widgetItem(id: "past", startsAt: "2026-08-13T12:00:00.000Z", endsAt: "2026-08-13T13:00:00.000Z"),
            widgetItem(id: "cancelled", status: "cancelled", startsAt: "2026-08-13T15:00:00.000Z"),
            widgetItem(id: "completed", status: "completed", startsAt: "2026-08-13T15:30:00.000Z"),
            widgetItem(id: "next", startsAt: "2026-08-13T16:00:00.000Z"),
        ])

        XCTAssertEqual(WidgetScheduleLogic.nextItem(in: snapshot, now: now)?.id, "next")
    }

    func testUpcomingJobsSortSameDayTimesAndKeepCurrentWork() throws {
        let now = try date("2026-08-13T14:00:00.000Z")
        let snapshot = makeSnapshot(items: [
            widgetItem(id: "later", startsAt: "2026-08-13T18:00:00.000Z"),
            widgetItem(id: "current", status: "in_progress", startsAt: "2026-08-13T12:00:00.000Z"),
            widgetItem(id: "sooner", startsAt: "2026-08-13T16:00:00.000Z"),
        ])

        XCTAssertEqual(
            WidgetScheduleLogic.upcomingItems(in: snapshot, now: now).map(\.id),
            ["current", "sooner", "later"]
        )
    }

    func testEasternMidnightBoundaryDoesNotLeakTomorrowIntoToday() throws {
        let beforeMidnightEastern = try date("2026-08-14T03:55:00.000Z")
        let afterMidnightEastern = try date("2026-08-14T04:05:00.000Z")
        let snapshot = makeSnapshot(items: [
            widgetItem(
                id: "tomorrow",
                startsAt: "2026-08-14T13:00:00.000Z",
                endsAt: "2026-08-14T17:00:00.000Z"
            ),
        ])

        XCTAssertTrue(WidgetScheduleLogic.upcomingItems(in: snapshot, now: beforeMidnightEastern).isEmpty)
        XCTAssertEqual(
            WidgetScheduleLogic.upcomingItems(in: snapshot, now: afterMidnightEastern).map(\.id),
            ["tomorrow"]
        )
    }

    func testMultiDayContextAndEmptyDayRemainStable() throws {
        let now = try date("2026-08-13T12:00:00.000Z")
        let item = widgetItem(
            id: "day-two",
            startsAt: "2026-08-13T14:00:00.000Z",
            workdayNumber: 2,
            workdayCount: 3
        )
        XCTAssertEqual(item.workdayLabel, "Day 2 of 3")
        XCTAssertTrue(WidgetScheduleLogic.upcomingItems(in: makeSnapshot(items: []), now: now).isEmpty)
    }

    func testStaleSnapshotUsesExistingFreshnessBoundary() throws {
        let now = try date("2026-08-13T14:30:01.000Z")
        let snapshot = makeSnapshot(savedAt: try date("2026-08-13T14:15:00.000Z"), items: [])
        XCTAssertTrue(WidgetScheduleLogic.isStale(snapshot, now: now))
        XCTAssertFalse(WidgetScheduleLogic.isStale(snapshot, now: now, maximumAge: 16 * 60))
    }

    func testSnapshotStoreReplacesPreviousUserAndClearsOnLogout() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AngelTreeWidgetTests-\(UUID().uuidString)")
        let store = WidgetSnapshotStore(directory: directory)
        let first = makeSnapshot(userID: "employee-one", items: [])
        let second = makeSnapshot(userID: "employee-two", items: [])

        XCTAssertTrue(store.write(first))
        XCTAssertEqual(store.read()?.userID, "employee-one")
        XCTAssertTrue(store.write(second))
        XCTAssertEqual(store.read()?.userID, "employee-two")
        XCTAssertTrue(store.remove())
        XCTAssertNil(store.read())
    }

    func testDeepLinksUseStableInternalIdentifiers() {
        let jobItem = widgetItem(id: "event-one", jobID: "job-one")
        let eventItem = widgetItem(id: "event-two", jobID: nil)

        XCTAssertEqual(WidgetDeepLink.forItem(jobItem), .job(id: "job-one"))
        XCTAssertEqual(WidgetDeepLink.forItem(eventItem), .scheduleEvent(id: "event-two"))
        XCTAssertEqual(WidgetDeepLink(url: WidgetDeepLink.forItem(jobItem).url), .job(id: "job-one"))
        XCTAssertEqual(WidgetDeepLink(url: WidgetDeepLink.today.url), .today)
    }

    func testPrivacyMappingExcludesContactNotesAndFinancialData() throws {
        let source = MobileScheduleItem(
            id: "event-safe",
            source: "schedule_event",
            title: "Tree work",
            eventType: "tree_removal",
            status: "scheduled",
            startsAt: "2026-08-13T14:00:00.000Z",
            endsAt: "2026-08-13T16:00:00.000Z",
            allDay: false,
            jobId: "job-safe",
            serviceLocationId: "location-safe",
            party: .init(
                id: "party-safe",
                kind: .customer,
                name: "Sample Customer",
                email: "private@example.invalid",
                phone: "555-0100"
            ),
            location: .init(
                label: "Primary",
                fullAddress: "100 Example St, Fredericksburg, VA 22401",
                accessNotes: "Private access instruction",
                serviceNotes: "Private service note"
            ),
            assignees: [],
            customerFacingScope: "Detailed private scope",
            teamNotes: "Private crew note",
            equipment: ["Private equipment"],
            materials: ["Private material"],
            workdayNumber: nil,
            workdayCount: nil
        )

        let mapped = WidgetSnapshotMapper.map(source)
        let encoded = String(decoding: try JSONEncoder().encode(mapped), as: UTF8.self)
        XCTAssertEqual(mapped.title, "Tree work")
        XCTAssertEqual(mapped.partyName, "Sample Customer")
        XCTAssertEqual(mapped.city, "Fredericksburg")
        for privateValue in ["private@example", "555-0100", "Private access", "Private service", "Private crew", "Detailed private", "Private equipment", "Private material"] {
            XCTAssertFalse(encoded.contains(privateValue))
        }
    }

    func testWidgetSyncWritesOnlyMyScheduleRangesContainingToday() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AngelTreeWidgetSyncTests-\(UUID().uuidString)")
        let store = WidgetSnapshotStore(directory: directory)
        let sync = LiveWidgetSyncService(store: store)
        let savedAt = try date("2026-08-13T14:00:00.000Z")
        let item = MobileScheduleItem(
            id: "safe-event",
            source: "schedule_event",
            title: "Tree work",
            eventType: "tree_removal",
            status: "scheduled",
            startsAt: "2026-08-13T15:00:00.000Z",
            endsAt: nil,
            allDay: false,
            jobId: "safe-job",
            serviceLocationId: nil,
            party: nil,
            location: nil,
            assignees: [],
            customerFacingScope: nil,
            teamNotes: nil,
            equipment: [],
            materials: [],
            workdayNumber: nil,
            workdayCount: nil
        )
        let mine = MobileSchedulePayload(
            generatedAt: "2026-08-13T14:00:00.000Z",
            range: .init(startDate: "2026-08-13", endDate: "2026-08-13"),
            scope: .mine,
            items: [item]
        )
        sync.sync(payload: mine, userID: "employee-one", savedAt: savedAt)
        XCTAssertEqual(store.read()?.userID, "employee-one")

        let team = MobileSchedulePayload(
            generatedAt: mine.generatedAt,
            range: mine.range,
            scope: .team,
            items: []
        )
        sync.sync(payload: team, userID: "employee-two", savedAt: savedAt)
        XCTAssertEqual(store.read()?.userID, "employee-one")

        let future = MobileSchedulePayload(
            generatedAt: mine.generatedAt,
            range: .init(startDate: "2026-08-14", endDate: "2026-08-14"),
            scope: .mine,
            items: []
        )
        sync.sync(payload: future, userID: "employee-two", savedAt: savedAt)
        XCTAssertEqual(store.read()?.userID, "employee-one")
        sync.clear()
        XCTAssertNil(store.read())
    }

    private func makeSnapshot(
        userID: String = "employee-test",
        savedAt: Date = Date(timeIntervalSince1970: 1_786_628_400),
        items: [WidgetScheduleItem]
    ) -> WidgetScheduleSnapshot {
        WidgetScheduleSnapshot(userID: userID, generatedAt: savedAt, savedAt: savedAt, items: items)
    }

    private func widgetItem(
        id: String,
        jobID: String? = "job-test",
        status: String = "scheduled",
        startsAt: String = "2026-08-13T14:00:00.000Z",
        endsAt: String? = "2026-08-13T17:00:00.000Z",
        workdayNumber: Int? = nil,
        workdayCount: Int? = nil
    ) -> WidgetScheduleItem {
        WidgetScheduleItem(
            id: id,
            jobID: jobID,
            title: "Tree Removal",
            partyName: "Sample Customer",
            city: "Fredericksburg",
            status: status,
            startsAt: try! date(startsAt),
            endsAt: endsAt.flatMap { try? date($0) },
            allDay: false,
            workdayNumber: workdayNumber,
            workdayCount: workdayCount
        )
    }

    private func date(_ value: String) throws -> Date {
        try XCTUnwrap(CRMDateParser.date(from: value))
    }
}
