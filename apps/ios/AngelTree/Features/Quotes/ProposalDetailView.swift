import SwiftUI

struct ProposalDetailView: View {
    let quoteID: String
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService
    @State private var quote: MobileQuoteDetail?
    @State private var errorMessage: String?
    @State private var loading = true
    @State private var stale = false
    @State private var showEdit = false
    @State private var hasEditRecovery = false
    @State private var showPreview = false
    @State private var duplicating = false
    @State private var duplicate: MobileQuoteDetail?
    @State private var copySession: MobileQuoteRecoverySession?
    @State private var copyDocument = MobileQuoteRecoveryDocument()
    @State private var copyReady = false
    @State private var copyPreparing = false
    @State private var copyRecoveryError: String?
    @State private var editRecoveryError: String?
    @State private var acknowledgingCopy = false
    @State private var savedCopy: MobileQuoteDetail?
    @State private var showSavedCopy = false
    @State private var confirmAnotherCopy = false
    @State private var confirmDiscardCopy = false

    var body: some View {
        Group {
            if loading && quote == nil { ProgressView("Loading proposal") }
            else if let errorMessage, quote == nil && copyDocument.pending == nil && copyDocument.rejected == nil && copyDocument.completedQuoteID == nil {
                VStack(spacing: 10) {
                    Image(systemName: "doc.text").font(.largeTitle).foregroundStyle(.secondary)
                    Text("Proposal unavailable").font(.headline)
                    Text(errorMessage).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    if hasEditRecovery { Button("Recover local edit") { showEdit = true } }
                }.padding()
            }
            else if let quote { content(quote) }
            else if copyReady { List { copyRecoveryControls } }
        }
        .background(AngelTreeTheme.canvas).navigationTitle("Proposal").navigationBarTitleDisplayMode(.inline)
        .task { await prepareCopyRecovery(); await load(allowCached: true) }
        .confirmationDialog("Create another copy?", isPresented: $confirmAnotherCopy, titleVisibility: .visible) {
            Button("Create another copy") { Task { await resetCopy(reviewedRequest: false, createNow: true) } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("The saved copy will remain. A separate proposal will be created from the details shown here.") }
        .sheet(isPresented: $showSavedCopy) {
            if let savedCopy { NavigationStack { ProposalPreviewView(quote: savedCopy) } }
        }
        .confirmationDialog("Discard local copy recovery?", isPresented: $confirmDiscardCopy, titleVisibility: .visible) {
            Button("Discard after review", role: .destructive) { Task { await resetCopy(reviewedRequest: true, createNow: false) } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Review proposals first: the copy may already have saved. This discards only this device's request. It does not delete any proposal.") }
        .sheet(isPresented: $showPreview) { if let quote { NavigationStack { ProposalPreviewView(quote: quote) } } }
        .sheet(isPresented: $showEdit) { NavigationStack { ProposalEditorView(access: access, fieldService: fieldService, quote: quote, recoveryQuoteID: quoteID) { updated in self.quote = updated; showEdit = false } } }
        .navigationDestination(isPresented: Binding(get: { duplicate != nil }, set: { if !$0 { duplicate = nil } })) {
            if let duplicate { ProposalDetailView(quoteID: duplicate.id, access: access, fieldService: fieldService, photoService: photoService) }
        }
    }

    private func content(_ quote: MobileQuoteDetail) -> some View {
        List {
            if stale { Section { Label("Showing saved proposal details", systemImage: "icloud.slash").foregroundStyle(AngelTreeTheme.warning) } }
            Section {
                LabeledContent("Proposal", value: quote.proposalNumber.map { "#\($0)" } ?? "Draft")
                LabeledContent("Status", value: quote.status.replacingOccurrences(of: "_", with: " ").capitalized)
                if let party = quote.party {
                    NavigationLink {
                        CustomerDetailView(
                            reference: .init(id: party.id, kind: party.kind, name: party.name, contactName: nil, email: nil, phone: nil, address: quote.serviceLocation.fullAddress),
                            access: access, fieldService: fieldService, photoService: photoService
                        )
                    } label: { LabeledContent("Contracting party", value: party.name) }
                } else { LabeledContent("Contracting party", value: "Unknown") }
                LabeledContent("Service location", value: quote.serviceLocation.fullAddress)
                LabeledContent("Portal", value: quote.portalStatus.capitalized)
            }
            if let message = quote.customerMessage { Section("Customer notes") { Text(message).textSelection(.enabled) } }
            Section("Scope and pricing") {
                ForEach(Array(quote.lines.enumerated()), id: \.element.stableID) { _, line in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline) { Text(line.name).font(.headline); Spacer(); Text(money(line.totalCents ?? Int((line.quantity * Double(line.unitPriceCents)).rounded()))).font(.headline).foregroundStyle(AngelTreeTheme.forest) }
                        if let description = line.description { Text(description).font(.subheadline).foregroundStyle(.secondary).textSelection(.enabled) }
                        if line.quantity != 1 { Text("\(line.quantity.formatted()) × \(money(line.unitPriceCents)) each").font(.caption).foregroundStyle(.secondary) }
                    }.padding(.vertical, 5)
                }
                LabeledContent("Proposal total") { Text(money(quote.totalCents)).font(.title3.bold()).foregroundStyle(AngelTreeTheme.forest) }
            }
            Section("Dates") {
                LabeledContent("Created", value: date(quote.createdAt))
                if let sent = quote.sentAt { LabeledContent("Sent", value: date(sent)) }
                if let approved = quote.approvedAt { LabeledContent("Accepted", value: date(approved)) }
                if let expires = quote.expiresAt { LabeledContent("Valid through", value: date(expires)) }
            }
            Section("Actions") {
                Button { showPreview = true } label: { Label("Preview proposal", systemImage: "doc.richtext") }
                if ["draft", "sent", "change_requested"].contains(quote.status) || hasEditRecovery { Button { showEdit = true } label: { Label(hasEditRecovery ? "Recover local edit" : "Edit proposal", systemImage: "pencil") } }
                copyRecoveryControls
                if let jobID = quote.linkedJobId {
                    NavigationLink { JobDetailView(jobID: jobID, summary: nil, scheduleItem: nil, access: access, fieldService: fieldService, photoService: photoService) } label: { Label("Open linked job", systemImage: "leaf") }
                }
                if let invoiceID = quote.linkedInvoiceId, access.canViewInvoices {
                    NavigationLink {
                        InvoiceDetailView(
                            invoiceID: invoiceID,
                            access: access,
                            fieldService: fieldService,
                            photoService: photoService
                        )
                    } label: {
                        Label("Open linked invoice", systemImage: "doc.plaintext")
                    }
                }
            }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            if let editRecoveryError { Section { Text(editRecoveryError).foregroundStyle(.red); Button("Retry local edit recovery") { Task { await prepareCopyRecovery() } } } }
        }.scrollContentBackground(.hidden)
    }

    private func load(allowCached: Bool) async { loading = true; do { let result = try await fieldService.quoteDetail(id: quoteID, userID: access.userID, allowCached: allowCached); quote = result.detail; stale = result.cached; errorMessage = nil; if result.cached { await load(allowCached: false) } } catch { errorMessage = (error as? LocalizedError)?.errorDescription ?? "Try again." }; loading = false }
    @ViewBuilder private var copyRecoveryControls: some View {
        if !copyReady {
            if copyPreparing { ProgressView("Restoring copy…") }
            else {
                if let copyRecoveryError { Text(copyRecoveryError).font(.footnote).foregroundStyle(.secondary) }
                Button("Retry copy recovery") { Task { await prepareCopyRecovery() } }.disabled(duplicating || acknowledgingCopy)
            }
        } else if copyDocument.pending?.kind == .emptyCopy && copyDocument.pending?.confirmedQuoteID == nil {
            Text("An empty draft copy needs manual review. Check proposals before starting another copy.").font(.footnote).foregroundStyle(.secondary)
            Button("Discard local recovery after review", role: .destructive) { confirmDiscardCopy = true }.disabled(duplicating || acknowledgingCopy)
        } else {
            Button { Task { await duplicateQuote() } } label: { Label(copyActionTitle, systemImage: "doc.on.doc") }
                .disabled(duplicating || acknowledgingCopy || (stale && copyDocument.pending == nil && copyDocument.rejected == nil && copyDocument.completedQuoteID == nil))
            if copyDocument.completedQuoteID != nil {
                Button("Create another copy") { confirmAnotherCopy = true }.disabled(duplicating || acknowledgingCopy || stale || quote == nil)
            } else if copyDocument.pending != nil || copyDocument.rejected != nil {
                Text("The saved copy request will use its original details. It is kept on this device until reviewed.").font(.footnote).foregroundStyle(.secondary)
                if copyDocument.pending?.confirmedQuoteID != nil, let savedCopy {
                    Button("Use saved copy") { Task { await acknowledgeCopy(savedCopy) } }.disabled(duplicating || acknowledgingCopy)
                }
                Button("Discard local recovery after review", role: .destructive) { confirmDiscardCopy = true }.disabled(duplicating || acknowledgingCopy)
            }
        }
    }
    private var copyActionTitle: String {
        if duplicating { return "Checking copy…" }
        if copyDocument.completedQuoteID != nil || copyDocument.pending?.confirmedQuoteID != nil { return "Review saved copy" }
        return copyDocument.pending != nil || copyDocument.rejected != nil ? "Retry saved copy" : "Duplicate proposal"
    }
    private func prepareCopyRecovery() async {
        guard !duplicating, !acknowledgingCopy, !copyPreparing else { return }
        copyPreparing = true; defer { copyPreparing = false }
        do {
            let session = try await fieldService.openQuoteRecovery(context: .copy(quoteID), userID: access.userID)
            copySession = session; copyDocument = session.document; copyReady = true; copyRecoveryError = nil
            do {
                let edit = try await fieldService.inspectQuoteRecovery(context: .edit(quoteID), userID: access.userID)
                hasEditRecovery = edit.draft != nil || edit.pending != nil; editRecoveryError = nil
            } catch { editRecoveryError = "Local edit recovery is unavailable. Your saved work has been kept." }
        } catch { copyRecoveryError = error.localizedDescription; copyReady = false }
    }
    private func duplicateQuote() async {
        guard !duplicating, copyReady, let session = copySession else { return }
        duplicating = true; defer { duplicating = false }
        do {
            if copyDocument.completedQuoteID != nil || copyDocument.pending?.confirmedQuoteID != nil {
                savedCopy = try await fieldService.reviewQuoteRecovery(session); showSavedCopy = true; return
            }
            let saved: MobileQuoteDetail
            if copyDocument.pending != nil || copyDocument.rejected != nil {
                saved = try await fieldService.retryQuoteRecovery(session)
            } else {
                guard let quote, !stale else { throw MobileAPIError.requestRejected("Refresh this proposal before making a copy.") }
                let pending: MobileQuotePendingRequest
                if quote.lines.isEmpty {
                    let request = MobileQuoteWriteRequest(customerId: nil, organizationId: nil, serviceLocationId: quote.serviceLocation.id,
                        customerMessage: nil, expiresAt: nil, recipientContactId: nil, approvalContactId: nil, lines: [], requestId: UUID().uuidString.lowercased())
                    pending = .init(kind: .emptyCopy, request: request)
                } else { pending = .init(kind: .copy, request: try MobileQuoteDuplicateAttempt(source: quote).request) }
                saved = try await fieldService.submitQuoteRecovery(pending, session: session)
            }
            copyDocument = try await fieldService.quoteRecoveryDocument(session)
            savedCopy = saved; errorMessage = nil
            if saved.creationReplayed == true { showSavedCopy = true }
            else { await acknowledgeCopy(saved) }
        } catch {
            errorMessage = error.localizedDescription
            if let doc = try? await fieldService.quoteRecoveryDocument(session) { copyDocument = doc }
        }
    }
    private func acknowledgeCopy(_ saved: MobileQuoteDetail) async {
        guard !acknowledgingCopy, let session = copySession else { return }
        acknowledgingCopy = true; defer { acknowledgingCopy = false }
        do {
            try await fieldService.acknowledgeQuoteRecovery(quoteID: saved.id, session: session)
            copyReady = false
            let next = try await fieldService.openQuoteRecovery(context: .copy(quoteID), userID: access.userID)
            copySession = next; copyDocument = next.document; copyReady = true
            showSavedCopy = false; duplicate = saved
        } catch { errorMessage = error.localizedDescription }
    }
    private func resetCopy(reviewedRequest: Bool, createNow: Bool) async {
        guard !duplicating, let session = copySession else { return }
        do {
            let next = try await fieldService.resetQuoteRecovery(session, reviewedRequest: reviewedRequest)
            copySession = next; copyDocument = next.document; savedCopy = nil; errorMessage = nil; copyReady = true
            if createNow { await duplicateQuote() }
        } catch { errorMessage = error.localizedDescription }
    }
    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
    private func date(_ value: String) -> String { CRMDateParser.date(from: value).map { BusinessCalendar.dayHeading($0) } ?? value }
}

struct ProposalPreviewView: View {
    let quote: MobileQuoteDetail
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 4) { Text("ANGEL TREE SERVICES").font(.caption.bold()).foregroundStyle(AngelTreeTheme.forest); Text("Proposal").font(.largeTitle.bold()); Text(quote.proposalNumber.map { "#\($0)" } ?? "Draft proposal").foregroundStyle(.secondary) }
                Divider()
                VStack(alignment: .leading, spacing: 5) { Text(quote.party?.name ?? "Customer").font(.title3.bold()); Text(quote.serviceLocation.fullAddress).foregroundStyle(.secondary) }
                if let message = quote.customerMessage { Text(message).font(.body) }
                ForEach(quote.lines, id: \.stableID) { line in
                    VStack(alignment: .leading, spacing: 8) { Text(line.name.uppercased()).font(.headline).foregroundStyle(AngelTreeTheme.forest); if let description = line.description { Text(description) }; HStack { if line.quantity != 1 { Text("\(line.quantity.formatted()) × \(money(line.unitPriceCents))").font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(money(line.totalCents ?? Int((line.quantity * Double(line.unitPriceCents)).rounded()))).font(.title3.bold()) }; Divider() }
                }
                HStack { Text("Proposal Total").font(.title2.bold()); Spacer(); Text(money(quote.totalCents)).font(.title2.bold()).foregroundStyle(AngelTreeTheme.forest) }
            }.padding(24)
        }.background(Color.white).navigationTitle("Preview").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }
    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
}
