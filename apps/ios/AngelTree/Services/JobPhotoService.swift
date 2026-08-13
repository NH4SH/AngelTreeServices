import Foundation

protocol JobPhotoService: Sendable {
    func photos(for jobID: String) async throws -> [JobPhotoSummary]
    func upload(
        jobID: String,
        data: Data,
        fileName: String,
        mimeType: String,
        category: String,
        caption: String?
    ) async throws
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

    func upload(
        jobID: String,
        data: Data,
        fileName: String,
        mimeType: String,
        category: String,
        caption: String?
    ) async throws {
        let token = try await authentication.validAccessToken()
        try await api.uploadJobPhoto(
            jobID: jobID,
            data: data,
            fileName: fileName,
            mimeType: mimeType,
            category: category,
            caption: caption,
            accessToken: token
        )
    }
}
