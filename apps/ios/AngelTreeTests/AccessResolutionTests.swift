import XCTest
@testable import AngelTree

final class AccessResolutionTests: XCTestCase {
    func testOwnerCanResolveTeamScheduleCapability() throws {
        let access = try AppAccess.resolve(payload(roles: ["owner"], team: true))
        XCTAssertEqual(access.roles, [.owner])
        XCTAssertTrue(access.canViewTeamSchedule)
    }

    func testCrewRequiresActiveEmployeeIdentity() {
        XCTAssertThrowsError(
            try AppAccess.resolve(payload(roles: ["crew"], employee: nil))
        ) { error in
            XCTAssertEqual(error as? AccessResolutionError, .employeeRecordRequired)
        }
    }

    func testUnknownOrCustomerOnlyRolesDoNotGrantInternalAccess() {
        XCTAssertThrowsError(
            try AppAccess.resolve(payload(roles: ["customer"], employee: nil))
        ) { error in
            XCTAssertEqual(error as? AccessResolutionError, .internalAccessRequired)
        }
    }

    func testInternalStaffCanCreatePartiesButCrewCannot() throws {
        for role in ["owner", "admin", "payroll_admin", "estimator"] {
            XCTAssertTrue(try AppAccess.resolve(payload(roles: [role])).canCreateParties)
        }
        XCTAssertFalse(try AppAccess.resolve(payload(roles: ["crew"])).canCreateParties)
    }

    private func payload(
        roles: [String],
        employee: BootstrapPayload.EmployeeSummary? = .init(
            id: "employee-one",
            displayName: "Saul Sierra",
            email: "saul@example.com",
            phone: nil,
            jobTitle: "Crew",
            crewName: "Crew 1",
            employmentStatus: "active",
            isActive: true
        ),
        team: Bool = false
    ) -> BootstrapPayload {
        BootstrapPayload(
            user: .init(id: "user-one", email: "saul@example.com", displayName: "Saul Sierra"),
            employee: employee,
            roles: roles,
            capabilities: .init(canViewTeamSchedule: team, canViewSchedule: true)
        )
    }
}
