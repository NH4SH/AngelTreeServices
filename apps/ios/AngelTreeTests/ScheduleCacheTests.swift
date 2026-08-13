import XCTest
@testable import AngelTree

final class ScheduleCacheTests: XCTestCase {
    func testFreshnessBoundary() {
        let savedAt = Date(timeIntervalSince1970: 1_000)
        XCTAssertFalse(CacheFreshness.isStale(savedAt: savedAt, now: savedAt.addingTimeInterval(899)))
        XCTAssertTrue(CacheFreshness.isStale(savedAt: savedAt, now: savedAt.addingTimeInterval(901)))
    }

    func testCacheRoundTrip() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let cache = ScheduleCache(directory: directory)
        let payload = MobileSchedulePayload(
            generatedAt: "2026-08-12T12:00:00.000Z",
            range: .init(startDate: "2026-08-12", endDate: "2026-08-12"),
            scope: .mine,
            items: [makeItem(id: "cached")]
        )
        let value = CachedSchedule(payload: payload, savedAt: Date(timeIntervalSince1970: 2_000))

        await cache.write(value, key: "test")
        let restored = await cache.read(key: "test")

        XCTAssertEqual(restored, value)
        await cache.removeAll()
    }
}
