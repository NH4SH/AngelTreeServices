import Foundation
import XCTest
@testable import AngelTree

final class FieldCacheTests: XCTestCase {
    func testPartyCacheIsIsolatedByAuthenticatedUserAndClearsOnLogout() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AngelTreeFieldCacheTests-\(UUID().uuidString)")
        let cache = FieldCache(directory: directory)
        let party = makePartyDetail()

        await cache.writeParty(party, userID: "user-one")

        let firstUser = await cache.readParty(userID: "user-one", kind: .customer, id: party.id)
        let secondUser = await cache.readParty(userID: "user-two", kind: .customer, id: party.id)
        XCTAssertEqual(firstUser, party)
        XCTAssertNil(secondUser)

        await cache.removeAll()
        let removed = await cache.readParty(userID: "user-one", kind: .customer, id: party.id)
        XCTAssertNil(removed)
    }

    func testJobCacheRoundTripPreservesAssignedEmployeesAndOptionalFields() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AngelTreeJobCacheTests-\(UUID().uuidString)")
        let cache = FieldCache(directory: directory)
        let job = makeJobDetail()

        await cache.writeJob(job, userID: "user-one")
        let loaded = await cache.readJob(userID: "user-one", id: job.id)

        XCTAssertEqual(loaded, job)
        XCTAssertEqual(loaded?.assignedEmployees.map(\.name), ["Saul Sierra"])
        await cache.removeAll()
    }

    func testRecentPartiesAreOrderedDeduplicatedBoundedAndUserIsolated() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AngelTreeRecentPartyTests-\(UUID().uuidString)")
        let cache = FieldCache(directory: directory)

        for index in 0..<10 {
            await cache.writeParty(
                makePartyDetail(id: "party-\(index)", name: "Customer \(index)"),
                userID: "user-one"
            )
        }
        await cache.writeParty(
            makePartyDetail(id: "party-4", name: "Customer Four Updated"),
            userID: "user-one"
        )

        let firstUser = await cache.readRecentParties(userID: "user-one")
        let secondUser = await cache.readRecentParties(userID: "user-two")

        XCTAssertEqual(firstUser.count, 8)
        XCTAssertEqual(firstUser.first?.id, "party-4")
        XCTAssertEqual(firstUser.first?.name, "Customer Four Updated")
        XCTAssertEqual(firstUser.filter { $0.id == "party-4" }.count, 1)
        XCTAssertTrue(secondUser.isEmpty)
        await cache.removeAll()
    }

    func testJobDirectoryCacheIsScopedByUserAndOperationalView() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AngelTreeJobDirectoryCacheTests-\(UUID().uuidString)")
        let cache = FieldCache(directory: directory)
        let upcoming = makeJobDirectoryItem(id: "upcoming-one", status: "scheduled")
        let completed = makeJobDirectoryItem(id: "completed-one", status: "completed")

        await cache.writeJobDirectory([upcoming], userID: "user-one", scope: .upcoming)
        await cache.writeJobDirectory([completed], userID: "user-one", scope: .completed)

        let firstUserUpcoming = await cache.readJobDirectory(userID: "user-one", scope: .upcoming)
        let firstUserCompleted = await cache.readJobDirectory(userID: "user-one", scope: .completed)
        let secondUserUpcoming = await cache.readJobDirectory(userID: "user-two", scope: .upcoming)
        XCTAssertEqual(firstUserUpcoming, [upcoming])
        XCTAssertEqual(firstUserCompleted, [completed])
        XCTAssertNil(secondUserUpcoming)
        await cache.removeAll()
    }
}

func makeJobDirectoryItem(id: String, status: String = "scheduled") -> MobileJobDirectoryItem {
    .init(
        id: id,
        status: status,
        operationalState: status == "completed" ? "work_complete" : "scheduled",
        priority: "normal",
        serviceType: "tree_removal",
        title: "Tree Removal",
        party: .init(id: "customer-one", kind: .customer, name: "Donna Goodwin"),
        serviceLocation: .init(
            id: "location-one",
            fullAddress: "6917 Bloomsbury Ln, Spotsylvania, VA 22553",
            city: "Spotsylvania"
        ),
        scheduledStartAt: "2026-08-14T12:00:00.000Z",
        scheduledEndAt: "2026-08-14T16:00:00.000Z",
        completedAt: status == "completed" ? "2026-08-14T16:00:00.000Z" : nil,
        updatedAt: "2026-08-14T16:00:00.000Z",
        assignedCrewNames: ["Saul Sierra"],
        workdayCount: 2
    )
}

func makePartyDetail(
    id: String = "party-one",
    name: String? = nil,
    kind: MobilePartyKind = .customer,
    locations: [MobileServiceLocation] = [
        .init(
            id: "location-one",
            label: "Primary service location",
            fullAddress: "6917 Bloomsbury Ln, Spotsylvania, VA 22553",
            accessNotes: "Use side gate",
            gateCode: nil,
            serviceNotes: nil
        ),
    ]
) -> MobilePartyDetail {
    .init(
        id: id,
        kind: kind,
        name: name ?? (kind == .organization ? "Rappahannock Properties Inc" : "Donna Goodwin"),
        contactName: kind == .organization ? "Site manager" : nil,
        email: nil,
        phone: "540-555-0100",
        status: "active",
        serviceLocations: locations,
        contacts: [],
        jobs: [],
        proposals: [],
        invoices: []
    )
}

func makeJobDetail(status: String = "scheduled") -> MobileJobDetail {
    .init(
        id: "job-one",
        status: status,
        serviceType: "tree_removal",
        priority: "normal",
        scheduledStartAt: "2026-08-13T12:00:00.000Z",
        scheduledEndAt: "2026-08-13T16:00:00.000Z",
        scope: "Remove rear oak",
        completedAt: status == "completed" ? "2026-08-13T16:00:00.000Z" : nil,
        contractingParty: .init(
            id: "customer-one",
            kind: .customer,
            name: "Donna Goodwin",
            email: nil,
            phone: nil
        ),
        serviceLocation: nil,
        crewVisibleNotes: [],
        assignedEmployees: [.init(id: "employee-one", name: "Saul Sierra")],
        workSessions: [
            .init(id: "event-one", startsAt: "2026-08-13T12:00:00.000Z", endsAt: nil, status: status, notes: nil),
            .init(id: "event-two", startsAt: "2026-08-14T12:00:00.000Z", endsAt: nil, status: status, notes: nil),
        ],
        equipment: [],
        materials: []
    )
}
