import Foundation
@testable import AngelTree

extension FieldDataService {
    func quoteDirectory(scope: MobileQuoteScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileQuotePage, cached: Bool) {
        throw MobileAPIError.requestRejected("Proposal directory is not configured for this test.")
    }
    func quoteDetail(id: String, userID: String, allowCached: Bool) async throws -> (detail: MobileQuoteDetail, cached: Bool) {
        throw MobileAPIError.requestRejected("Proposal detail is not configured for this test.")
    }
    func createQuote(_ input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail { throw MobileAPIError.requestRejected("Proposal creation is not configured for this test.") }
    func updateQuote(id: String, input: MobileQuoteWriteRequest) async throws -> MobileQuoteDetail { throw MobileAPIError.requestRejected("Proposal editing is not configured for this test.") }
    func duplicateQuote(id: String) async throws -> MobileQuoteDetail { throw MobileAPIError.requestRejected("Proposal duplication is not configured for this test.") }
    func invoiceDirectory(scope: MobileInvoiceScope, cursor: String?, query: String?, userID: String, allowCached: Bool) async throws -> (page: MobileInvoicePage, cached: Bool) { throw MobileAPIError.requestRejected("Invoice directory is not configured for this test.") }
    func invoiceDetail(id: String, userID: String, allowCached: Bool) async throws -> (payload: MobileInvoicePayload, cached: Bool) { throw MobileAPIError.requestRejected("Invoice detail is not configured for this test.") }
    func recordManualPayment(invoiceID: String, input: MobileManualPaymentRequest) async throws -> MobileInvoicePayload { throw MobileAPIError.requestRejected("Manual payment is not configured for this test.") }
}
