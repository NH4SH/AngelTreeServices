import Foundation

protocol MobileAPIClientProtocol: Sendable {
    func bootstrap(accessToken: String) async throws -> BootstrapPayload
    func schedule(
        startDate: String,
        endDate: String,
        scope: ScheduleScope,
        accessToken: String
    ) async throws -> MobileSchedulePayload
    func jobPhotos(jobID: String, accessToken: String) async throws -> [JobPhotoSummary]
    func searchCustomers(query: String, accessToken: String) async throws -> [MobilePartySearchResult]
    func partyDetail(kind: MobilePartyKind, id: String, accessToken: String) async throws -> MobilePartyDetail
    func jobDetail(jobID: String, accessToken: String) async throws -> MobileJobDetail
    func uploadJobPhoto(
        jobID: String,
        data: Data,
        fileName: String,
        mimeType: String,
        category: String,
        caption: String?,
        accessToken: String
    ) async throws
}

actor MobileAPIClient: MobileAPIClientProtocol {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func bootstrap(accessToken: String) async throws -> BootstrapPayload {
        try await get(path: "api/mobile/bootstrap", accessToken: accessToken)
    }

    func schedule(
        startDate: String,
        endDate: String,
        scope: ScheduleScope,
        accessToken: String
    ) async throws -> MobileSchedulePayload {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/mobile/schedule"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "start", value: startDate),
            URLQueryItem(name: "end", value: endDate),
            URLQueryItem(name: "scope", value: scope.rawValue),
        ]
        guard let url = components?.url else {
            throw MobileAPIError.invalidRequest
        }
        return try await get(url: url, accessToken: accessToken)
    }

    func jobPhotos(jobID: String, accessToken: String) async throws -> [JobPhotoSummary] {
        let payload: JobPhotoPayload = try await get(
            path: "api/crew/jobs/\(jobID)/photos",
            accessToken: accessToken
        )
        return payload.photos
    }

    func searchCustomers(query: String, accessToken: String) async throws -> [MobilePartySearchResult] {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/mobile/customers"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = components?.url else { throw MobileAPIError.invalidRequest }
        let payload: CustomerSearchPayload = try await get(url: url, accessToken: accessToken)
        return payload.results
    }

    func partyDetail(kind: MobilePartyKind, id: String, accessToken: String) async throws -> MobilePartyDetail {
        let payload: PartyDetailPayload = try await get(
            path: "api/mobile/parties/\(kind.rawValue)/\(id)",
            accessToken: accessToken
        )
        return payload.party
    }

    func jobDetail(jobID: String, accessToken: String) async throws -> MobileJobDetail {
        let payload: JobDetailPayload = try await get(
            path: "api/crew/jobs/\(jobID)",
            accessToken: accessToken
        )
        return payload.job
    }

    func uploadJobPhoto(
        jobID: String,
        data: Data,
        fileName: String,
        mimeType: String,
        category: String,
        caption: String?,
        accessToken: String
    ) async throws {
        let boundary = "AngelTree-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("api/crew/jobs/\(jobID)/photos"))
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = MultipartFormData(boundary: boundary)
            .addingField(name: "photo_type", value: category)
            .addingField(name: "caption", value: caption ?? "")
            .addingFile(name: "photo", fileName: fileName, mimeType: mimeType, data: data)
            .finalized()

        let (responseData, response): (Data, URLResponse)
        do {
            (responseData, response) = try await session.data(for: request)
        } catch {
            throw MobileAPIError.networkUnavailable
        }
        guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? decoder.decode(APIEnvelope<EmptyPayload>.self, from: responseData)
            if http.statusCode == 401 { throw MobileAPIError.authenticationRequired }
            if http.statusCode == 403 { throw MobileAPIError.accessDenied(envelope?.error?.message) }
            if [400, 413, 415].contains(http.statusCode) {
                throw MobileAPIError.requestRejected(envelope?.error?.message)
            }
            throw MobileAPIError.serverUnavailable(nil)
        }
    }

    private func get<Response: Decodable>(
        path: String,
        accessToken: String
    ) async throws -> Response {
        try await get(
            url: baseURL.appendingPathComponent(path),
            accessToken: accessToken
        )
    }

    private func get<Response: Decodable>(
        url: URL,
        accessToken: String
    ) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw MobileAPIError.networkUnavailable
        }

        guard let http = response as? HTTPURLResponse else {
            throw MobileAPIError.invalidResponse
        }

        let envelope: APIEnvelope<Response>
        do {
            envelope = try decoder.decode(APIEnvelope<Response>.self, from: data)
        } catch {
            throw MobileAPIError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode), let payload = envelope.data else {
            if http.statusCode == 401 {
                throw MobileAPIError.authenticationRequired
            }
            if http.statusCode == 403 {
                throw MobileAPIError.accessDenied(envelope.error?.message)
            }
            throw MobileAPIError.serverUnavailable(envelope.error?.message)
        }

        return payload
    }
}

private struct APIEnvelope<Payload: Decodable>: Decodable {
    let data: Payload?
    let error: APIErrorBody?
}

private struct APIErrorBody: Decodable {
    let code: String
    let message: String
}

enum MobileAPIError: LocalizedError, Equatable {
    case invalidRequest
    case networkUnavailable
    case invalidResponse
    case authenticationRequired
    case accessDenied(String?)
    case requestRejected(String?)
    case serverUnavailable(String?)

    var errorDescription: String? {
        switch self {
        case .invalidRequest:
            return "That request could not be prepared."
        case .networkUnavailable:
            return "Angel Tree could not be reached. Check your connection and try again."
        case .invalidResponse, .serverUnavailable:
            return "Angel Tree is temporarily unavailable. Try again shortly."
        case .authenticationRequired:
            return "Your session expired. Sign in again."
        case .accessDenied(let message):
            return message ?? "Your account does not have access to this information."
        case .requestRejected(let message):
            return message ?? "That request could not be completed. Check the information and try again."
        }
    }
}

private struct EmptyPayload: Decodable {}

private struct MultipartFormData {
    let boundary: String
    private var data = Data()

    init(boundary: String) {
        self.boundary = boundary
    }

    func addingField(name: String, value: String) -> MultipartFormData {
        var copy = self
        copy.data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        return copy
    }

    func addingFile(name: String, fileName: String, mimeType: String, data fileData: Data) -> MultipartFormData {
        var copy = self
        copy.data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(fileName)\"\r\nContent-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        copy.data.append(fileData)
        copy.data.append("\r\n".data(using: .utf8)!)
        return copy
    }

    func finalized() -> Data {
        var copy = data
        copy.append("--\(boundary)--\r\n".data(using: .utf8)!)
        return copy
    }
}

struct JobPhotoSummary: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let photoType: String
    let caption: String?
    let createdAt: String
    let signedUrl: String?
}

private struct JobPhotoPayload: Codable, Sendable {
    let photos: [JobPhotoSummary]
    let warning: String?
}
