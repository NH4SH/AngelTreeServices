import Foundation
@testable import AngelTree

func makeItem(
    id: String,
    startsAt: String = "2026-08-12T12:00:00.000Z",
    eventType: String = "job",
    status: String = "scheduled",
    party: MobileScheduleItem.Party? = .init(
        id: "customer-one",
        kind: .customer,
        name: "Donna Goodwin",
        email: "donna@example.com",
        phone: "540-555-0100"
    ),
    location: MobileScheduleItem.Location? = .init(
        label: "Primary service location",
        fullAddress: "6917 Bloomsbury Ln Spotsylvania, VA 22553",
        accessNotes: nil,
        serviceNotes: nil
    ),
    workdayNumber: Int? = nil,
    workdayCount: Int? = nil
) -> MobileScheduleItem {
    MobileScheduleItem(
        id: id,
        source: "schedule_event",
        title: "Tree removal",
        eventType: eventType,
        status: status,
        startsAt: startsAt,
        endsAt: "2026-08-12T16:00:00.000Z",
        allDay: false,
        jobId: "job-one",
        serviceLocationId: "location-one",
        party: party,
        location: location,
        assignees: [
            .init(id: "employee-one", authUserId: "user-one", name: "Saul Sierra"),
        ],
        customerFacingScope: "Remove the rear oak",
        teamNotes: "Use the side gate",
        equipment: [],
        materials: [],
        workdayNumber: workdayNumber,
        workdayCount: workdayCount
    )
}
