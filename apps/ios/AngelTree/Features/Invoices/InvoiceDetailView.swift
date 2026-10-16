import SwiftUI

struct InvoiceDetailView: View {
    let invoiceID: String; let access: AppAccess; let fieldService: any FieldDataService; let photoService: any JobPhotoService
    @State private var payload: MobileInvoicePayload?; @State private var loading = true; @State private var stale = false; @State private var error: String?; @State private var showPayment = false; @State private var hasPendingPayment = false
    var body: some View { Group { if loading && payload == nil { ProgressView("Loading invoice") } else if let payload { content(payload) } else { VStack(spacing: 10) { Image(systemName: "doc.plaintext").font(.largeTitle).foregroundStyle(.secondary); Text("Invoice unavailable").font(.headline); Text(error ?? "Try again.").foregroundStyle(.secondary) }.padding() } }
        .background(AngelTreeTheme.canvas).navigationTitle("Invoice").navigationBarTitleDisplayMode(.inline).task { await load(cached: true) }
        .sheet(isPresented: $showPayment, onDismiss: { Task { await loadPending() } }) { if let payload { NavigationStack { ManualPaymentView(invoice: payload.invoice, userID: access.userID, fieldService: fieldService) { updated in self.payload = updated; showPayment = false } } } }
    }
    private func content(_ payload: MobileInvoicePayload) -> some View { let invoice = payload.invoice; return List {
        if let receipt = payload.manualPayment, let id = receipt.paymentId { Section { Label("Payment confirmed", systemImage: "checkmark.circle"); DisclosureGroup("Payment reference") { Text(id).font(.caption).textSelection(.enabled) } } }
        if stale { Section { Label("Showing saved invoice details", systemImage: "icloud.slash").foregroundStyle(AngelTreeTheme.warning) } }
        Section { LabeledContent("Invoice", value: invoice.invoiceNumber.map { "#\($0)" } ?? "Draft"); LabeledContent("Status", value: title(invoice.status)); if let party = invoice.party { NavigationLink { CustomerDetailView(reference: .init(id: party.id, kind: party.kind, name: party.name, contactName: nil, email: nil, phone: nil, address: invoice.serviceLocation.fullAddress), access: access, fieldService: fieldService, photoService: photoService) } label: { LabeledContent("Contracting party", value: party.name) } }; LabeledContent("Service location", value: invoice.serviceLocation.fullAddress); LabeledContent("Customer payment", value: invoice.customerPayable ? "Available" : "Not available"); LabeledContent("Portal", value: invoice.portalStatus.capitalized) }
        Section("Invoice lines") { ForEach(invoice.lines) { line in VStack(alignment: .leading, spacing: 6) { HStack(alignment: .firstTextBaseline) { Text(line.name).font(.headline); Spacer(); Text(money(line.totalCents)).font(.headline).foregroundStyle(AngelTreeTheme.forest) }; if let description = line.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }; if line.quantity != 1 { Text("\(line.quantity.formatted()) × \(money(line.unitPriceCents)) each").font(.caption).foregroundStyle(.secondary) } }.padding(.vertical, 5) }; LabeledContent("Total", value: money(invoice.totalCents)); LabeledContent("Balance due") { Text(money(invoice.balanceDueCents)).font(.title3.bold()).foregroundStyle(AngelTreeTheme.forest) } }
        Section("Dates") { LabeledContent("Created", value: date(invoice.createdAt)); if let sent = invoice.sentAt { LabeledContent("Sent", value: date(sent)) }; if let due = invoice.dueAt { LabeledContent("Due", value: date(due)) }; if let paid = invoice.paidAt { LabeledContent("Paid", value: date(paid)) } }
        Section("Payments") { if invoice.payments.isEmpty { Text("No recorded payments.").foregroundStyle(.secondary) } else { ForEach(invoice.payments) { payment in VStack(alignment: .leading, spacing: 4) { HStack { Text(money(payment.amountCents)).font(.headline); Spacer(); Text(title(payment.status)).font(.caption) }; Text("\(title(payment.method ?? payment.source)) · \(payment.paidAt.map(date) ?? "Date unavailable")").font(.subheadline).foregroundStyle(.secondary); if let reference = payment.reference { Text("Reference: \(reference)").font(.caption).foregroundStyle(.secondary) } }.padding(.vertical, 4) } } }
        if !invoice.activity.isEmpty { Section("Recent activity") { ForEach(invoice.activity.prefix(8)) { event in LabeledContent(title(event.eventType), value: date(event.createdAt)) } } }
        Section("Actions") { if access.canRecordManualPayments && payload.canRecordPayments && payload.manualPaymentRequestVersion == 1 && (invoice.canRecordManualPayment || hasPendingPayment) { Button { showPayment = true } label: { Label(hasPendingPayment ? "Check saved payment" : "Record manual payment", systemImage: "banknote") } }; if let job = invoice.linkedJobId { NavigationLink { JobDetailView(jobID: job, summary: nil, scheduleItem: nil, access: access, fieldService: fieldService, photoService: photoService) } label: { Label("Open linked job", systemImage: "leaf") } }; if let quote = invoice.linkedQuoteId { NavigationLink { ProposalDetailView(quoteID: quote, access: access, fieldService: fieldService, photoService: photoService) } label: { Label("Open linked proposal", systemImage: "doc.text") } }; if invoice.reminderEligible { Label("Payment reminder available in the full CRM", systemImage: "bell") .foregroundStyle(.secondary) } }
        if let error { Section { Text(error).foregroundStyle(.red) } }
    }.scrollContentBackground(.hidden) }
    private func loadPending() async { hasPendingPayment = (try? await ManualPaymentAttemptStore().read(userID: access.userID, invoiceID: invoiceID)) != nil }
    private func load(cached: Bool) async { await loadPending(); loading = true; do { let result = try await fieldService.invoiceDetail(id: invoiceID, userID: access.userID, allowCached: cached); payload = result.payload; stale = result.cached; error = nil; if result.cached { await load(cached: false) } } catch { self.error = (error as? LocalizedError)?.errorDescription ?? "Try again." }; loading = false }
    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }; private func date(_ value: String) -> String { CRMDateParser.date(from: value).map(BusinessCalendar.dayHeading) ?? value }; private func title(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
}

private struct ManualPaymentView: View {
    let invoice: MobileInvoiceDetail; let userID: String
    let fieldService: any FieldDataService; let onSaved: (MobileInvoicePayload) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var amount = ""; @State private var method = "check"; @State private var received = Date()
    @State private var reference = ""; @State private var notes = ""; @State private var saving = false
    @State private var error: String?; @State private var ready = false
    @State private var attempt: MobileManualPaymentRequest?
    private let attempts = ManualPaymentAttemptStore()
    var body: some View {
        Form {
            if attempt != nil { Section { Text("A saved payment needs confirmation. Retry its original details, or check it before changing them.") } }
            Section {
                LabeledContent("Remaining balance", value: money(invoice.balanceDueCents))
                Group {
                    TextField("Payment amount", text: $amount).keyboardType(.decimalPad)
                    Picker("Method", selection: $method) { Text("Check").tag("check"); Text("Cash").tag("cash"); Text("ACH").tag("ach"); Text("Other").tag("other") }
                    DatePicker("Received", selection: $received, displayedComponents: .date)
                    TextField("Reference or check number", text: $reference)
                    TextField("Internal note", text: $notes, axis: .vertical).lineLimit(2...5)
                }.disabled(attempt != nil || saving || !ready)
            }
            if attempt != nil { Section { Button("Check before changing details") { Task { await resolve() } }.disabled(saving || !ready) } }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle("Record Payment").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) { Button(saving ? "Checking…" : attempt == nil ? "Record" : "Retry") { Task { await save() } }.disabled(saving || !ready) }
        }
        .task {
            do {
                attempt = try await attempts.read(userID: userID, invoiceID: invoice.id)
                if let attempt { amount = String(format: "%.2f", Double(attempt.amountCents) / 100); method = attempt.method; received = CRMDateParser.date(from: attempt.receivedAt) ?? Date(); reference = attempt.reference ?? ""; notes = attempt.notes ?? "" }
                ready = true
            } catch { self.error = "Saved payment details could not be read. Review the invoice in the CRM before recording another payment." }
        }
        .interactiveDismissDisabled(saving)
    }
    private func save() async {
        guard !saving && ready else { return }
        saving = true; defer { saving = false }
        do {
            let request: MobileManualPaymentRequest
            if let attempt { request = attempt }
            else {
                guard let decimal = Decimal(string: amount), decimal > 0 else { error = "Enter a valid amount."; return }
                let number = NSDecimalNumber(decimal: decimal * 100)
                let rounded = number.rounding(accordingToBehavior: NSDecimalNumberHandler(roundingMode: .plain, scale: 0, raiseOnExactness: false, raiseOnOverflow: false, raiseOnUnderflow: false, raiseOnDivideByZero: false))
                guard number == rounded, rounded.compare(NSDecimalNumber(value: 2147483647)) != .orderedDescending else { error = "Enter an amount with no more than two decimal places."; return }
                let cents = rounded.intValue
                guard cents <= invoice.balanceDueCents else { error = "Payment cannot exceed the remaining balance."; return }
                request = .init(requestId: UUID().uuidString, amountCents: cents, method: method, receivedAt: ISO8601DateFormatter().string(from: received), reference: reference.isEmpty ? nil : reference, notes: notes.isEmpty ? nil : notes)
                try await attempts.save(request, userID: userID, invoiceID: invoice.id)
                attempt = request
            }
            let result = try await fieldService.recordManualPayment(invoiceID: invoice.id, input: request)
            guard result.manualPayment?.requestId == request.requestId, result.manualPayment?.state == "recorded", result.manualPayment?.paymentId != nil else { error = "Keep this saved attempt. The payment result could not be confirmed."; return }
            try await attempts.clear(userID: userID, invoiceID: invoice.id)
            onSaved(result)
        } catch { self.error = "Payment could not be confirmed. Retry this saved attempt or check it before changing details." }
    }
    private func resolve() async {
        guard !saving, let attempt else { return }
        saving = true; defer { saving = false }
        do {
            let result = try await fieldService.resolveManualPayment(invoiceID: invoice.id, requestID: attempt.requestId)
            guard let receipt = result.manualPayment, receipt.requestId == attempt.requestId, ["recorded", "abandoned"].contains(receipt.state), receipt.state != "recorded" || receipt.paymentId != nil else { error = "The saved payment could not be checked. Keep this attempt and try again."; return }
            try await attempts.clear(userID: userID, invoiceID: invoice.id)
            if receipt.state == "recorded" { onSaved(result) }
            else { self.attempt = nil; error = "Nothing was recorded. You can change the details." }
        } catch { self.error = "The saved payment could not be checked. Keep this attempt and try again." }
    }
    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
}
