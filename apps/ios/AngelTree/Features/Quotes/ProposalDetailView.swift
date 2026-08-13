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
    @State private var showPreview = false
    @State private var duplicating = false
    @State private var duplicate: MobileQuoteDetail?

    var body: some View {
        Group {
            if loading && quote == nil { ProgressView("Loading proposal") }
            else if let errorMessage, quote == nil {
                VStack(spacing: 10) {
                    Image(systemName: "doc.text").font(.largeTitle).foregroundStyle(.secondary)
                    Text("Proposal unavailable").font(.headline)
                    Text(errorMessage).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding()
            }
            else if let quote { content(quote) }
        }
        .background(AngelTreeTheme.canvas).navigationTitle("Proposal").navigationBarTitleDisplayMode(.inline)
        .task { await load(allowCached: true) }
        .sheet(isPresented: $showPreview) { if let quote { NavigationStack { ProposalPreviewView(quote: quote) } } }
        .sheet(isPresented: $showEdit) { if let quote { NavigationStack { ProposalEditorView(access: access, fieldService: fieldService, quote: quote) { updated in self.quote = updated; showEdit = false } } } }
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
                if ["draft", "sent", "change_requested"].contains(quote.status) { Button { showEdit = true } label: { Label("Edit proposal", systemImage: "pencil") } }
                Button { Task { await duplicateQuote() } } label: { Label(duplicating ? "Duplicating…" : "Duplicate proposal", systemImage: "doc.on.doc") }.disabled(duplicating)
                if let jobID = quote.linkedJobId {
                    NavigationLink { JobDetailView(jobID: jobID, summary: nil, scheduleItem: nil, access: access, fieldService: fieldService, photoService: photoService) } label: { Label("Open linked job", systemImage: "leaf") }
                }
                if quote.linkedInvoiceId != nil { Label("Linked invoice available in the full CRM", systemImage: "doc.plaintext").foregroundStyle(.secondary) }
            }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }.scrollContentBackground(.hidden)
    }

    private func load(allowCached: Bool) async { loading = true; do { let result = try await fieldService.quoteDetail(id: quoteID, userID: access.userID, allowCached: allowCached); quote = result.detail; stale = result.cached; errorMessage = nil; if result.cached { await load(allowCached: false) } } catch { errorMessage = (error as? LocalizedError)?.errorDescription ?? "Try again." }; loading = false }
    private func duplicateQuote() async { duplicating = true; defer { duplicating = false }; do { duplicate = try await fieldService.duplicateQuote(id: quoteID) } catch { errorMessage = (error as? LocalizedError)?.errorDescription ?? "Proposal could not be duplicated." } }
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
