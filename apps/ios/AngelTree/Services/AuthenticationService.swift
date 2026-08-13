import Foundation
import Supabase

struct AuthIdentity: Equatable, Sendable {
    let userID: String
    let email: String?
}

protocol AuthenticationService: Sendable {
    func restoreSession() async throws -> AuthIdentity?
    func signIn(email: String, password: String) async throws -> AuthIdentity
    func validAccessToken() async throws -> String
    func signOut() async throws
}

actor SupabaseAuthenticationService: AuthenticationService {
    private let client: SupabaseClient

    init(configuration: AppConfiguration) {
        client = SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabasePublishableKey
        )
    }

    func restoreSession() async throws -> AuthIdentity? {
        do {
            return identity(from: try await client.auth.session)
        } catch let error as AuthError where error == .sessionMissing {
            return nil
        } catch {
            if let cachedSession = client.auth.currentSession {
                return identity(from: cachedSession)
            }
            throw error
        }
    }

    func signIn(email: String, password: String) async throws -> AuthIdentity {
        let session = try await client.auth.signIn(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            password: password
        )
        return identity(from: session)
    }

    func validAccessToken() async throws -> String {
        try await client.auth.session.accessToken
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    private func identity(from session: Session) -> AuthIdentity {
        AuthIdentity(
            userID: session.user.id.uuidString,
            email: session.user.email
        )
    }
}
