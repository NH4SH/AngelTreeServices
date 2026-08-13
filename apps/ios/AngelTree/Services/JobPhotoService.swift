import Foundation

protocol JobPhotoService: Sendable {
    func photos(for jobID: String) async throws -> [JobPhotoSummary]
}

actor LiveJobPhotoService: JobPhotoService {
    private let authentication: any AuthenticationService
    private let api: any MobileAPIClientProtocol

    init(
        authentication: any AuthenticationService,
        api: any MobileAPIClientProtocol
    ) {
        self.authentication = authentication
        self.api = api
    }

    func photos(for jobID: String) async throws -> [JobPhotoSummary] {
        let token = try await authentication.validAccessToken()
        return try await api.jobPhotos(jobID: jobID, accessToken: token)
    }
}
