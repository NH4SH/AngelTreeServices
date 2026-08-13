import SwiftUI

struct ProposalEditorView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let quote: MobileQuoteDetail?
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

    var body: some View {
        Form {
            Section("Contracting party") {
                Button { showPartyPicker = true } label: { HStack { VStack(alignment: .leading) { Text(party?.name ?? "Choose customer or organization"); if let address = party?.address { Text(address).font(.caption).foregroundStyle(.secondary) } }; Spacer(); Image(systemName: "chevron.right") } }
                if let detail = partyDetail {
                    Picker("Service location", selection: $serviceLocationID) { Text("Choose location").tag(""); ForEach(detail.serviceLocations) { Text($0.fullAddress).tag($0.id) } }
                    if detail.kind == .organization {
                        Picker("Proposal recipient", selection: $recipientID) { Text("Choose recipient").tag(""); ForEach(detail.contacts) { Text($0.name).tag($0.id) } }
                        Picker("Approval contact", selection: $approvalID) { Text("Choose approval contact").tag(""); ForEach(detail.contacts) { Text($0.name).tag($0.id) } }
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
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }
        .navigationTitle(quote == nil ? "New Proposal" : "Edit Proposal").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }; ToolbarItem(placement: .confirmationAction) { Button(saving ? "Saving…" : "Save") { Task { await save() } }.disabled(saving) } }
        .sheet(isPresented: $showPartyPicker) { NavigationStack { ProposalPartyPicker(fieldService: fieldService) { selected in party = selected; showPartyPicker = false; Task { await loadParty(selected) } } } }
        .task { configureExisting() }
    }

    private func configureExisting() {
        guard let quote, party == nil else { return }
        if let linked = quote.party { let selected = MobilePartySearchResult(id: linked.id, kind: linked.kind, name: linked.name, contactName: nil, email: nil, phone: nil, address: quote.serviceLocation.fullAddress); party = selected; Task { await loadParty(selected) } }
        customerMessage = quote.customerMessage ?? ""; serviceLocationID = quote.serviceLocation.id
        recipientID = quote.recipientContactId ?? ""; approvalID = quote.approvalContactId ?? ""
        lines = quote.lines.map { .init(id: UUID(), persistedID: $0.id, name: $0.name, description: $0.description ?? "", quantity: $0.quantity.formatted(.number.precision(.fractionLength(0...2))), unitPrice: (Double($0.unitPriceCents) / 100).formatted(.number.precision(.fractionLength(2)))) }
        if let expires = quote.expiresAt.flatMap(CRMDateParser.date(from:)) { expiration = expires }
    }

    private func loadParty(_ selected: MobilePartySearchResult) async {
        do { let detail = try await fieldService.partyDetail(kind: selected.kind, id: selected.id, userID: access.userID, allowCached: false).detail; partyDetail = detail; if !detail.serviceLocations.contains(where: { $0.id == serviceLocationID }) { serviceLocationID = detail.serviceLocations.first?.id ?? "" }; if detail.kind == .organization { recipientID = recipientID.isEmpty ? detail.contacts.first?.id ?? "" : recipientID; approvalID = approvalID.isEmpty ? detail.contacts.first?.id ?? "" : approvalID } } catch { errorMessage = "Customer details could not be loaded." }
    }

    private func save() async {
        guard let party, !serviceLocationID.isEmpty else { errorMessage = "Choose a customer and service location."; return }
        let validLines = lines.compactMap { $0.requestLine }
        guard validLines.count == lines.count, !validLines.isEmpty else { errorMessage = "Complete each line title, quantity, and price."; return }
        saving = true; defer { saving = false }
        let request = MobileQuoteWriteRequest(customerId: party.kind == .customer ? party.id : nil, organizationId: party.kind == .organization ? party.id : nil, serviceLocationId: serviceLocationID, customerMessage: customerMessage.isEmpty ? nil : customerMessage, expiresAt: ISO8601DateFormatter().string(from: expiration), recipientContactId: recipientID.isEmpty ? nil : recipientID, approvalContactId: approvalID.isEmpty ? nil : approvalID, lines: validLines)
        do { onSaved(try await (quote == nil ? fieldService.createQuote(request) : fieldService.updateQuote(id: quote!.id, input: request))) }
        catch { errorMessage = (error as? LocalizedError)?.errorDescription ?? "Proposal could not be saved." }
    }

    private func move(_ id: UUID, by offset: Int) {
        guard let source = lines.firstIndex(where: { $0.id == id }) else { return }
        let destination = source + offset
        guard lines.indices.contains(destination) else { return }
        lines.swapAt(source, destination)
    }

    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
}

private struct LineDraft: Identifiable { let id: UUID; var persistedID: String? = nil; var name: String; var description: String; var quantity: String; var unitPrice: String; static func empty() -> Self { .init(id: UUID(), name: "", description: "", quantity: "1", unitPrice: "") }; var unitPriceCents: Int? { guard let decimal = Decimal(string: unitPrice), decimal >= 0 else { return nil }; return NSDecimalNumber(decimal: decimal * 100).rounding(accordingToBehavior: NSDecimalNumberHandler(roundingMode: .plain, scale: 0, raiseOnExactness: false, raiseOnOverflow: false, raiseOnUnderflow: false, raiseOnDivideByZero: false)).intValue }; var totalCents: Int { guard let quantity = Double(quantity), let unitPriceCents else { return 0 }; return Int((quantity * Double(unitPriceCents)).rounded()) }; var requestLine: MobileQuoteLine? { guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let quantity = Double(quantity), quantity > 0, let unitPriceCents else { return nil }; return .init(id: persistedID, name: name, description: description.isEmpty ? nil : description, quantity: quantity, unitPriceCents: unitPriceCents, totalCents: nil) } }

private struct ProposalPartyPicker: View {
    let fieldService: any FieldDataService; let onSelect: (MobilePartySearchResult) -> Void
    @State private var query = ""; @State private var results: [MobilePartySearchResult] = []; @State private var loading = false
    var body: some View { List { if loading { ProgressView("Searching") }; ForEach(results) { item in Button { onSelect(item) } label: { VStack(alignment: .leading) { Text(item.name).font(.headline); if let address = item.address { Text(address).font(.subheadline).foregroundStyle(.secondary) } } } } }.navigationTitle("Choose Customer").searchable(text: $query, prompt: "Name, phone, or address").task(id: query) { let value = query.trimmingCharacters(in: .whitespacesAndNewlines); guard value.count >= 2 else { results = []; return }; try? await Task.sleep(for: .milliseconds(300)); guard !Task.isCancelled else { return }; loading = true; results = (try? await fieldService.searchParties(query: value)) ?? []; loading = false } }
}
