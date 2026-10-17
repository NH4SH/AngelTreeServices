import Foundation

protocol MobileAPIClientProtocol: Sendable {
    func bootstrap(accessToken: String) async throws -> BootstrapPayload
    func schedule(
        startDate: String,
        endDate: String,
        scope: ScheduleScope,
        accessToken: String
    ) async throws -> MobileSchedulePayload
    func privateJobPhoto(id: String, accessToken: String) async throws -> Data
    func jobPhotos(jobID: String, accessToken: String) async throws -> [JobPhotoSummary]
    func customerDirectory(cursor: String?, limit: Int, accessToken: String) async throws -> MobilePartyDirectoryPage
    func searchCustomers(query: String, accessToken: String) async throws -> [MobilePartySearchResult]
    func createParty(_ input: MobilePartyCreateRequest, accessToken: String) async throws -> MobilePartySearchResult
    func jobs(
        scope: MobileJobDirectoryScope,
        cursor: String?,
        limit: Int,
        query: String?,
        accessToken: String
    ) async throws -> MobileJobDirectoryPage
    func quotes(scope: MobileQuoteScope, cursor: String?, limit: Int, query: String?, accessToken: String) async throws -> MobileQuotePage
    func quoteDetail(id: String, accessToken: String) async throws -> MobileQuoteDetail
    func createQuote(_ input: MobileQuoteWriteRequest, accessToken: String) async throws -> MobileQuoteDetail
    func updateQuote(id: String, input: MobileQuoteWriteRequest, accessToken: String) async throws -> MobileQuoteDetail
    func duplicateQuote(id: String, accessToken: String) async throws -> MobileQuoteDetail
    func invoices(scope: MobileInvoiceScope, cursor: String?, limit: Int, query: String?, accessToken: String) async throws -> MobileInvoicePage
    func invoiceDetail(id: String, accessToken: String) async throws -> MobileInvoicePayload
    func recordManualPayment(invoiceID: String, input: MobileManualPaymentRequest, accessToken: String) async throws -> MobileInvoicePayload
    func resolveManualPayment(invoiceID: String, requestID: String, accessToken: String) async throws -> MobileInvoicePayload
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

    func customerDirectory(
        cursor: String?,
        limit: Int,
        accessToken: String
    ) async throws -> MobilePartyDirectoryPage {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/mobile/customers"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { components?.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
        guard let url = components?.url else { throw MobileAPIError.invalidRequest }
        let payload: CustomerSearchPayload = try await get(url: url, accessToken: accessToken)
        return MobilePartyDirectoryPage(results: payload.results, nextCursor: payload.nextCursor)
    }

    func createParty(
        _ input: MobilePartyCreateRequest,
        accessToken: String
    ) async throws -> MobilePartySearchResult {
        let payload: CreatedPartyPayload = try await sendJSON(
            path: "api/mobile/customers",
            method: "POST",
            body: input,
            accessToken: accessToken
        )
        return payload.party
    }

    func jobs(
        scope: MobileJobDirectoryScope,
        cursor: String?,
        limit: Int,
        query: String?,
        accessToken: String
    ) async throws -> MobileJobDirectoryPage {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/mobile/jobs"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "scope", value: scope.rawValue),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        if let cursor { components?.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let query, !query.isEmpty {
            components?.queryItems?.append(URLQueryItem(name: "q", value: query))
        }
        guard let url = components?.url else { throw MobileAPIError.invalidRequest }
        let payload: MobileJobDirectoryPayload = try await get(url: url, accessToken: accessToken)
        return .init(results: payload.results, nextCursor: payload.nextCursor)
    }

    func quotes(scope: MobileQuoteScope, cursor: String?, limit: Int, query: String?, accessToken: String) async throws -> MobileQuotePage {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/mobile/quotes"), resolvingAgainstBaseURL: false)
        components?.queryItems = [.init(name: "scope", value: scope.rawValue), .init(name: "limit", value: String(limit))]
        if let cursor { components?.queryItems?.append(.init(name: "cursor", value: cursor)) }
        if let query, !query.isEmpty { components?.queryItems?.append(.init(name: "q", value: query)) }
        guard let url = components?.url else { throw MobileAPIError.invalidRequest }
        let payload: MobileQuoteDirectoryPayload = try await get(url: url, accessToken: accessToken)
        return .init(results: payload.results, nextCursor: payload.nextCursor)
    }

    func quoteDetail(id: String, accessToken: String) async throws -> MobileQuoteDetail {
        let payload: MobileQuotePayload = try await get(path: "api/mobile/quotes/\(id)", accessToken: accessToken)
        return payload.quote
    }

    func createQuote(_ input: MobileQuoteWriteRequest, accessToken: String) async throws -> MobileQuoteDetail {
        let payload: MobileQuotePayload = try await sendJSON(path: "api/mobile/quotes", method: "POST", body: input, accessToken: accessToken)
        return payload.quote
    }

    func updateQuote(id: String, input: MobileQuoteWriteRequest, accessToken: String) async throws -> MobileQuoteDetail {
        let payload: MobileQuotePayload = try await sendJSON(path: "api/mobile/quotes/\(id)/edit", method: "PATCH", body: input, accessToken: accessToken)
        return payload.quote
    }

    func duplicateQuote(id: String, accessToken: String) async throws -> MobileQuoteDetail {
        let payload: MobileQuotePayload = try await sendJSON(path: "api/mobile/quotes/\(id)/duplicate", method: "POST", body: EmptyRequest(), accessToken: accessToken)
        return payload.quote
    }

    func invoices(scope: MobileInvoiceScope, cursor: String?, limit: Int, query: String?, accessToken: String) async throws -> MobileInvoicePage {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/mobile/invoices"), resolvingAgainstBaseURL: false)
        components?.queryItems = [.init(name: "scope", value: scope.rawValue), .init(name: "limit", value: String(limit))]
        if let cursor { components?.queryItems?.append(.init(name: "cursor", value: cursor)) }
        if let query, !query.isEmpty { components?.queryItems?.append(.init(name: "q", value: query)) }
        guard let url = components?.url else { throw MobileAPIError.invalidRequest }
        let payload: MobileInvoiceDirectoryPayload = try await get(url: url, accessToken: accessToken)
        return .init(results: payload.results, nextCursor: payload.nextCursor)
    }

    func invoiceDetail(id: String, accessToken: String) async throws -> MobileInvoicePayload {
        try await get(path: "api/mobile/invoices/\(id)", accessToken: accessToken)
    }

    func recordManualPayment(invoiceID: String, input: MobileManualPaymentRequest, accessToken: String) async throws -> MobileInvoicePayload {
        try await sendJSON(path: "api/mobile/invoices/\(invoiceID)/manual-payment/attempt", method: "POST", body: input, accessToken: accessToken)
    }

    func resolveManualPayment(invoiceID: String, requestID: String, accessToken: String) async throws -> MobileInvoicePayload {
        struct Input: Encodable { let requestId: String; let intent = "resolve" }
        return try await sendJSON(path: "api/mobile/invoices/\(invoiceID)/manual-payment/attempt", method: "POST", body: Input(requestId: requestID), accessToken: accessToken)
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
        guard data.count > 0, data.count <= 6 * 1024 * 1024 else {
            throw MobileAPIError.requestRejected("Choose an image up to 6 MB.")
        }
        var ticketRequest = fileRequest(path: "api/uploads", accessToken: accessToken)
        ticketRequest.httpMethod = "POST"
        ticketRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        ticketRequest.httpBody = try JSONSerialization.data(withJSONObject: ["name": fileName, "type": mimeType, "size": data.count])
        let ticketData = try await fileResponse(ticketRequest)
        let ticket = try decoder.decode(UploadTicket.self, from: ticketData)
        guard let storage = URL(string: ticket.storageUrl), ["https", "http"].contains(storage.scheme),
              storage.scheme == "https" || ["127.0.0.1", "localhost"].contains(storage.host ?? ""),
              ticket.bucket == "platform-upload-staging", !ticket.path.contains("..") else { throw MobileAPIError.invalidResponse }
        var transfer = URLRequest(url: storage.appendingPathComponent("storage/v1/object/\(ticket.bucket)/\(ticket.path)"), cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
        transfer.httpMethod = "POST"
        transfer.timeoutInterval = 60
        transfer.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        transfer.setValue(ticket.publicKey, forHTTPHeaderField: "apikey")
        transfer.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        transfer.setValue("0", forHTTPHeaderField: "cache-control")
        transfer.setValue("false", forHTTPHeaderField: "x-upsert")
        transfer.httpBody = data
        _ = try await fileResponse(transfer)
        let boundary = "AngelTree-\(UUID().uuidString)"
        var request = fileRequest(path: "api/crew/jobs/\(jobID)/photos", accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = MultipartFormData(boundary: boundary)
            .addingField(name: "photo_type", value: category)
            .addingField(name: "caption", value: caption ?? "")
            .addingField(name: "photo", value: ticket.reference)
            .finalized()
        _ = try await fileResponse(request)
    }

    func privateJobPhoto(id: String, accessToken: String) async throws -> Data {
        guard UUID(uuidString: id) != nil else { throw MobileAPIError.invalidResponse }
        let path = "files/job_photo/\(id)"
        let manifestData = try await fileResponse(fileRequest(path: path + "?info=1", accessToken: accessToken, query: true))
        let manifest = try decoder.decode(PrivateFileManifest.self, from: manifestData)
        guard manifest.size > 0, manifest.size <= 6 * 1024 * 1024, manifest.chunkBytes == 1024 * 1024,
              manifest.mimeType.hasPrefix("image/") else { throw MobileAPIError.invalidResponse }
        var result = Data()
        for start in stride(from: 0, to: manifest.size, by: manifest.chunkBytes) {
            let end = min(start + manifest.chunkBytes, manifest.size) - 1
            var request = fileRequest(path: path, accessToken: accessToken)
            request.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
            request.setValue(manifest.version, forHTTPHeaderField: "If-Match")
            let (part, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 206,
                  http.value(forHTTPHeaderField: "Content-Range") == "bytes \(start)-\(end)/\(manifest.size)",
                  http.value(forHTTPHeaderField: "ETag") == manifest.version,
                  part.count == end - start + 1 else { throw MobileAPIError.requestRejected("Photo changed or access is unavailable. Try again.") }
            result.append(part)
        }
        return result
    }

    private func fileRequest(path: String, accessToken: String, query: Bool = false) -> URLRequest {
        let url = query ? URL(string: path, relativeTo: baseURL.appendingPathComponent("/"))!.absoluteURL : baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
        request.timeoutInterval = 60
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        return request
    }

    private func fileResponse(_ request: URLRequest) async throws -> Data {
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: request) }
        catch { throw MobileAPIError.networkUnavailable }
        guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw MobileAPIError.authenticationRequired }
            if http.statusCode == 403 { throw MobileAPIError.accessDenied(nil) }
            if [400, 404, 412, 413, 415].contains(http.statusCode) { throw MobileAPIError.requestRejected("File unavailable. Check the file and try again.") }
            throw MobileAPIError.serverUnavailable(nil)
        }
        return data
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

    private func sendJSON<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Body,
        accessToken: String
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw MobileAPIError.invalidRequest
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw MobileAPIError.networkUnavailable
        }
        guard let http = response as? HTTPURLResponse else { throw MobileAPIError.invalidResponse }
        let envelope = try? decoder.decode(APIEnvelope<Response>.self, from: data)
        guard (200..<300).contains(http.statusCode), let payload = envelope?.data else {
            if http.statusCode == 401 { throw MobileAPIError.authenticationRequired }
            if http.statusCode == 403 { throw MobileAPIError.accessDenied(envelope?.error?.message) }
            if (400..<500).contains(http.statusCode) { throw MobileAPIError.requestRejected(envelope?.error?.message) }
            throw MobileAPIError.serverUnavailable(envelope?.error?.message)
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
private struct EmptyRequest: Encodable {}

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

private struct UploadTicket: Decodable {
    let reference: String
    let bucket: String
    let path: String
    let storageUrl: String
    let publicKey: String
}
private struct PrivateFileManifest: Decodable {
    let size: Int
    let mimeType: String
    let version: String
    let chunkBytes: Int
}
extension MobileAPIClientProtocol {
    func privateJobPhoto(id: String, accessToken: String) async throws -> Data { throw MobileAPIError.invalidResponse }
}
