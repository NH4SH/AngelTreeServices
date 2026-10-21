import Foundation
import CryptoKit
import Security

actor FieldCache {
    private let directory: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.temporaryDirectory
        self.directory = root.appendingPathComponent("AngelTree/FieldCache", isDirectory: true)
    }

    func readParty(userID: String, kind: MobilePartyKind, id: String) -> MobilePartyDetail? {
        read(MobilePartyDetail.self, key: "\(userID)-party-\(kind.rawValue)-\(id)")
    }

    func writeParty(_ party: MobilePartyDetail, userID: String) {
        write(party, key: "\(userID)-party-\(party.kind.rawValue)-\(party.id)")
        recordRecentParty(party, userID: userID)
    }

    func readRecentParties(userID: String) -> [MobilePartySearchResult] {
        read([MobilePartySearchResult].self, key: "\(userID)-recent-parties") ?? []
    }

    func recordRecentParty(_ party: MobilePartyDetail, userID: String) {
        let result = MobilePartySearchResult(
            id: party.id,
            kind: party.kind,
            name: party.name,
            contactName: party.contactName,
            email: party.email,
            phone: party.phone,
            address: party.serviceLocations.first?.fullAddress
        )
        let existing = readRecentParties(userID: userID)
            .filter { $0.id != result.id || $0.kind != result.kind }
        write(Array(([result] + existing).prefix(8)), key: "\(userID)-recent-parties")
    }

    func readJob(userID: String, id: String) -> MobileJobDetail? {
        read(MobileJobDetail.self, key: "\(userID)-job-\(id)")
    }

    func writeJob(_ job: MobileJobDetail, userID: String) {
        write(job, key: "\(userID)-job-\(job.id)")
    }

    func readJobDirectory(userID: String, scope: MobileJobDirectoryScope) -> [MobileJobDirectoryItem]? {
        read([MobileJobDirectoryItem].self, key: "\(userID)-jobs-\(scope.rawValue)")
    }

    func writeJobDirectory(_ jobs: [MobileJobDirectoryItem], userID: String, scope: MobileJobDirectoryScope) {
        write(jobs, key: "\(userID)-jobs-\(scope.rawValue)")
    }

    func readQuote(userID: String, id: String) -> MobileQuoteDetail? { read(MobileQuoteDetail.self, key: "\(userID)-quote-\(id)") }
    func writeQuote(_ quote: MobileQuoteDetail, userID: String) { write(quote, key: "\(userID)-quote-\(quote.id)") }
    func readQuoteDirectory(userID: String, scope: MobileQuoteScope) -> [MobileQuoteDirectoryItem]? { read([MobileQuoteDirectoryItem].self, key: "\(userID)-quotes-\(scope.rawValue)") }
    func writeQuoteDirectory(_ quotes: [MobileQuoteDirectoryItem], userID: String, scope: MobileQuoteScope) { write(quotes, key: "\(userID)-quotes-\(scope.rawValue)") }
    func readInvoice(userID: String, id: String) -> MobileInvoiceDetail? { read(MobileInvoiceDetail.self, key: "\(userID)-invoice-\(id)") }
    func writeInvoice(_ invoice: MobileInvoiceDetail, userID: String) { write(invoice, key: "\(userID)-invoice-\(invoice.id)") }
    func readInvoiceDirectory(userID: String, scope: MobileInvoiceScope) -> [MobileInvoiceDirectoryItem]? { read([MobileInvoiceDirectoryItem].self, key: "\(userID)-invoices-\(scope.rawValue)") }
    func writeInvoiceDirectory(_ invoices: [MobileInvoiceDirectoryItem], userID: String, scope: MobileInvoiceScope) { write(invoices, key: "\(userID)-invoices-\(scope.rawValue)") }

    func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func read<Value: Decodable>(_ type: Value.Type, key: String) -> Value? {
        guard let data = try? Data(contentsOf: fileURL(key)) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    private func write<Value: Encodable>(_ value: Value, key: String) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try encoder.encode(value).write(to: fileURL(key), options: .atomic)
        } catch {
            // Field data remains available in memory when local storage is unavailable.
        }
    }

    private func fileURL(_ key: String) -> URL {
        let safeKey = key.replacingOccurrences(of: "/", with: "-")
        return directory.appendingPathComponent("\(safeKey).json")
    }
}

// Financial attempts are account-scoped and survive ordinary cache/logout
// clearing. Write before HTTP; never discard an uncertain attempt on failure.
actor ManualPaymentAttemptStore {
    private let directory: URL
    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        self.directory = root.appendingPathComponent("AngelTree/PaymentAttempts", isDirectory: true)
    }
    func read(userID: String, invoiceID: String) throws -> MobileManualPaymentRequest? {
        let url = file(userID, invoiceID)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(MobileManualPaymentRequest.self, from: Data(contentsOf: url))
    }
    func save(_ request: MobileManualPaymentRequest, userID: String, invoiceID: String) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(request).write(to: file(userID, invoiceID), options: .atomic)
    }
    func clear(userID: String, invoiceID: String) throws {
        let url = file(userID, invoiceID)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
    private func file(_ userID: String, _ invoiceID: String) -> URL {
        directory.appendingPathComponent("\(userID.replacingOccurrences(of: "/", with: "-"))-\(invoiceID.replacingOccurrences(of: "/", with: "-")).json")
    }
}

// Separate from disposable caches: never cleared on logout or a cache refresh.
// The app owns one shared actor; widgets do not share this directory or Keychain.
actor QuoteRecoveryStore {
    static let shared = QuoteRecoveryStore()
    typealias KeyProvider = @Sendable (_ scope: String, _ create: Bool) throws -> Data
    private let directory: URL?
    private let keyProvider: KeyProvider
    private var inFlight: [String: Int] = [:]
    private var leases: [String: (id: UUID, userID: String)] = [:]

    init(directory: URL? = nil, keyProvider: @escaping KeyProvider = { try QuoteRecoveryStore.deviceKey(scope: $0, create: $1) }) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        self.directory = root?.appendingPathComponent("AngelTree/QuoteRecovery-v1", isDirectory: true)
        self.keyProvider = keyProvider
    }
    func open(environment: String, userID: String, context: MobileQuoteRecoveryContext) throws -> MobileQuoteRecoverySession {
        guard UUID(uuidString: userID) != nil, context.quoteID == nil || context.quoteID.flatMap(UUID.init(uuidString:)) != nil else { throw QuoteRecoveryError.unavailable }
        let scope = Self.scope(environment: environment, userID: userID)
        let document = try read(scope: scope, context: context)
        let lease = UUID(); leases[scope + context.key] = (lease, userID.lowercased())
        return .init(scope: scope, userID: userID, context: context, lease: lease, document: document)
    }
    func inspect(environment: String, userID: String, context: MobileQuoteRecoveryContext) throws -> MobileQuoteRecoveryDocument {
        guard UUID(uuidString: userID) != nil, context.quoteID == nil || context.quoteID.flatMap(UUID.init(uuidString:)) != nil else { throw QuoteRecoveryError.unavailable }
        return try read(scope: Self.scope(environment: environment, userID: userID), context: context)
    }
    func document(_ session: MobileQuoteRecoverySession) throws -> MobileQuoteRecoveryDocument {
        try validate(session); return try read(scope: session.scope, context: session.context)
    }
    func saveDraft(_ draft: MobileQuoteEditorDraft, session: MobileQuoteRecoverySession) throws {
        var doc = try document(session)
        guard doc.completedQuoteID == nil else { throw QuoteRecoveryError.pendingReview }
        doc.draft = draft
        try write(doc, session: session)
    }
    func prepare(_ pending: MobileQuotePendingRequest, session: MobileQuoteRecoverySession) throws -> MobileQuotePendingRequest {
        var doc = try document(session)
        guard doc.completedQuoteID == nil else { throw QuoteRecoveryError.pendingReview }
        if let existing = doc.pending {
            guard existing.kind != .emptyCopy && existing.kind == pending.kind && existing.request == pending.request else { throw QuoteRecoveryError.pendingReview }
            return existing
        }
        guard let id = pending.request.requestId, UUID(uuidString: id) != nil else { throw QuoteRecoveryError.unavailable }
        if let original = doc.rejected {
            guard pending.kind == original.kind, pending.request.requestId == original.request.requestId else { throw QuoteRecoveryError.pendingReview }
        }
        guard pending.confirmedQuoteID == nil else { throw QuoteRecoveryError.pendingReview }
        doc.pending = pending
        try write(doc, session: session) // Must finish before a quote mutation can be sent.
        return pending
    }
    func confirm(quoteID: String, requestID: String, session: MobileQuoteRecoverySession) throws {
        var doc = try document(session)
        guard var pending = doc.pending, pending.request.requestId == requestID, UUID(uuidString: quoteID) != nil,
              pending.confirmedQuoteID == nil || pending.confirmedQuoteID == quoteID else { throw QuoteRecoveryError.pendingReview }
        pending.confirmedQuoteID = quoteID; doc.pending = pending
        try write(doc, session: session)
    }
    func acknowledge(quoteID: String, session: MobileQuoteRecoverySession) throws {
        var doc = try document(session)
        guard doc.pending?.confirmedQuoteID == quoteID else { throw QuoteRecoveryError.pendingReview }
        doc.draft = nil; doc.pending = nil; doc.rejected = nil; doc.completedQuoteID = quoteID
        try write(doc, session: session) // Keep a receipt across a crash before navigation.
        leases.removeValue(forKey: session.scope + session.context.key)
    }
    func beginSend(_ session: MobileQuoteRecoverySession) throws {
        var doc = try document(session)
        guard var pending = doc.pending, pending.dispatchCount >= 0, pending.dispatchCount < Int.max else { throw QuoteRecoveryError.noRequest }
        pending.dispatchCount += 1; doc.pending = pending
        try write(doc, session: session)
        inFlight[session.scope + session.context.key, default: 0] += 1
    }
    func releaseRejectedFirstAttempt(requestID: String, session: MobileQuoteRecoverySession) throws {
        var doc = try document(session)
        guard inFlight[session.scope + session.context.key, default: 0] == 0,
              let pending = doc.pending, pending.dispatchCount == 1,
              pending.confirmedQuoteID == nil, pending.request.requestId == requestID else { throw QuoteRecoveryError.pendingReview }
        if doc.rejected == nil { doc.rejected = doc.pending }
        doc.pending = nil
        try write(doc, session: session) // Keep original body/UUID even when corrections are allowed.
    }
    func endSend(_ session: MobileQuoteRecoverySession) {
        let key = session.scope + session.context.key
        let remaining = (inFlight[key] ?? 1) - 1
        if remaining <= 0 { inFlight.removeValue(forKey: key) } else { inFlight[key] = remaining }
    }
    func startAnother(_ session: MobileQuoteRecoverySession, reviewedRequest: Bool = false) throws -> MobileQuoteRecoverySession {
        let doc = try document(session)
        guard inFlight[session.scope + session.context.key, default: 0] == 0, (doc.pending == nil && doc.rejected == nil) || reviewedRequest else { throw QuoteRecoveryError.pendingReview }
        try write(.init(), session: session)
        leases.removeValue(forKey: session.scope + session.context.key)
        let lease = UUID(); leases[session.scope + session.context.key] = (lease, session.userID.lowercased())
        return .init(scope: session.scope, userID: session.userID, context: session.context, lease: lease, document: .init())
    }
    private func validate(_ session: MobileQuoteRecoverySession) throws {
        guard let lease = leases[session.scope + session.context.key], lease.id == session.lease, lease.userID == session.userID.lowercased() else { throw QuoteRecoveryError.openedElsewhere }
    }
    private func read(scope: String, context: MobileQuoteRecoveryContext) throws -> MobileQuoteRecoveryDocument {
        let url = try file(scope: scope, context: context)
        let data: Data
        do { data = try Data(contentsOf: url) }
        catch let error as NSError where error.domain == NSCocoaErrorDomain && [NSFileReadNoSuchFileError, NSFileNoSuchFileError].contains(error.code) { return .init() }
        catch { throw QuoteRecoveryError.unavailable }
        do {
            let key = try keyProvider(scope, false); guard key.count == 32 else { throw QuoteRecoveryError.unavailable }
            let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: SymmetricKey(data: key), authenticating: Data((scope + context.key).utf8))
            let doc = try JSONDecoder().decode(MobileQuoteRecoveryDocument.self, from: plaintext)
            guard doc.version == 1, doc.completedQuoteID == nil || (doc.pending == nil && doc.rejected == nil && doc.draft == nil && doc.completedQuoteID.flatMap(UUID.init(uuidString:)) != nil),
                  doc.pending == nil || doc.pending?.request.requestId.flatMap(UUID.init(uuidString:)) != nil else { throw QuoteRecoveryError.unavailable }
            return doc
        } catch { throw QuoteRecoveryError.unavailable }
    }
    private func write(_ doc: MobileQuoteRecoveryDocument, session: MobileQuoteRecoverySession) throws {
        try validate(session)
        do {
            guard let directory else { throw QuoteRecoveryError.unavailable }
            var root = directory.appendingPathComponent(session.scope, isDirectory: true)
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
            var resources = URLResourceValues(); resources.isExcludedFromBackup = true; try root.setResourceValues(resources)
            let existingFiles = try FileManager.default.contentsOfDirectory(atPath: root.path)
            let key = try keyProvider(session.scope, existingFiles.isEmpty)
            guard key.count == 32 else { throw QuoteRecoveryError.unavailable }
            let sealed = try AES.GCM.seal(JSONEncoder().encode(doc), using: SymmetricKey(data: key), authenticating: Data((session.scope + session.context.key).utf8))
            guard let data = sealed.combined else { throw QuoteRecoveryError.unavailable }
            let url = try file(scope: session.scope, context: session.context)
            var options: Data.WritingOptions = [.atomic]
            #if os(iOS)
            options.insert(.completeFileProtection)
            #endif
            try data.write(to: url, options: options)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        } catch { throw QuoteRecoveryError.unavailable }
    }
    private func file(scope: String, context: MobileQuoteRecoveryContext) throws -> URL {
        guard let directory else { throw QuoteRecoveryError.unavailable }
        return directory.appendingPathComponent(scope, isDirectory: true).appendingPathComponent(digest(context.key) + ".sealed")
    }
    nonisolated static func scope(environment: String, userID: String) -> String {
        SHA256.hash(data: Data((environment + "\n" + userID.lowercased()).utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private func digest(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }

    nonisolated static func deviceKey(scope: String, create: Bool) throws -> Data {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.angeltreeservices.quote-recovery.v1", kSecAttrAccount as String: scope,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, data.count == 32 { return data }
        guard status == errSecItemNotFound && create else { throw QuoteRecoveryError.unavailable }
        let key = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        let attributes: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.angeltreeservices.quote-recovery.v1", kSecAttrAccount as String: scope,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecAttrSynchronizable as String: false, kSecValueData as String: key]
        let added = SecItemAdd(attributes as CFDictionary, nil)
        if added == errSecDuplicateItem { return try deviceKey(scope: scope, create: false) }
        guard added == errSecSuccess else { throw QuoteRecoveryError.unavailable }
        return key
    }
}
