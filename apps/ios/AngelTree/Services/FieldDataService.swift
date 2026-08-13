import Foundation

protocol FieldDataService: Sendable {
    func searchParties(query: String) async throws -> [MobilePartySearchResult]
    func partyDetail(
        kind: MobilePartyKind,
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobilePartyDetail, cached: Bool)
    func jobDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileJobDetail, cached: Bool)
}

actor LiveFieldDataService: FieldDataService {
    private let authentication: any AuthenticationService
    private let api: any MobileAPIClientProtocol
    private let cache: FieldCache

    init(authentication: any AuthenticationService, api: any MobileAPIClientProtocol, cache: FieldCache) {
        self.authentication = authentication
        self.api = api
        self.cache = cache
    }

    func searchParties(query: String) async throws -> [MobilePartySearchResult] {
        let token = try await authentication.validAccessToken()
        return try await api.searchCustomers(query: query, accessToken: token)
    }

    func partyDetail(
        kind: MobilePartyKind,
        id: String,
        userID: String,
        allowCached: Bool
    ) async throws -> (detail: MobilePartyDetail, cached: Bool) {
        if allowCached, let cached = await cache.readParty(userID: userID, kind: kind, id: id) {
            return (cached, true)
        }
        let token = try await authentication.validAccessToken()
        let detail = try await api.partyDetail(kind: kind, id: id, accessToken: token)
        await cache.writeParty(detail, userID: userID)
        return (detail, false)
    }

    func jobDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileJobDetail, cached: Bool) {
        if allowCached, let cached = await cache.readJob(userID: userID, id: id) {
            return (cached, true)
        }
        let token = try await authentication.validAccessToken()
        let detail = try await api.jobDetail(jobID: id, accessToken: token)
        await cache.writeJob(detail, userID: userID)
        return (detail, false)
    }
}
