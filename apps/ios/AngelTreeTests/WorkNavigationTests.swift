import XCTest
@testable import AngelTree

final class WorkNavigationTests: XCTestCase {
    func testOfficeRolesSeeAllAuthorizedWorkSections() throws {
        for role in ["owner", "admin", "payroll_admin", "estimator"] {
            let access = try AppAccess.resolve(payload(roles: [role]))
            XCTAssertEqual(WorkSection.available(for: access), [.jobs, .proposals, .invoices])
        }
    }

    func testCrewOnlySeesJobs() throws {
        let access = try AppAccess.resolve(payload(roles: ["crew"]))
        XCTAssertEqual(WorkSection.available(for: access), [.jobs])
    }

    private func payload(roles: [String]) -> BootstrapPayload {
        BootstrapPayload(
            user: .init(id: "user-one", email: "crew@example.com", displayName: "Crew Member"),
            employee: .init(
                id: "employee-one",
                displayName: "Crew Member",
                email: "crew@example.com",
                phone: nil,
                jobTitle: "Crew",
                crewName: "Crew 1",
                employmentStatus: "active",
                isActive: true
            ),
            roles: roles,
            capabilities: .init(canViewTeamSchedule: false, canViewSchedule: true)
        )
    }
}
