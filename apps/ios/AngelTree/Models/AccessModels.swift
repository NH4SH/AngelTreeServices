import Foundation

enum PlatformRole: String, CaseIterable, Codable, Sendable {
    case owner
    case admin
    case payrollAdmin = "payroll_admin"
    case estimator
    case crew

    var displayName: String {
        switch self {
        case .owner: "Owner"
        case .admin: "Admin"
        case .payrollAdmin: "Payroll admin"
        case .estimator: "Estimator"
        case .crew: "Crew"
        }
    }
}

struct BootstrapPayload: Codable, Sendable {
    struct UserSummary: Codable, Equatable, Sendable {
        let id: String
        let email: String?
        let displayName: String?
    }

    struct EmployeeSummary: Codable, Equatable, Sendable {
        let id: String
        let displayName: String
        let email: String?
        let phone: String?
        let jobTitle: String?
        let crewName: String?
        let employmentStatus: String
        let isActive: Bool
    }

    struct Capabilities: Codable, Equatable, Sendable {
        let canViewTeamSchedule: Bool
        let canViewSchedule: Bool
    }

    let user: UserSummary
    let employee: EmployeeSummary?
    let roles: [String]
    let capabilities: Capabilities
}

struct AppAccess: Equatable, Sendable {
    let userID: String
    let email: String?
    let displayName: String
    let employee: BootstrapPayload.EmployeeSummary?
    let roles: Set<PlatformRole>
    let canViewTeamSchedule: Bool

    static func resolve(_ payload: BootstrapPayload) throws -> AppAccess {
        let resolvedRoles = Set(payload.roles.compactMap(PlatformRole.init(rawValue:)))
        guard !resolvedRoles.isEmpty, payload.capabilities.canViewSchedule else {
            throw AccessResolutionError.internalAccessRequired
        }

        let isCrewOnly = resolvedRoles == [.crew]
        if isCrewOnly && (payload.employee == nil || payload.employee?.isActive == false) {
            throw AccessResolutionError.employeeRecordRequired
        }

        return AppAccess(
            userID: payload.user.id,
            email: payload.user.email,
            displayName: payload.employee?.displayName
                ?? payload.user.displayName
                ?? payload.user.email
                ?? "Angel Tree team member",
            employee: payload.employee,
            roles: resolvedRoles,
            canViewTeamSchedule: payload.capabilities.canViewTeamSchedule
                && !resolvedRoles.isDisjoint(with: [.owner, .admin])
        )
    }

    var roleSummary: String {
        roles.sorted { $0.displayName < $1.displayName }
            .map(\.displayName)
            .joined(separator: ", ")
    }

    var canCreateParties: Bool {
        !roles.isDisjoint(with: [.owner, .admin, .payrollAdmin, .estimator])
    }

    var canManageProposals: Bool { canCreateParties }
    var canViewInvoices: Bool { canCreateParties }
    var canRecordManualPayments: Bool { !roles.isDisjoint(with: [.owner, .admin]) }
}

enum AccessResolutionError: LocalizedError, Equatable {
    case internalAccessRequired
    case employeeRecordRequired

    var errorDescription: String? {
        switch self {
        case .internalAccessRequired:
            return "This account does not have access to the Angel Tree field app."
        case .employeeRecordRequired:
            return "Your account needs an active employee record before field access can begin."
        }
    }
}
