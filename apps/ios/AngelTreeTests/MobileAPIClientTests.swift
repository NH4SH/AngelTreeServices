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
            XCTAssertTrue(request.value(forHTTPHeaderField: "Content-Type")?.contains("multipart/form-data") == true)
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
            XCTAssertEqual(error, .requestRejected("Upload photos as multipart form data."))
        }
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
