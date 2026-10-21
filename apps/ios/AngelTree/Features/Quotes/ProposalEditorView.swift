import SwiftUI

struct ProposalEditorView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let quote: MobileQuoteDetail?
    var recoveryQuoteID: String? = nil
    let onSaved: (MobileQuoteDetail) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var party: MobilePartySearchResult?
    @State private var partyDetail: MobilePartyDetail?
    @State private var customerMessage = ""
    @State private var serviceLocationID = ""
    @State private var recipientID = ""
    @State private var approvalID = ""
    @State private var expiration = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()
    @State private var lines: [LineDraft] = [.empty()]
    @State private var showPartyPicker = false
    @State private var saving = false
    @State private var errorMessage: String?
    @State private var expectedRevision: Int?
    @State private var hasEditCapability = false
    @State private var draftRequestID = UUID().uuidString.lowercased()
    @State private var recoverySession: MobileQuoteRecoverySession?
    @State private var recoveryDocument = MobileQuoteRecoveryDocument()
    @State private var ready = false
    @State private var preparingRecovery = false
    @State private var persistenceTask: Task<Void, Never>?
    @State private var confirmDiscardRecovery = false
    @State private var confirmCloseWithoutSaving = false
    @State private var pendingDraftSnapshot: MobileQuoteEditorDraft?
    @State private var confirmStartAnother = false
    @State private var recoveredQuote: MobileQuoteDetail?
    @State private var showRecoveredQuote = false
    @State private var requestStatusMessage: String?

    var body: some View {
        Form {
            if recoveryDocument.completedQuoteID == nil {
            Group {
            Section("Contracting party") {
                Button { showPartyPicker = true } label: { HStack { VStack(alignment: .leading) { Text(party?.name ?? "Choose customer or organization"); if let address = party?.address { Text(address).font(.caption).foregroundStyle(.secondary) } }; Spacer(); Image(systemName: "chevron.right") } }
                if let detail = partyDetail {
                    Picker("Service location", selection: $serviceLocationID) { Text("Choose location").tag(""); if !serviceLocationID.isEmpty && !detail.serviceLocations.contains(where: { $0.id == serviceLocationID }) { Text("Previous location — choose a current location").tag(serviceLocationID) }; ForEach(detail.serviceLocations) { Text($0.fullAddress).tag($0.id) } }
                    if detail.kind == .organization {
                        Picker("Proposal recipient", selection: $recipientID) { Text("Choose recipient").tag(""); if !recipientID.isEmpty && !detail.contacts.contains(where: { $0.id == recipientID }) { Text("Previous recipient — choose a current contact").tag(recipientID) }; ForEach(detail.contacts) { Text($0.name).tag($0.id) } }
                        Picker("Approval contact", selection: $approvalID) { Text("Choose approval contact").tag(""); if !approvalID.isEmpty && !detail.contacts.contains(where: { $0.id == approvalID }) { Text("Previous approval contact — choose a current contact").tag(approvalID) }; ForEach(detail.contacts) { Text($0.name).tag($0.id) } }
                    }
                }
            }
            Section("Customer-facing notes") { TextEditor(text: $customerMessage).frame(minHeight: 110).accessibilityLabel("Customer-facing proposal notes") }
            Section("Proposal lines") {
                ForEach($lines) { $line in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            TextField("Service title", text: $line.name)
                            Button { move(line.id, by: -1) } label: { Image(systemName: "arrow.up") }.disabled(lines.first?.id == line.id).accessibilityLabel("Move item up")
                            Button { move(line.id, by: 1) } label: { Image(systemName: "arrow.down") }.disabled(lines.last?.id == line.id).accessibilityLabel("Move item down")
                        }
                        TextField("Description and scope", text: $line.description, axis: .vertical).lineLimit(4...12)
                        HStack { TextField("Quantity", text: $line.quantity).keyboardType(.decimalPad); TextField("Unit price", text: $line.unitPrice).keyboardType(.decimalPad) }
                        if lines.count > 1 { Button(role: .destructive) { lines.removeAll { $0.id == line.id } } label: { Label("Remove item", systemImage: "trash") } }
                    }.padding(.vertical, 5)
                }
                Button { lines.append(.empty()) } label: { Label("Add item", systemImage: "plus.circle") }
                LabeledContent("Draft total", value: money(lines.reduce(0) { $0 + $1.totalCents }))
            }
            Section("Validity") { DatePicker("Valid through", selection: $expiration, displayedComponents: .date) }
            }.disabled(!ready || recoveryDocument.pending != nil)
            }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            if let requestStatusMessage { Section { Text(requestStatusMessage).accessibilityIdentifier("quote-request-status") } }
            if recoveryDocument.pending != nil {
                Section("Previous save") {
                    Text("Your last save is kept on this device. Check its result before starting another proposal.")
                    if recoveryDocument.pending?.kind == .create && recoveryDocument.pending?.confirmedQuoteID == nil {
                        Button("Retry save using original details") { Task { await save(retryPending: true) } }
                    }
                    if recoveryDocument.pending?.confirmedQuoteID != nil || quote != nil {
                        Button("Review saved proposal") { Task { await reviewRecovery() } }
                    }
                    if recoveryDocument.pending?.confirmedQuoteID != nil, let recoveredQuote {
                        Button("Use saved proposal") { Task { await finishRecovery(recoveredQuote) } }
                    }
                    DisclosureGroup("Recovered wording") {
                        Text(customerMessage).textSelection(.enabled)
                        ForEach(lines) { line in
                            VStack(alignment: .leading) { Text(line.name).bold(); Text(line.description); Text(line.quantity + " × " + line.unitPrice) }.textSelection(.enabled)
                        }
                    }
                    Button("Discard local recovery after review", role: .destructive) { confirmDiscardRecovery = true }
                }
            } else if recoveryDocument.completedQuoteID != nil {
                Section("Previous save confirmed") {
                    Button("Review saved proposal") { Task { await reviewRecovery() } }
                    Button(editingQuoteID == nil ? "Start another proposal" : "Open a fresh editor") { confirmStartAnother = true }
                }
            } else if ready {
                if recoveryDocument.rejected?.kind == .create {
                    Section("Previous request") { Button("Check saved request") { Task { await checkRecovery() } } }
                }
                Section { Text("Draft recovery stays on this device. Close to save your latest changes.").font(.footnote).foregroundStyle(.secondary)
                    Button("Discard local draft", role: .destructive) { confirmDiscardRecovery = true }
                }
            } else {
                Section { if preparingRecovery { ProgressView("Restoring draft…") } else { Button("Retry recovery") { Task { await prepareRecovery() } } } }
            }
        }
        .disabled(saving)
        .navigationTitle(editingQuoteID == nil ? "New Proposal" : "Edit Proposal").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { Task { await closeEditor() } }.disabled(saving) }; ToolbarItem(placement: .confirmationAction) { Button(saving ? "Working…" : recoveryDocument.pending?.kind == .create ? "Check saved request" : recoveryDocument.pending != nil ? "Retry save" : "Save") { Task { await save() } }.disabled(saving || !ready || recoveryDocument.completedQuoteID != nil) } }
        .sheet(isPresented: $showPartyPicker) { NavigationStack { ProposalPartyPicker(fieldService: fieldService) { selected in party = selected; showPartyPicker = false; Task { await loadParty(selected) } } } }
        .sheet(isPresented: $showRecoveredQuote) { if let recoveredQuote { NavigationStack { ProposalPreviewView(quote: recoveredQuote) } } }
        .confirmationDialog("Discard local recovery?", isPresented: $confirmDiscardRecovery, titleVisibility: .visible) {
            Button("Discard after review", role: .destructive) { Task { await resetRecovery(reviewedRequest: true) } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Review the saved proposal or proposal list first. A previous request may already have saved. This discards this device's draft and request, not any saved proposal.") }
        .confirmationDialog("Start a fresh draft?", isPresented: $confirmStartAnother, titleVisibility: .visible) {
            Button("Start fresh") { Task { await resetRecovery(reviewedRequest: false) } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("The previously saved proposal will remain.") }
        .confirmationDialog("Latest changes could not be saved", isPresented: $confirmCloseWithoutSaving, titleVisibility: .visible) {
            Button("Close without saving latest changes", role: .destructive) { ready = false; dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: { Text("The previous recovery record will remain. Any latest changes that failed to save will be lost if you close.") }
        .onChange(of: draftSnapshot) { snapshot in queueDraft(snapshot) }
        .interactiveDismissDisabled(ready || saving)
        .task { if !ready { await prepareRecovery() } }
    }

    private func configureExisting() {
        guard let quote, party == nil else { return }
        // Capture the version alongside the fields. Parent refreshes must not
        // give this unsaved editor a newer version than the content it opened.
        expectedRevision = quote.editRevision
        hasEditCapability = quote.quoteEditVersion == 1
        if let linked = quote.party { let selected = MobilePartySearchResult(id: linked.id, kind: linked.kind, name: linked.name, contactName: nil, email: nil, phone: nil, address: quote.serviceLocation.fullAddress); party = selected }
        customerMessage = quote.customerMessage ?? ""; serviceLocationID = quote.serviceLocation.id
        recipientID = quote.recipientContactId ?? ""; approvalID = quote.approvalContactId ?? ""
        lines = quote.lines.map { .init(id: UUID(), persistedID: $0.id, name: $0.name, description: $0.description ?? "", quantity: $0.quantity.formatted(.number.precision(.fractionLength(0...2))), unitPrice: (Double($0.unitPriceCents) / 100).formatted(.number.precision(.fractionLength(2)))) }
        if let expires = quote.expiresAt.flatMap(CRMDateParser.date(from:)) { expiration = expires }
    }

    private var editingQuoteID: String? { quote?.id ?? recoveryQuoteID }
    private var recoveryContext: MobileQuoteRecoveryContext { editingQuoteID.map { .edit($0) } ?? .newProposal }
    private var draftSnapshot: MobileQuoteEditorDraft {
        .init(party: party, customerMessage: customerMessage, serviceLocationID: serviceLocationID, recipientID: recipientID,
              approvalID: approvalID, expiration: expiration, lines: lines, expectedRevision: expectedRevision,
              hasEditCapability: hasEditCapability, requestID: draftRequestID)
    }
    private func apply(_ draft: MobileQuoteEditorDraft) {
        party = draft.party; customerMessage = draft.customerMessage; serviceLocationID = draft.serviceLocationID
        recipientID = draft.recipientID; approvalID = draft.approvalID; expiration = draft.expiration
        lines = draft.lines; expectedRevision = draft.expectedRevision; hasEditCapability = draft.hasEditCapability; draftRequestID = draft.requestID
    }
    private func prepareRecovery() async {
        guard !saving, !preparingRecovery else { return }
        preparingRecovery = true; defer { preparingRecovery = false }
        do {
            configureExisting()
            var session = try await fieldService.openQuoteRecovery(context: recoveryContext, userID: access.userID)
            if editingQuoteID != nil && session.document.completedQuoteID != nil {
                // Opening Edit on an acknowledged record is an explicit new edit,
                // not recovery or a rebase of unfinished work.
                session = try await fieldService.resetQuoteRecovery(session, reviewedRequest: false)
            }
            recoverySession = session; recoveryDocument = session.document
            if let draft = session.document.draft { apply(draft) }
            else if let id = session.document.rejected?.request.requestId { draftRequestID = id }
            if session.document.pending == nil && session.document.completedQuoteID == nil {
                try await fieldService.saveQuoteDraft(draftSnapshot, session: session)
            }
            ready = true
            if let party { await loadParty(party, preserveSelection: true) }
        } catch { errorMessage = error.localizedDescription; ready = false }
    }
    private func queueDraft(_ snapshot: MobileQuoteEditorDraft) {
        guard ready, snapshot.requestID == draftRequestID, recoveryDocument.completedQuoteID == nil, let session = recoverySession else { return }
        pendingDraftSnapshot = snapshot
        guard persistenceTask == nil else { return }
        // Coalesce typing into one writer and one latest snapshot, in order.
        persistenceTask = Task {
            while let latest = pendingDraftSnapshot {
                pendingDraftSnapshot = nil
                do { try await fieldService.saveQuoteDraft(latest, session: session) }
                catch { errorMessage = error.localizedDescription }
            }
            persistenceTask = nil
        }
    }
    private func closeEditor() async {
        if ready, recoveryDocument.completedQuoteID == nil, let session = recoverySession {
            await persistenceTask?.value
            do { try await fieldService.saveQuoteDraft(draftSnapshot, session: session) }
            catch { errorMessage = error.localizedDescription; confirmCloseWithoutSaving = true; return }
        }
        ready = false; dismiss()
    }
    private func loadParty(_ selected: MobilePartySearchResult, preserveSelection: Bool = false) async {
        do {
            guard let session = recoverySession else { throw QuoteRecoveryError.unavailable }
            let detail = try await fieldService.recoveryPartyDetail(kind: selected.kind, id: selected.id, session: session)
            guard party?.id == selected.id && party?.kind == selected.kind else { return }
            partyDetail = detail
            if !preserveSelection {
                if !detail.serviceLocations.contains(where: { $0.id == serviceLocationID }) { serviceLocationID = detail.serviceLocations.first?.id ?? "" }
                if detail.kind == .organization { recipientID = recipientID.isEmpty ? detail.contacts.first?.id ?? "" : recipientID; approvalID = approvalID.isEmpty ? detail.contacts.first?.id ?? "" : approvalID }
            }
        } catch { errorMessage = "Customer details could not be loaded. Recovered selections have been kept." }
    }
    private func save(retryPending: Bool = false) async {
        if recoveryDocument.pending?.kind == .create && !retryPending { await checkRecovery(); return }
        guard !saving, ready, let session = recoverySession else { return }
        saving = true; defer { saving = false }
        requestStatusMessage = nil
        await persistenceTask?.value
        do {
            let saved: MobileQuoteDetail
            if recoveryDocument.pending != nil {
                saved = try await fieldService.retryQuoteRecovery(session)
            } else {
                if editingQuoteID != nil && (!hasEditCapability || expectedRevision == nil) { throw MobileAPIError.requestRejected("Refresh this proposal before saving edits. Your recovered draft has been kept.") }
                guard let party, !serviceLocationID.isEmpty else { throw MobileAPIError.requestRejected("Choose a customer and service location.") }
                let validLines = lines.compactMap { $0.requestLine }
                guard validLines.count == lines.count, !validLines.isEmpty else { throw MobileAPIError.requestRejected("Complete each line title, quantity, and price.") }
                try await fieldService.saveQuoteDraft(draftSnapshot, session: session)
                let request = MobileQuoteWriteRequest(customerId: party.kind == .customer ? party.id : nil, organizationId: party.kind == .organization ? party.id : nil,
                    serviceLocationId: serviceLocationID, customerMessage: customerMessage.isEmpty ? nil : customerMessage,
                    expiresAt: ISO8601DateFormatter().string(from: expiration), recipientContactId: recipientID.isEmpty ? nil : recipientID,
                    approvalContactId: approvalID.isEmpty ? nil : approvalID, lines: validLines, expectedRevision: expectedRevision, requestId: draftRequestID)
                saved = try await fieldService.submitQuoteRecovery(.init(kind: editingQuoteID == nil ? .create : .edit, request: request), session: session)
            }
            recoveryDocument = try await fieldService.quoteRecoveryDocument(session)
            if saved.creationReplayed == true { recoveredQuote = saved; showRecoveredQuote = true; errorMessage = nil }
            else { await finishRecovery(saved) }
        } catch {
            errorMessage = error.localizedDescription
            if let doc = try? await fieldService.quoteRecoveryDocument(session) { recoveryDocument = doc }
        }
    }
    private func checkRecovery() async {
        guard !saving, ready, let session = recoverySession else { return }
        saving = true; defer { saving = false }
        requestStatusMessage = nil; errorMessage = nil; recoveredQuote = nil
        await persistenceTask?.value
        do {
            let result = try await fieldService.checkQuoteRecovery(session)
            recoveryDocument = try await fieldService.quoteRecoveryDocument(session)
            requestStatusMessage = result.message
            if result.state == .recorded {
                recoveredQuote = try await fieldService.reviewQuoteRecovery(session); showRecoveredQuote = true
            }
        } catch { errorMessage = "The saved request could not be checked or loaded. Your draft and original request have been kept. Check again or review proposals in the CRM." }
    }
    private func reviewRecovery() async {
        guard !saving, let session = recoverySession else { return }
        saving = true; defer { saving = false }
        recoveredQuote = nil
        do { recoveredQuote = try await fieldService.reviewQuoteRecovery(session); showRecoveredQuote = true }
        catch { errorMessage = error.localizedDescription }
    }
    private func finishRecovery(_ saved: MobileQuoteDetail) async {
        guard let session = recoverySession else { return }
        do {
            await persistenceTask?.value
            try await fieldService.acknowledgeQuoteRecovery(quoteID: saved.id, session: session)
            ready = false; onSaved(saved)
        } catch { errorMessage = error.localizedDescription }
    }
    private func resetRecovery(reviewedRequest: Bool) async {
        guard !saving, let session = recoverySession else { return }
        saving = true; ready = false; defer { saving = false }
        await persistenceTask?.value
        do {
            let fresh = try await fieldService.resetQuoteRecovery(session, reviewedRequest: reviewedRequest)
            apply(.init()); partyDetail = nil; recoveredQuote = nil; requestStatusMessage = nil; configureExisting()
            recoverySession = fresh; recoveryDocument = fresh.document
            try await fieldService.saveQuoteDraft(draftSnapshot, session: fresh)
            ready = true; errorMessage = nil
            if let party { await loadParty(party, preserveSelection: true) }
        } catch { errorMessage = error.localizedDescription }
    }

    private func move(_ id: UUID, by offset: Int) {
        guard let source = lines.firstIndex(where: { $0.id == id }) else { return }
        let destination = source + offset
        guard lines.indices.contains(destination) else { return }
        lines.swapAt(source, destination)
    }

    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
}

private typealias LineDraft = MobileQuoteEditorLine

private struct ProposalPartyPicker: View {
    let fieldService: any FieldDataService; let onSelect: (MobilePartySearchResult) -> Void
    @State private var query = ""; @State private var results: [MobilePartySearchResult] = []; @State private var loading = false
    var body: some View { List { if loading { ProgressView("Searching") }; ForEach(results) { item in Button { onSelect(item) } label: { VStack(alignment: .leading) { Text(item.name).font(.headline); if let address = item.address { Text(address).font(.subheadline).foregroundStyle(.secondary) } } } } }.navigationTitle("Choose Customer").searchable(text: $query, prompt: "Name, phone, or address").task(id: query) { let value = query.trimmingCharacters(in: .whitespacesAndNewlines); guard value.count >= 2 else { results = []; return }; try? await Task.sleep(for: .milliseconds(300)); guard !Task.isCancelled else { return }; loading = true; results = (try? await fieldService.searchParties(query: value)) ?? []; loading = false } }
}
