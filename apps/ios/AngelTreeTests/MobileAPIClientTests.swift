import Foundation
import XCTest
@testable import AngelTree

final class MobileAPIClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.handler = nil
        super.tearDown()
    }

    func testAuthorizedCustomerSearchMapsMissingOptionalContactData() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
            XCTAssertEqual(request.url?.path, "/api/mobile/customers")
            return Self.response(request, status: 200, json: """
            {"data":{"results":[{"id":"customer-one","kind":"customer","name":"Donna Goodwin","contactName":null,"email":null,"phone":null,"address":"6917 Bloomsbury Ln"}]},"meta":{"apiVersion":"test"}}
            """)
        }

        let results = try await makeClient().searchCustomers(query: "Donna", accessToken: "access-token")
        XCTAssertEqual(results.first?.name, "Donna Goodwin")
        XCTAssertNil(results.first?.phone)
    }

    func testCustomerSearchMapsAnEmptyAuthorizedResult() async throws {
        URLProtocolStub.handler = { request in
            Self.response(request, status: 200, json: """
            {"data":{"results":[]},"meta":{"apiVersion":"test"}}
            """)
        }

        let results = try await makeClient().searchCustomers(query: "Nobody", accessToken: "access-token")
        XCTAssertTrue(results.isEmpty)
    }

    func testCustomerDirectorySendsBoundedCursorAndMapsNextPage() async throws {
        URLProtocolStub.handler = { request in
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "limit" })?.value, "25")
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "cursor" })?.value, "next-page")
            return Self.response(request, status: 200, json: """
            {"data":{"results":[{"id":"org-one","kind":"organization","name":"Fox Point HOA","contactName":null,"email":null,"phone":"540-555-0199","address":"100 Danford St"}],"nextCursor":"last-page"},"meta":{"apiVersion":"test"}}
            """)
        }

        let page = try await makeClient().customerDirectory(
            cursor: "next-page",
            limit: 25,
            accessToken: "access-token"
        )
        XCTAssertEqual(page.results.first?.kind, .organization)
        XCTAssertEqual(page.nextCursor, "last-page")
    }

    func testCreateCustomerSendsStructuredServiceLocationAndMapsCreatedParty() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            return Self.response(request, status: 201, json: """
            {"data":{"party":{"id":"customer-new","kind":"customer","name":"Donna Goodwin","contactName":"Donna Goodwin","email":null,"phone":"540-555-0100","address":"6917 Bloomsbury Ln, Spotsylvania, VA 22553"}},"meta":{"apiVersion":"test"}}
            """)
        }

        let input = MobilePartyCreateRequest(
            kind: .customer,
            name: "Donna Goodwin",
            contactName: nil,
            email: nil,
            phone: "540-555-0100",
            organizationType: nil,
            serviceLocation: .init(
                street: "6917 Bloomsbury Ln",
                city: "Spotsylvania",
                state: "VA",
                postalCode: "22553"
            )
        )
        XCTAssertEqual(input.serviceLocation?.street, "6917 Bloomsbury Ln")
        let party = try await makeClient().createParty(
            input,
            accessToken: "access-token"
        )
        XCTAssertEqual(party.id, "customer-new")
    }

    func testJobDirectorySendsScopeSearchAndCursorAndMapsMultiDayWork() async throws {
        URLProtocolStub.handler = { request in
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)
            XCTAssertEqual(request.url?.path, "/api/mobile/jobs")
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "scope" })?.value, "upcoming")
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "cursor" })?.value, "next-page")
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "q" })?.value, "Donna")
            return Self.response(request, status: 200, json: """
            {"data":{"results":[{"id":"job-one","status":"scheduled","operationalState":"scheduled","priority":"normal","serviceType":"tree_removal","title":"Tree Removal","party":{"id":"customer-one","kind":"customer","name":"Donna Goodwin"},"serviceLocation":{"id":"location-one","fullAddress":"6917 Bloomsbury Ln, Spotsylvania, VA 22553","city":"Spotsylvania"},"scheduledStartAt":"2026-08-14T12:00:00.000Z","scheduledEndAt":"2026-08-14T16:00:00.000Z","completedAt":null,"updatedAt":"2026-08-13T12:00:00.000Z","assignedCrewNames":["Saul Sierra"],"workdayCount":2}],"nextCursor":"last-page"},"meta":{"apiVersion":"test"}}
            """)
        }

        let page = try await makeClient().jobs(
            scope: .upcoming,
            cursor: "next-page",
            limit: 25,
            query: "Donna",
            accessToken: "access-token"
        )
        XCTAssertEqual(page.results.first?.party?.kind, .customer)
        XCTAssertEqual(page.results.first?.workdayCount, 2)
        XCTAssertEqual(page.nextCursor, "last-page")
    }

    func testPartyDetailMapsCustomerAndOrganizationLocationStates() async throws {
        URLProtocolStub.handler = { request in
            if request.url?.path.contains("/organization/") == true {
                return Self.response(request, status: 200, json: """
                {"data":{"party":{"id":"org-one","kind":"organization","name":"Rappahannock Properties Inc","contactName":"Site manager","email":null,"phone":null,"status":"active","serviceLocations":[],"contacts":[],"jobs":[],"proposals":[],"invoices":[]}},"meta":{"apiVersion":"test"}}
                """)
            }
            return Self.response(request, status: 200, json: """
            {"data":{"party":{"id":"customer-one","kind":"customer","name":"Donna Goodwin","contactName":null,"email":null,"phone":"540-555-0100","status":"active","serviceLocations":[{"id":"one","label":"Primary","fullAddress":"6917 Bloomsbury Ln, Spotsylvania, VA 22553","accessNotes":"Use side gate","gateCode":null,"serviceNotes":null},{"id":"two","label":"Rental","fullAddress":"10 Main St, Richmond, VA 23219","accessNotes":null,"gateCode":null,"serviceNotes":null}],"contacts":[],"jobs":[],"proposals":[],"invoices":[]}},"meta":{"apiVersion":"test"}}
            """)
        }

        let client = makeClient()
        let customer = try await client.partyDetail(kind: .customer, id: "customer-one", accessToken: "access-token")
        let organization = try await client.partyDetail(kind: .organization, id: "org-one", accessToken: "access-token")
        XCTAssertEqual(customer.serviceLocations.count, 2)
        XCTAssertEqual(organization.kind, .organization)
        XCTAssertTrue(organization.serviceLocations.isEmpty)
    }

    func testAuthorizedPhotoGalleryMapsPrivateSignedURLs() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/crew/jobs/job-one/photos")
            return Self.response(request, status: 200, json: """
            {"data":{"photos":[{"id":"photo-one","photoType":"during","caption":"Canopy before cleanup","createdAt":"2026-08-13T12:00:00.000Z","signedUrl":"https://storage.example/signed/photo"}],"warning":null},"meta":{"apiVersion":"test"}}
            """)
        }

        let photos = try await makeClient().jobPhotos(jobID: "job-one", accessToken: "access-token")
        XCTAssertEqual(photos.first?.caption, "Canopy before cleanup")
        XCTAssertEqual(photos.first?.signedUrl, "https://storage.example/signed/photo")
    }

    func testRestrictedJobReturnsAccessDenied() async {
        URLProtocolStub.handler = { request in
            Self.response(request, status: 403, json: """
            {"error":{"code":"job_not_available","message":"This job is not assigned to this crew account."},"meta":{"apiVersion":"test"}}
            """)
        }

        do {
            _ = try await makeClient().jobDetail(jobID: "restricted", accessToken: "access-token")
            XCTFail("Expected access to be denied")
        } catch let error as MobileAPIError {
            XCTAssertEqual(error, .accessDenied("This job is not assigned to this crew account."))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testPhotoUploadAcceptsSuccessAndSurfacesValidationFailure() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
            if request.url?.path == "/api/uploads" {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
                return Self.response(request, status: 200, json: """
                {"reference":"ats-upload:v1:test","bucket":"platform-upload-staging","path":"actor/file","storageUrl":"https://storage.example.test","publicKey":"public-key"}
                """)
            }
            if request.url?.host == "storage.example.test" {
                XCTAssertEqual(Self.fileBody(request), Data([1, 2, 3]))
                XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "public-key")
                return Self.response(request, status: 200, json: "{}")
            }
            XCTAssertTrue(request.value(forHTTPHeaderField: "Content-Type")?.contains("multipart/form-data") == true)
            let body = String(data: Self.fileBody(request), encoding: .utf8) ?? ""
            XCTAssertTrue(body.contains("ats-upload:v1:test"))
            XCTAssertFalse(body.contains("filename="))
            return Self.response(request, status: 201, json: """
            {"data":{"message":"Photo uploaded."},"meta":{"apiVersion":"test"}}
            """)
        }
        let client = makeClient()
        try await client.uploadJobPhoto(
            jobID: "job-one",
            data: Data([1, 2, 3]),
            fileName: "photo.jpg",
            mimeType: "image/jpeg",
            category: "during",
            caption: nil,
            accessToken: "access-token"
        )

        URLProtocolStub.handler = { request in
            Self.response(request, status: 415, json: """
            {"error":{"code":"unsupported_media_type","message":"Upload photos as multipart form data."},"meta":{"apiVersion":"test"}}
            """)
        }
        do {
            try await client.uploadJobPhoto(
                jobID: "job-one",
                data: Data([1]),
                fileName: "photo.txt",
                mimeType: "text/plain",
                category: "during",
                caption: nil,
                accessToken: "access-token"
            )
            XCTFail("Expected upload validation to fail")
        } catch let error as MobileAPIError {
            XCTAssertEqual(error, .requestRejected("File unavailable. Check the file and try again."))
        }
    }

    func testPrivatePhotoRequiresFreshVersionedChunksAndNeverUsesSignedURL() async throws {
        let id = "00000000-0000-4000-8000-000000000001"
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/files/job_photo/\(id)")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
            XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalAndRemoteCacheData)
            if request.url?.query == "info=1" {
                return Self.response(request, status: 200, json: """
                {"size":3,"mimeType":"image/png","version":"version-one","chunkBytes":1048576}
                """)
            }
            XCTAssertEqual(request.value(forHTTPHeaderField: "Range"), "bytes=0-2")
            XCTAssertEqual(request.value(forHTTPHeaderField: "If-Match"), "version-one")
            return (HTTPURLResponse(url: request.url!, statusCode: 206, httpVersion: nil,
                headerFields: ["Content-Range":"bytes 0-2/3", "ETag":"version-one"])!, Data([1, 2, 3]))
        }
        let data = try await makeClient().privateJobPhoto(id: id, accessToken: "access-token")
        XCTAssertEqual(data, Data([1, 2, 3]))
        URLProtocolStub.handler = { request in Self.response(request, status: 404, json: "{}") }
        do { _ = try await makeClient().privateJobPhoto(id: id, accessToken: "access-token"); XCTFail("Revoked access must fail") }
        catch let error as MobileAPIError { XCTAssertEqual(error, .requestRejected("File unavailable. Check the file and try again.")) }
    }

    func testQuoteAttemptRetainsIdentityAcrossRetriesAndCorrections() {
        var attempt = MobileQuoteCreationAttempt()
        let first = attempt.prepare(quoteRequest())
        XCTAssertNotNil(first.requestId.flatMap(UUID.init(uuidString:)))
        XCTAssertEqual(attempt.prepare(quoteRequest()), first)
        let corrected = attempt.prepare(quoteRequest(message: "Corrected after validation"))
        XCTAssertEqual(corrected.requestId, first.requestId)
        XCTAssertEqual(attempt.submitted, corrected)
        var another = MobileQuoteCreationAttempt()
        XCTAssertNotEqual(another.prepare(quoteRequest()).requestId, first.requestId)
    }

    func testKeyedQuoteCreateRequiresMatchingAcknowledgement() async throws {
        let id = "a0000000-0000-4000-8000-000000000006"
        var input = quoteRequest(); input.requestId = id
        for replayed in [false, true] {
            URLProtocolStub.handler = { request in
                XCTAssertEqual(request.url?.path, "/api/mobile/quotes/draft")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
                let body = try JSONSerialization.jsonObject(with: Self.fileBody(request)) as? [String: Any]
                XCTAssertEqual(body?["requestId"] as? String, id)
                return Self.response(request, status: 201, json: Self.quoteResponse(ack: ",\"creationRequestId\":\"\(id)\",\"creationReplayed\":\(replayed)"))
            }
            let result = try await makeClient().createQuote(input, accessToken: "token")
            XCTAssertEqual(result.creationRequestId, id)
            XCTAssertEqual(result.creationReplayed, replayed)
        }
        for ack in ["", ",\"creationRequestId\":\"foreign\",\"creationReplayed\":false", ",\"creationRequestId\":\"\(id)\""] {
            URLProtocolStub.handler = { request in Self.response(request, status: 201, json: Self.quoteResponse(ack: ack)) }
            do { _ = try await makeClient().createQuote(input, accessToken: "token"); XCTFail("Unconfirmed creation must fail") }
            catch let error as MobileAPIError { guard case .requestRejected = error else { return XCTFail("Expected safe uncertainty") } }
        }
    }

    func testKeyedQuoteNeverFallsBackWhenServerIsOldOrResponseIsLost() async throws {
        var input = quoteRequest(); input.requestId = "a0000000-0000-4000-8000-000000000006"
        for status in [404, 405, 503] {
            var calls = 0
            URLProtocolStub.handler = { request in
                calls += 1
                XCTAssertEqual(request.url?.path, "/api/mobile/quotes/draft")
                return Self.response(request, status: status, json: "{}")
            }
            do { _ = try await makeClient().createQuote(input, accessToken: "token"); XCTFail("Expected refusal") } catch {}
            XCTAssertEqual(calls, 1)
        }
        var calls = 0
        URLProtocolStub.handler = { request in calls += 1; throw URLError(.networkConnectionLost) }
        do { _ = try await makeClient().createQuote(input, accessToken: "token"); XCTFail("Expected uncertainty") }
        catch { XCTAssertEqual(error as? MobileAPIError, .networkUnavailable) }
        XCTAssertEqual(calls, 1)
    }

    func testLegacyQuoteCreateAndCacheRemainCompatible() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/quotes")
            let body = try JSONSerialization.jsonObject(with: Self.fileBody(request)) as? [String: Any]
            XCTAssertNil(body?["requestId"])
            return Self.response(request, status: 201, json: Self.quoteResponse())
        }
        let result = try await makeClient().createQuote(quoteRequest(), accessToken: "token")
        XCTAssertNil(result.creationRequestId)
        XCTAssertNil(result.creationReplayed)
    }

    func testMalformedQuoteRequestIdentityCannotSend() async throws {
        URLProtocolStub.handler = { _ in XCTFail("Must not issue a request"); throw URLError(.badURL) }
        var input = quoteRequest(); input.requestId = ""
        do { _ = try await makeClient().createQuote(input, accessToken: "token"); XCTFail("Expected refusal") }
        catch { XCTAssertEqual(error as? MobileAPIError, .invalidRequest) }
    }

    private func quoteRequest(message: String? = nil) -> MobileQuoteWriteRequest {
        .init(customerId: "customer", organizationId: nil, serviceLocationId: "location", customerMessage: message,
              expiresAt: nil, recipientContactId: nil, approvalContactId: nil,
              lines: [.init(id: nil, name: "Pruning", description: "Keep scope", quantity: 1, unitPriceCents: 1000, totalCents: nil)])
    }

    private static func quoteResponse(ack: String = "") -> String {
        """
        {"data":{"quote":{"id":"a0000000-0000-4000-8000-000000000001","status":"draft","title":"Pruning","totalCents":1000,"createdAt":"2026-10-21","updatedAt":"2026-10-21","serviceLocation":{"id":"location","fullAddress":"Synthetic property"},"lines":[],"portalStatus":"none"\(ack)}}}
        """
    }

    private static func fileBody(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(); var bytes = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            if count <= 0 { break }
            result.append(contentsOf: bytes.prefix(count))
        }
        return result
    }

    private func makeClient() -> MobileAPIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        return MobileAPIClient(
            baseURL: URL(string: "https://admin.angeltreeservices.org")!,
            session: URLSession(configuration: configuration)
        )
    }

    private static func response(_ request: URLRequest, status: Int, json: String) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, Data(json.utf8))
    }
}

private final class URLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw URLError(.badServerResponse) }
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
