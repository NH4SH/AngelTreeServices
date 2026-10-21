import Foundation
import CryptoKit
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

    func testDuplicateFreezesOrderedScopeAndClearsOriginalLineIdentities() throws {
        let source = duplicateSource()
        let attempt = try MobileQuoteDuplicateAttempt(source: source, now: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(attempt.sourceQuoteID, source.id)
        XCTAssertNotNil(attempt.request.requestId.flatMap(UUID.init(uuidString:)))
        XCTAssertEqual(attempt.request.customerId, source.party?.id)
        XCTAssertNil(attempt.request.organizationId)
        XCTAssertEqual(attempt.request.serviceLocationId, source.serviceLocation.id)
        XCTAssertEqual(attempt.request.customerMessage, source.customerMessage)
        XCTAssertEqual(attempt.request.lines.map(\.name), ["Pruning", "Cleanup"])
        XCTAssertEqual(attempt.request.lines[0].description, "Keep lower branches\nHaul brush")
        XCTAssertEqual(attempt.request.lines[0].quantity, 1.25)
        XCTAssertEqual(attempt.request.lines[0].unitPriceCents, 12345)
        XCTAssertTrue(attempt.request.lines.allSatisfy { $0.id == nil && $0.totalCents == nil })
        XCTAssertNil(attempt.request.expectedRevision)
        XCTAssertEqual(attempt.request.expiresAt, source.expiresAt)
        let changedSource = duplicateSource(note: "Edited after first request")
        XCTAssertNotEqual(changedSource.customerMessage, attempt.request.customerMessage)
    }

    func testDuplicateOrganizationKeepsBothContactsAndExpiresOnlyOnce() throws {
        let source = duplicateSource(kind: .organization)
        let expired = try MobileQuoteDuplicateAttempt(source: source, now: Date.distantFuture)
        XCTAssertNil(expired.request.customerId)
        XCTAssertEqual(expired.request.organizationId, source.party?.id)
        XCTAssertEqual(expired.request.recipientContactId, source.recipientContactId)
        XCTAssertEqual(expired.request.approvalContactId, source.approvalContactId)
        XCTAssertNil(expired.request.expiresAt)
        let future = try MobileQuoteDuplicateAttempt(source: source, now: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(future.request.expiresAt, source.expiresAt)
        XCTAssertNotEqual(future.request.requestId, expired.request.requestId)
    }

    func testDuplicateConfirmationRejectsForeignMissingAndSourceReceipts() throws {
        var attempt = try MobileQuoteDuplicateAttempt(source: duplicateSource())
        var result = duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
        XCTAssertThrowsError(try attempt.confirm(result))
        XCTAssertNil(attempt.confirmed)
        result.creationRequestId = "foreign"; result.creationReplayed = false
        XCTAssertThrowsError(try attempt.confirm(result))
        result.creationRequestId = attempt.request.requestId; result.creationReplayed = nil
        XCTAssertThrowsError(try attempt.confirm(result))
        var original = duplicateSource(); original.creationRequestId = attempt.request.requestId; original.creationReplayed = false
        XCTAssertThrowsError(try attempt.confirm(original))
        XCTAssertNil(attempt.confirmed)
        result.creationReplayed = false
        XCTAssertFalse(try attempt.confirm(result))
        XCTAssertEqual(attempt.confirmed?.id, result.id)
        var foreign = duplicateSource(id: "c0000000-0000-4000-8000-000000000001")
        foreign.creationRequestId = attempt.request.requestId; foreign.creationReplayed = true
        XCTAssertThrowsError(try attempt.confirm(foreign))
        XCTAssertEqual(attempt.confirmed?.id, result.id)
    }

    func testDuplicateReplayCanReviewACopyThatWasLaterApproved() throws {
        var attempt = try MobileQuoteDuplicateAttempt(source: duplicateSource())
        var result = duplicateSource(id: "b0000000-0000-4000-8000-000000000001", status: "approved", note: "Later office edit")
        result.creationRequestId = attempt.request.requestId; result.creationReplayed = true
        XCTAssertTrue(try attempt.confirm(result))
        XCTAssertEqual(attempt.confirmed?.status, "approved")
        XCTAssertEqual(attempt.confirmed?.customerMessage, "Later office edit")
        XCTAssertNotEqual(attempt.request.customerMessage, result.customerMessage)
    }

    func testDuplicateLostResponseRetriesExactBodyAndNeverCallsLegacyEndpoint() async throws {
        var attempt = try MobileQuoteDuplicateAttempt(source: duplicateSource())
        let expected = attempt.request
        var calls = 0; var firstBody: Data?
        URLProtocolStub.handler = { request in
            calls += 1
            XCTAssertEqual(request.url?.path, "/api/mobile/quotes/copy")
            let data = Self.fileBody(request)
            let decoded = try JSONDecoder().decode(MobileQuoteWriteRequest.self, from: data)
            XCTAssertEqual(decoded, expected)
            if calls == 1 { firstBody = data; throw URLError(.networkConnectionLost) }
            XCTAssertEqual(try JSONDecoder().decode(MobileQuoteWriteRequest.self, from: firstBody!), decoded)
            var saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
            saved.creationRequestId = expected.requestId; saved.creationReplayed = true
            let payload = try JSONEncoder().encode(MobileQuotePayload(quote: saved))
            return Self.response(request, status: 201, json: "{\"data\":" + String(decoding: payload, as: UTF8.self) + "}")
        }
        do { _ = try await makeClient().createQuoteCopy(attempt.request, accessToken: "token"); XCTFail("Expected loss") } catch {}
        XCTAssertNil(attempt.confirmed)
        let recovered = try await makeClient().createQuoteCopy(attempt.request, accessToken: "token")
        XCTAssertTrue(try attempt.confirm(recovered))
        XCTAssertEqual(calls, 2)
        XCTAssertEqual(attempt.request, expected)
    }

    func testDuplicateRejectsAnUnavailableSourceBeforeCreatingAnAttempt() {
        XCTAssertThrowsError(try MobileQuoteDuplicateAttempt(source: duplicateSource(id: "bad-id")))
    }

    func testCopyEndpointRefusesOldServerOrMissingAcknowledgementWithoutFallback() async throws {
        let attempt = try MobileQuoteDuplicateAttempt(source: duplicateSource())
        for status in [404, 405, 503, 201] {
            var calls = 0
            URLProtocolStub.handler = { request in
                calls += 1
                XCTAssertEqual(request.url?.path, "/api/mobile/quotes/copy")
                return Self.response(request, status: status, json: status == 201 ? Self.quoteResponse() : "{}")
            }
            do { _ = try await makeClient().createQuoteCopy(attempt.request, accessToken: "token"); XCTFail("Expected refusal") } catch {}
            XCTAssertEqual(calls, 1)
        }
        URLProtocolStub.handler = { _ in XCTFail("An unkeyed copy must not be sent"); throw URLError(.badURL) }
        do { _ = try await makeClient().createQuoteCopy(quoteRequest(), accessToken: "token"); XCTFail("Expected refusal") }
        catch { XCTAssertEqual(error as? MobileAPIError, .invalidRequest) }
    }

    func testCopySupportsExistingLongScopeAndMoreThanFiftyLines() throws {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(duplicateSource())) as! [String: Any]
        let name = "  " + String(repeating: "N", count: 140)
        let scope = "Scope\r\n" + String(repeating: "x", count: 13000) + "  "
        object["lines"] = Array(repeating: ["name": name, "description": scope, "quantity": 1, "unitPriceCents": 0] as [String: Any], count: 51)
        let source = try JSONDecoder().decode(MobileQuoteDetail.self, from: JSONSerialization.data(withJSONObject: object))
        let attempt = try MobileQuoteDuplicateAttempt(source: source)
        XCTAssertEqual(attempt.request.lines.count, 51)
        XCTAssertEqual(attempt.request.lines[0].name, name)
        XCTAssertEqual(attempt.request.lines[0].description, scope)
    }

    func testLiveServiceUsesCopyEndpointWithTheCurrentSession() async throws {
        let attempt = try MobileQuoteDuplicateAttempt(source: duplicateSource())
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/quotes/copy")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer copy-session")
            var saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
            saved.creationRequestId = attempt.request.requestId; saved.creationReplayed = false
            let payload = try JSONEncoder().encode(MobileQuotePayload(quote: saved))
            return Self.response(request, status: 201, json: "{\"data\":" + String(decoding: payload, as: UTF8.self) + "}")
        }
        let service = LiveFieldDataService(authentication: QuoteCopyAuthStub(), api: makeClient(), cache: FieldCache())
        let result = try await service.createQuoteCopy(attempt.request)
        XCTAssertEqual(result.creationRequestId, attempt.request.requestId)
    }

    func testLegacyEmptyDraftCopyKeepsItsExistingEndpoint() async throws {
        let source = duplicateSource()
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/quotes/\(source.id)/duplicate")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            let saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
            let payload = try JSONEncoder().encode(MobileQuotePayload(quote: saved))
            return Self.response(request, status: 201, json: "{\"data\":" + String(decoding: payload, as: UTF8.self) + "}")
        }
        let result = try await makeClient().duplicateQuote(id: source.id, accessToken: "token")
        XCTAssertNotEqual(result.id, source.id)
    }

    func testEncryptedDraftSurvivesRestartAndOrdinaryCacheClearing() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let session = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        let draft = recoveryDraft()
        try await fixture.store.saveDraft(draft, session: session)
        await FieldCache(directory: fixture.root).removeAll()
        let restarted = QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in Data(repeating: 7, count: 32) })
        let restored = try await restarted.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        XCTAssertEqual(restored.document.draft, draft)
        let files = Self.recoveryFiles(fixture.root)
        XCTAssertEqual(files.count, 1)
        let bytes = try Data(contentsOf: files[0])
        XCTAssertFalse(String(decoding: bytes, as: UTF8.self).contains("RECOVERY_PRIVATE_MARKER"))
        let attributes = try FileManager.default.attributesOfItem(atPath: files[0].path)
        XCTAssertEqual((attributes[.posixPermissions] as? NSNumber)?.intValue, 0o600)
    }

    func testRecoveryIsolatedByUserEnvironmentAndRecord() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
        for (env, user, context) in [("production", recoveryUser, MobileQuoteRecoveryContext.newProposal),
            ("staging", recoveryOtherUser, .newProposal), ("staging", recoveryUser, .edit(duplicateSource().id)),
            ("staging", recoveryUser, .copy(duplicateSource().id))] {
            let other = try await fixture.store.open(environment: env, userID: user, context: context)
            XCTAssertNil(other.document.draft); XCTAssertNil(other.document.pending)
        }
        let same = try await fixture.store.open(environment: "staging", userID: recoveryUser.uppercased(), context: .newProposal)
        XCTAssertEqual(same.document.draft, recoveryDraft())
    }

    func testCiphertextCannotBeMovedToAnotherAccountOrChanged() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
        let original = Self.recoveryFiles(fixture.root)[0]
        let originalData = try Data(contentsOf: original)
        let other = try await fixture.store.open(environment: "staging", userID: recoveryOtherUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: other)
        let otherFile = Self.recoveryFiles(fixture.root).first { $0 != original }!
        try originalData.write(to: otherFile)
        do { _ = try await fixture.store.open(environment: "staging", userID: recoveryOtherUser, context: .newProposal); XCTFail("Cross-account ciphertext must fail") } catch {}
        var changed = originalData; changed[changed.count - 1] ^= 1; try changed.write(to: original)
        do { _ = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal); XCTFail("Tampering must fail") } catch {}
        XCTAssertEqual(try Data(contentsOf: original), changed)
    }

    func testMissingKeyFailsClosedAndCannotRotateOverExistingRecovery() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
        let file = Self.recoveryFiles(fixture.root)[0], bytes = try Data(contentsOf: file)
        let missing = QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, create in
            XCTAssertFalse(create); throw QuoteRecoveryError.unavailable
        })
        do { _ = try await missing.open(environment: "staging", userID: recoveryUser, context: .newProposal); XCTFail("Missing key must not erase recovery") } catch {}
        let another = try await missing.open(environment: "staging", userID: recoveryUser, context: .edit(duplicateSource().id))
        do { try await missing.saveDraft(recoveryDraft(), session: another); XCTFail("Do not replace a lost key") } catch {}
        XCTAssertEqual(try Data(contentsOf: file), bytes)
    }

    func testUnknownRecoveryVersionCannotBeOverwritten() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
        let file = Self.recoveryFiles(fixture.root)[0]
        let sealed = try AES.GCM.seal(Data("{\"version\":999}".utf8), using: SymmetricKey(data: Data(repeating: 7, count: 32)), authenticating: Data((first.scope + first.context.key).utf8))
        try sealed.combined!.write(to: file)
        let before = try Data(contentsOf: file)
        do { _ = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal); XCTFail("Future version must fail closed") } catch {}
        do { try await fixture.store.saveDraft(recoveryDraft(), session: first); XCTFail("Cannot overwrite unreadable data") } catch {}
        XCTAssertEqual(try Data(contentsOf: file), before)
    }

    func testImmutablePendingRequestCannotBeReplacedAndSurvivesRestart() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        let pending = MobileQuotePendingRequest(kind: .create, request: recoveryRequest())
        _ = try await fixture.store.prepare(pending, session: first)
        var changed = recoveryRequest(); changed.requestId = UUID().uuidString.lowercased()
        do { _ = try await fixture.store.prepare(.init(kind: .create, request: changed), session: first); XCTFail("No replacement identity") } catch {}
        let other = QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in Data(repeating: 7, count: 32) })
        let restored = try await other.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        XCTAssertEqual(restored.document.pending, pending)
        do { _ = try await other.startAnother(restored); XCTFail("No automatic discard of uncertainty") } catch {}
    }

    func testAcknowledgementKeepsReceiptAndInvalidatesLateDraftWrites() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let session = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: session)
        let request = recoveryRequest(); _ = try await fixture.store.prepare(.init(kind: .create, request: request), session: session)
        let savedID = "b0000000-0000-4000-8000-000000000001"
        do { try await fixture.store.acknowledge(quoteID: savedID, session: session); XCTFail("No unconfirmed clearing") } catch {}
        try await fixture.store.confirm(quoteID: savedID, requestID: request.requestId!, session: session)
        try await fixture.store.acknowledge(quoteID: savedID, session: session)
        do { try await fixture.store.saveDraft(recoveryDraft(), session: session); XCTFail("No stale draft resurrection") } catch {}
        let reopened = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        XCTAssertEqual(reopened.document.completedQuoteID, savedID); XCTAssertNil(reopened.document.draft); XCTAssertNil(reopened.document.pending)
        let fresh = try await fixture.store.startAnother(reopened)
        XCTAssertNil(fresh.document.completedQuoteID)
    }

    func testOpeningAnotherEditorInvalidatesTheFirstLease() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
        let current = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        do { try await fixture.store.saveDraft(.init(), session: first); XCTFail("Stale editor cannot overwrite") } catch {}
        XCTAssertEqual(current.document.draft, recoveryDraft())
        let forged = MobileQuoteRecoverySession(scope: current.scope, userID: recoveryOtherUser, context: current.context, lease: current.lease, document: current.document)
        do { _ = try await fixture.store.document(forged); XCTFail("Lease cannot be assigned to another account") } catch {}
    }

    func testStorageFailureBlocksHTTPAndPreservesExistingFiles() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let broken = QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in throw QuoteRecoveryError.unavailable })
        let auth = RecoveryAuthStub(userID: recoveryUser)
        let service = recoveryService(store: broken, auth: auth)
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        URLProtocolStub.handler = { _ in XCTFail("Must persist before HTTP"); throw URLError(.badURL) }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: recoveryRequest()), session: session); XCTFail("Storage failure must stop send") } catch {}
        XCTAssertTrue(Self.recoveryFiles(fixture.root).isEmpty)
    }

    func testRestartedCreateAndCopyRequireExplicitRetryOfTheExactStoredBody() async throws {
        for copy in [false, true] {
            let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
            let auth = RecoveryAuthStub(userID: recoveryUser)
            let context: MobileQuoteRecoveryContext = copy ? .copy(duplicateSource().id) : .newProposal
            let request = copy ? try MobileQuoteDuplicateAttempt(source: duplicateSource()).request : recoveryRequest()
            let kind: MobileQuotePendingRequest.Kind = copy ? .copy : .create
            let service = recoveryService(store: fixture.store, auth: auth)
            let session = try await service.openQuoteRecovery(context: context, userID: recoveryUser)
            if !copy { try await service.saveQuoteDraft(recoveryDraft(), session: session) }
            var calls = 0
            URLProtocolStub.handler = { http in
                calls += 1
                XCTAssertEqual(http.url?.path, copy ? "/api/mobile/quotes/copy" : "/api/mobile/quotes/draft")
                XCTAssertEqual(try JSONDecoder().decode(MobileQuoteWriteRequest.self, from: Self.fileBody(http)), request)
                let file = Self.recoveryFiles(fixture.root)[0]
                let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: Data(contentsOf: file)), using: SymmetricKey(data: Data(repeating: 7, count: 32)), authenticating: Data((session.scope + context.key).utf8))
                let onDisk = try JSONDecoder().decode(MobileQuoteRecoveryDocument.self, from: plaintext)
                XCTAssertEqual(onDisk.pending?.request, request)
                XCTAssertEqual(onDisk.pending?.dispatchCount, calls)
                if calls == 1 { throw URLError(.networkConnectionLost) }
                var saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001", status: "approved", note: "Later office edit")
                saved.creationRequestId = request.requestId; saved.creationReplayed = true
                return Self.response(http, status: 201, json: Self.quoteEnvelope(saved))
            }
            do { _ = try await service.submitQuoteRecovery(.init(kind: kind, request: request), session: session); XCTFail("Expected loss") } catch {}
            XCTAssertEqual(calls, 1)
            let restarted = QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in Data(repeating: 7, count: 32) })
            let secondService = recoveryService(store: restarted, auth: auth)
            let restored = try await secondService.openQuoteRecovery(context: context, userID: recoveryUser)
            XCTAssertEqual(calls, 1); XCTAssertEqual(restored.document.pending?.request, request)
            let saved = try await secondService.retryQuoteRecovery(restored)
            XCTAssertEqual(calls, 2); XCTAssertEqual(saved.creationReplayed, true)
            let confirmed = try await secondService.quoteRecoveryDocument(restored)
            XCTAssertEqual(confirmed.pending?.confirmedQuoteID, saved.id)
            try await secondService.acknowledgeQuoteRecovery(quoteID: saved.id, session: restored)
            let final = try await secondService.openQuoteRecovery(context: context, userID: recoveryUser)
            XCTAssertEqual(final.document.completedQuoteID, saved.id); XCTAssertEqual(calls, 2)
        }
    }

    func testRecoveredEditKeepsOriginalRevisionAndRequiresReviewOnConflict() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser), source = duplicateSource()
        let service = recoveryService(store: fixture.store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .edit(source.id), userID: recoveryUser)
        var draft = recoveryDraft(); draft.expectedRevision = 7; draft.hasEditCapability = true
        try await service.saveQuoteDraft(draft, session: session)
        var request = recoveryRequest(); request.expectedRevision = 7
        var calls = 0
        URLProtocolStub.handler = { http in
            calls += 1
            XCTAssertEqual(http.url?.path, "/api/mobile/quotes/\(source.id)/edit")
            XCTAssertEqual(try JSONDecoder().decode(MobileQuoteWriteRequest.self, from: Self.fileBody(http)).expectedRevision, 7)
            if calls == 1 { throw URLError(.networkConnectionLost) }
            return Self.response(http, status: 409, json: "{\"error\":{\"code\":\"quote_conflict\",\"message\":\"Review the saved revision.\"}}")
        }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .edit, request: request), session: session); XCTFail("Expected loss") } catch {}
        let second = recoveryService(store: QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in Data(repeating: 7, count: 32) }), auth: auth)
        let restored = try await second.openQuoteRecovery(context: .edit(source.id), userID: recoveryUser)
        XCTAssertEqual(restored.document.draft, draft)
        do { _ = try await second.retryQuoteRecovery(restored); XCTFail("Must not silently rebase") } catch {}
        let remaining = try await second.quoteRecoveryDocument(restored)
        XCTAssertEqual(remaining.pending?.request.expectedRevision, 7); XCTAssertEqual(remaining.draft, draft); XCTAssertEqual(calls, 2)
    }

    func testUncertainEmptyCopyCannotBeRetriedAfterRestart() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser), source = duplicateSource()
        let service = recoveryService(store: fixture.store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .copy(source.id), userID: recoveryUser)
        let request = MobileQuoteWriteRequest(customerId: nil, organizationId: nil, serviceLocationId: source.serviceLocation.id, customerMessage: nil, expiresAt: nil, recipientContactId: nil, approvalContactId: nil, lines: [], requestId: UUID().uuidString.lowercased())
        var calls = 0
        URLProtocolStub.handler = { http in calls += 1; XCTAssertEqual(http.url?.path, "/api/mobile/quotes/\(source.id)/duplicate"); throw URLError(.networkConnectionLost) }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .emptyCopy, request: request), session: session); XCTFail("Expected loss") } catch {}
        let second = recoveryService(store: QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in Data(repeating: 7, count: 32) }), auth: auth)
        let restored = try await second.openQuoteRecovery(context: .copy(source.id), userID: recoveryUser)
        do { _ = try await second.retryQuoteRecovery(restored); XCTFail("An unkeyed request cannot be replayed") } catch {}
        do { _ = try await second.submitQuoteRecovery(.init(kind: .emptyCopy, request: request), session: restored); XCTFail("Nor submitted again") } catch {}
        XCTAssertEqual(calls, 1)
    }

    func testRecoveryRejectsWrongAccountTokenAndEnvironmentBeforeHTTP() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser)
        let service = recoveryService(store: fixture.store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        URLProtocolStub.handler = { _ in XCTFail("Account/environment mismatch must not send"); throw URLError(.badURL) }
        auth.setTokenSubject(recoveryOtherUser)
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: recoveryRequest()), session: session); XCTFail("Wrong JWT subject") } catch {}
        let otherEnvironment = LiveFieldDataService(authentication: auth, api: makeClient(), cache: FieldCache(), recoveryEnvironment: "production", recovery: fixture.store)
        do { _ = try await otherEnvironment.retryQuoteRecovery(session); XCTFail("No staging request in production") } catch {}
        auth.setUser(recoveryOtherUser)
        do { _ = try await service.quoteRecoveryDocument(session); XCTFail("Another account cannot read recovery") } catch {}
    }

    func testAccountSwitchDuringHTTPDoesNotExposeOrAcknowledgeTheResult() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser)
        let service = recoveryService(store: fixture.store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        let request = recoveryRequest(), otherUser = recoveryOtherUser
        URLProtocolStub.handler = { http in
            auth.setUser(otherUser)
            var saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
            saved.creationRequestId = request.requestId; saved.creationReplayed = false
            return Self.response(http, status: 201, json: Self.quoteEnvelope(saved))
        }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: request), session: session); XCTFail("Do not deliver the old account's result") } catch {}
        let stored = try await fixture.store.document(session)
        XCTAssertNil(stored.pending?.confirmedQuoteID); XCTAssertEqual(stored.pending?.request, request)
    }

    func testInFlightRequestCannotBeDiscardedByAnotherEditor() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        _ = try await fixture.store.prepare(.init(kind: .create, request: recoveryRequest()), session: first)
        try await fixture.store.beginSend(first)
        let second = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: .newProposal)
        do { _ = try await fixture.store.startAnother(second, reviewedRequest: true); XCTFail("Cannot discard an active send") } catch {}
        await fixture.store.endSend(first)
        let reset = try await fixture.store.startAnother(second, reviewedRequest: true)
        XCTAssertNil(reset.document.pending)
        do { try await fixture.store.saveDraft(recoveryDraft(), session: first); XCTFail("Old writer cannot resurrect discarded work") } catch {}
    }

    func testInspectingSavedEditsDoesNotStealTheEditorLease() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let context = MobileQuoteRecoveryContext.edit(duplicateSource().id)
        let first = try await fixture.store.open(environment: "staging", userID: recoveryUser, context: context)
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
        let found = try await fixture.store.inspect(environment: "staging", userID: recoveryUser, context: context)
        XCTAssertEqual(found.draft, recoveryDraft())
        try await fixture.store.saveDraft(recoveryDraft(), session: first)
    }

    func testFailedConfirmationWriteKeepsPendingRequestForRecovery() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let lockState = RecoveryKeyAvailability()
        let store = QuoteRecoveryStore(directory: fixture.root, keyProvider: { _, _ in try lockState.key() })
        let auth = RecoveryAuthStub(userID: recoveryUser), request = recoveryRequest()
        let service = recoveryService(store: store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        URLProtocolStub.handler = { http in
            lockState.setLocked(true)
            var saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
            saved.creationRequestId = request.requestId; saved.creationReplayed = false
            return Self.response(http, status: 201, json: Self.quoteEnvelope(saved))
        }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: request), session: session); XCTFail("Cannot acknowledge if the receipt cannot be saved") } catch {}
        lockState.setLocked(false)
        let pending = try await service.quoteRecoveryDocument(session)
        XCTAssertEqual(pending.pending?.request, request); XCTAssertNil(pending.pending?.confirmedQuoteID)
    }

    func testRecoveryCopyRejectsTheOriginalProposalAsItsCreatedCopy() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser), source = duplicateSource()
        let request = try MobileQuoteDuplicateAttempt(source: source).request
        let service = recoveryService(store: fixture.store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .copy(source.id), userID: recoveryUser)
        URLProtocolStub.handler = { http in
            var saved = source; saved.creationRequestId = request.requestId; saved.creationReplayed = false
            return Self.response(http, status: 201, json: Self.quoteEnvelope(saved))
        }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .copy, request: request), session: session); XCTFail("Cannot acknowledge the source as a new copy") } catch {}
        let doc = try await service.quoteRecoveryDocument(session)
        XCTAssertNil(doc.pending?.confirmedQuoteID); XCTAssertEqual(doc.pending?.request, request)
    }

    func testSignOutDoesNotDeleteOrExposeTheEncryptedRecovery() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser), service = recoveryService(store: fixture.store, auth: auth)
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        try await service.saveQuoteDraft(recoveryDraft(), session: session)
        let file = Self.recoveryFiles(fixture.root)[0], original = try Data(contentsOf: file)
        try await auth.signOut()
        do { _ = try await service.quoteRecoveryDocument(session); XCTFail("Signed-out access must fail") } catch {}
        XCTAssertEqual(try Data(contentsOf: file), original)
        auth.setUser(recoveryUser)
        let reopened = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        XCTAssertEqual(reopened.document.draft, recoveryDraft())
    }

    func testFirstPrewriteValidationRejectionKeepsTheDraftEditableAndItsIdentity() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let service = recoveryService(store: fixture.store, auth: RecoveryAuthStub(userID: recoveryUser))
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        let draft = recoveryDraft(); try await service.saveQuoteDraft(draft, session: session)
        let request = recoveryRequest()
        URLProtocolStub.handler = { http in Self.response(http, status: 400, json: "{\"error\":{\"code\":\"invalid_quote\",\"message\":\"Review the line items.\"}}") }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: request), session: session); XCTFail("Expected validation failure") } catch {}
        let editable = try await service.quoteRecoveryDocument(session)
        XCTAssertNil(editable.pending); XCTAssertEqual(editable.draft, draft)
        XCTAssertEqual(editable.rejected?.request, request)
        do { _ = try await fixture.store.startAnother(session); XCTFail("Rejected requests cannot silently rotate identity") } catch {}
        var corrected = quoteRequest(message: "Corrected details"); corrected.requestId = request.requestId
        let correctedRequest = corrected
        URLProtocolStub.handler = { http in
            XCTAssertEqual(try JSONDecoder().decode(MobileQuoteWriteRequest.self, from: Self.fileBody(http)), correctedRequest)
            var saved = Self.duplicateSource(id: "b0000000-0000-4000-8000-000000000001")
            saved.creationRequestId = correctedRequest.requestId; saved.creationReplayed = false
            return Self.response(http, status: 201, json: Self.quoteEnvelope(saved))
        }
        let saved = try await service.submitQuoteRecovery(.init(kind: .create, request: corrected), session: session)
        XCTAssertEqual(saved.creationRequestId, draft.requestID)
    }

    func testValidationAfterAnUncertainAttemptCannotClearOrReplaceIt() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let service = recoveryService(store: fixture.store, auth: RecoveryAuthStub(userID: recoveryUser))
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        let request = recoveryRequest()
        var calls = 0
        URLProtocolStub.handler = { http in
            calls += 1
            if calls == 1 { throw URLError(.networkConnectionLost) }
            return Self.response(http, status: 400, json: "{\"error\":{\"code\":\"invalid_quote\",\"message\":\"Review the line items.\"}}")
        }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: request), session: session); XCTFail("Expected loss") } catch {}
        do { _ = try await service.retryQuoteRecovery(session); XCTFail("Expected refusal") } catch {}
        let retained = try await service.quoteRecoveryDocument(session)
        XCTAssertEqual(retained.pending?.request, request); XCTAssertEqual(retained.pending?.dispatchCount, 2)
        var changed = quoteRequest(message: "Different details"); changed.requestId = UUID().uuidString.lowercased()
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: changed), session: session); XCTFail("Uncertainty cannot mint a replacement") } catch {}
        XCTAssertEqual(calls, 2)
    }

    func testUnknownRejectionDoesNotClearTheRequestEvenOnItsFirstAttempt() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let service = recoveryService(store: fixture.store, auth: RecoveryAuthStub(userID: recoveryUser))
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        let request = recoveryRequest()
        URLProtocolStub.handler = { http in Self.response(http, status: 400, json: "{\"error\":{\"code\":\"unknown\",\"message\":\"Could not confirm.\"}}") }
        do { _ = try await service.submitQuoteRecovery(.init(kind: .create, request: request), session: session); XCTFail("Expected rejection") } catch {}
        let retained = try await service.quoteRecoveryDocument(session)
        XCTAssertEqual(retained.pending?.request, request)
    }

    func testRestoredPartialOrExtremeNumbersDoNotCrashTheEditor() throws {
        for quantity in ["unfinished", "nan", "inf", "1e300", "-1"] {
            let line = MobileQuoteEditorLine(name: "Partial", quantity: quantity, unitPrice: "100")
            XCTAssertEqual(line.totalCents, 0)
        }
        let extreme = MobileQuoteEditorLine(name: "Partial", quantity: "1", unitPrice: "9999999999999999999999")
        XCTAssertNil(extreme.unitPriceCents); XCTAssertNil(extreme.requestLine)
        let raw = MobileQuoteEditorLine(name: "Partial", description: "Keep\n wording", quantity: "001.25", unitPrice: "012.50")
        let restored = try JSONDecoder().decode(MobileQuoteEditorLine.self, from: JSONEncoder().encode(raw))
        XCTAssertEqual(restored.quantity, "001.25"); XCTAssertEqual(restored.unitPrice, "012.50")
        XCTAssertEqual(restored.totalCents, 1563)
    }

    func testAuthSDKFailuresDoNotExposeDiagnosticsOrSendTheSavedMutation() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let failedRestore = LiveFieldDataService(authentication: RecoveryFailingAuth(failRestore: true), api: makeClient(), cache: FieldCache(), recoveryEnvironment: "staging", recovery: fixture.store)
        do { _ = try await failedRestore.openQuoteRecovery(context: .newProposal, userID: recoveryUser); XCTFail("Expected auth failure") }
        catch { XCTAssertFalse(error.localizedDescription.contains("PRIVATE")) }
        let failedToken = LiveFieldDataService(authentication: RecoveryFailingAuth(failRestore: false), api: makeClient(), cache: FieldCache(), recoveryEnvironment: "staging", recovery: fixture.store)
        let session = try await failedToken.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        URLProtocolStub.handler = { _ in XCTFail("No mutation on auth failure"); throw URLError(.badURL) }
        let request = recoveryRequest()
        do { _ = try await failedToken.submitQuoteRecovery(.init(kind: .create, request: request), session: session); XCTFail("Expected token failure") }
        catch { XCTAssertFalse(error.localizedDescription.contains("PRIVATE")) }
        let retained = try await fixture.store.document(session)
        XCTAssertEqual(retained.pending?.request, request); XCTAssertEqual(retained.pending?.dispatchCount, 0)
    }

    func testRecoveryPartyReadsAreBoundToTheOwnerBeforeCachingOrDisplaying() async throws {
        let fixture = recoveryFixture(); defer { try? FileManager.default.removeItem(at: fixture.root) }
        let auth = RecoveryAuthStub(userID: recoveryUser), cache = FieldCache(directory: fixture.root)
        let service = LiveFieldDataService(authentication: auth, api: makeClient(), cache: cache, recoveryEnvironment: "staging", recovery: fixture.store)
        let session = try await service.openQuoteRecovery(context: .newProposal, userID: recoveryUser)
        let id = duplicateSource().party!.id
        let json = "{\"data\":{\"party\":{\"id\":\"" + id + "\",\"kind\":\"customer\",\"name\":\"Synthetic party\",\"status\":\"active\",\"serviceLocations\":[],\"contacts\":[],\"jobs\":[],\"proposals\":[],\"invoices\":[]}}}"
        URLProtocolStub.handler = { http in Self.response(http, status: 200, json: json) }
        let detail = try await service.recoveryPartyDetail(kind: .customer, id: id, session: session)
        let own = await cache.readParty(userID: recoveryUser, kind: .customer, id: id)
        XCTAssertEqual(own, detail)
        let otherUser = recoveryOtherUser
        URLProtocolStub.handler = { http in auth.setUser(otherUser); return Self.response(http, status: 200, json: json) }
        do { _ = try await service.recoveryPartyDetail(kind: .customer, id: id, session: session); XCTFail("Do not deliver/cache the wrong account's lookup") } catch {}
        let other = await cache.readParty(userID: recoveryOtherUser, kind: .customer, id: id)
        XCTAssertNil(other)
    }

    private var recoveryUser: String { "a0000000-0000-4000-8000-000000000010" }
    private var recoveryOtherUser: String { "a0000000-0000-4000-8000-000000000011" }
    private func recoveryFixture() -> (store: QuoteRecoveryStore, root: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ATS-QuoteRecovery-" + UUID().uuidString)
        return (QuoteRecoveryStore(directory: root, keyProvider: { _, _ in Data(repeating: 7, count: 32) }), root)
    }
    private func recoveryDraft() -> MobileQuoteEditorDraft {
        .init(party: .init(id: duplicateSource().party!.id, kind: .customer, name: "RECOVERY_PRIVATE_MARKER", contactName: nil, email: nil, phone: nil, address: "Synthetic only"), customerMessage: "  Preserve\n raw notes  ", serviceLocationID: duplicateSource().serviceLocation.id,
              recipientID: "", approvalID: "", expiration: Date(timeIntervalSince1970: 1800000000),
              lines: [.init(id: UUID(uuidString: "a0000000-0000-4000-8000-000000000020")!, persistedID: nil, name: "Partial", description: "Line\n scope", quantity: "not finished", unitPrice: "12.")],
              expectedRevision: 7, hasEditCapability: true, requestID: "a0000000-0000-4000-8000-000000000021")
    }
    private func recoveryRequest() -> MobileQuoteWriteRequest {
        var request = quoteRequest(message: "RECOVERY_PRIVATE_MARKER")
        request.requestId = recoveryDraft().requestID
        return request
    }
    private func recoveryService(store: QuoteRecoveryStore, auth: RecoveryAuthStub) -> LiveFieldDataService {
        .init(authentication: auth, api: makeClient(), cache: FieldCache(), recoveryEnvironment: "staging", recovery: store)
    }
    private static func recoveryFiles(_ root: URL) -> [URL] {
        (FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "sealed" }
    }
    private static func quoteEnvelope(_ saved: MobileQuoteDetail) -> String {
        "{\"data\":" + String(decoding: try! JSONEncoder().encode(MobileQuotePayload(quote: saved)), as: UTF8.self) + "}"
    }

    private func duplicateSource(id: String = "a0000000-0000-4000-8000-000000000001", kind: MobilePartyKind = .customer, status: String = "draft", note: String = "Original note") -> MobileQuoteDetail {
        Self.duplicateSource(id: id, kind: kind, status: status, note: note)
    }

    private static func duplicateSource(id: String = "a0000000-0000-4000-8000-000000000001", kind: MobilePartyKind = .customer, status: String = "draft", note: String = "Original note") -> MobileQuoteDetail {
        .init(id: id, proposalNumber: "LOCAL", status: status, title: "Pruning", totalCents: 18000,
            createdAt: "2026-10-21", sentAt: nil, approvedAt: nil, expiresAt: "2027-01-01T00:00:00Z", updatedAt: "2026-10-21",
            party: .init(id: "a0000000-0000-4000-8000-000000000002", kind: kind, name: "Synthetic customer"),
            serviceLocation: .init(id: "a0000000-0000-4000-8000-000000000003", label: nil, fullAddress: "Synthetic property"),
            linkedJobId: "original-job", linkedInvoiceId: "original-invoice",
            recipientContactId: kind == .organization ? "a0000000-0000-4000-8000-000000000004" : nil,
            approvalContactId: kind == .organization ? "a0000000-0000-4000-8000-000000000005" : nil,
            customerMessage: note,
            lines: [.init(id: "original-line-one", name: "Pruning", description: "Keep lower branches\nHaul brush", quantity: 1.25, unitPriceCents: 12345, totalCents: 15431),
                    .init(id: "original-line-two", name: "Cleanup", description: nil, quantity: 1, unitPriceCents: 2569, totalCents: 2569)],
            portalStatus: "active", editRevision: 7, quoteEditVersion: 1)
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

private actor QuoteCopyAuthStub: AuthenticationService {
    func restoreSession() async throws -> AuthIdentity? { nil }
    func signIn(email: String, password: String) async throws -> AuthIdentity { throw MobileAPIError.invalidRequest }
    func validAccessToken() async throws -> String { "copy-session" }
    func signOut() async throws {}
}

private final class RecoveryAuthStub: AuthenticationService, @unchecked Sendable {
    private let lock = NSLock()
    private var userID: String
    private var tokenSubject: String
    init(userID: String) { self.userID = userID; tokenSubject = userID }
    func setUser(_ id: String) { lock.withLock { userID = id } }
    func setTokenSubject(_ id: String) { lock.withLock { tokenSubject = id } }
    func restoreSession() async throws -> AuthIdentity? { lock.withLock { .init(userID: userID, email: nil) } }
    func signIn(email: String, password: String) async throws -> AuthIdentity { throw MobileAPIError.invalidRequest }
    func validAccessToken() async throws -> String {
        lock.withLock { let payload = Data(("{\"sub\":\"" + tokenSubject + "\"}").utf8).base64EncodedString().replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_"); return "synthetic." + payload + ".not-a-real-signature" }
    }
    func signOut() async throws { setUser("") }
}

private final class RecoveryKeyAvailability: @unchecked Sendable {
    private let lock = NSLock()
    private var locked = false
    func setLocked(_ value: Bool) { lock.withLock { locked = value } }
    func key() throws -> Data { try lock.withLock { if locked { throw QuoteRecoveryError.unavailable }; return Data(repeating: 7, count: 32) } }
}

private struct RecoveryFailingAuth: AuthenticationService {
    let failRestore: Bool
    struct Diagnostic: LocalizedError { var errorDescription: String? { "PRIVATE_SYNTHETIC_AUTH_DETAIL" } }
    func restoreSession() async throws -> AuthIdentity? {
        if failRestore { throw Diagnostic() }
        return .init(userID: "a0000000-0000-4000-8000-000000000010", email: nil)
    }
    func validAccessToken() async throws -> String { throw Diagnostic() }
    func signIn(email: String, password: String) async throws -> AuthIdentity { throw Diagnostic() }
    func signOut() async throws {}
}
