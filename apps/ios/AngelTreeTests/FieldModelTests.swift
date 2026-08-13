import Foundation
import XCTest
@testable import AngelTree

final class FieldModelTests: XCTestCase {
    func testCustomerAndOrganizationDetailsSupportMultipleOrNoLocations() {
        let customer = makePartyDetail()
        let organization = makePartyDetail(kind: .organization, locations: [])

        XCTAssertEqual(customer.serviceLocations.count, 1)
        XCTAssertEqual(customer.kind, .customer)
        XCTAssertTrue(organization.serviceLocations.isEmpty)
        XCTAssertEqual(organization.kind, .organization)
    }

    func testJobDetailSupportsMultidayMissingOptionalAndCompletedStates() {
        let scheduled = makeJobDetail()
        let completed = makeJobDetail(status: "completed")

        XCTAssertEqual(scheduled.workSessions.count, 2)
        XCTAssertNil(scheduled.serviceLocation)
        XCTAssertNil(scheduled.contractingParty?.email)
        XCTAssertEqual(scheduled.assignedEmployees.first?.name, "Saul Sierra")
        XCTAssertNotNil(completed.completedAt)
    }
}
