import SwiftUI

struct CustomerDetailView: View {
    let reference: MobilePartySearchResult
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @State private var detail: MobilePartyDetail?
    @State private var isLoading = true
    @State private var isShowingSavedData = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let detail {
                List {
                    identitySection(detail)
                    Section("Quick actions") {
                        ContactQuickActions(email: detail.email, phone: detail.phone)
                    }
                    contactSection(detail)
                    locationSection(detail)
                    workSection(detail)
                    officeRecordsSection(detail)
                }
                .refreshable { await load(force: true) }
            } else if isLoading {
                ProgressView("Loading \(reference.kind.label.lowercased())")
                    .controlSize(.large)
            } else {
                FieldUnavailableView(
                    title: "Couldn't load this \(reference.kind.label.lowercased())",
                    systemImage: "person.crop.circle.badge.exclamationmark",
                    detail: errorMessage ?? "Pull to try again."
                )
            }
        }
        .background(AngelTreeTheme.canvas)
        .navigationTitle(reference.kind.label)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            if isShowingSavedData {
                Text("Showing saved details. Pull to refresh.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.warning)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(AngelTreeTheme.canvas)
            }
        }
        .task { await load() }
    }

    private func identitySection(_ detail: MobilePartyDetail) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 7) {
                Text(detail.name)
                    .font(.title2.bold())
                    .foregroundStyle(AngelTreeTheme.charcoal)
                if let contact = detail.contactName, contact != detail.name {
                    Text(contact)
                        .font(.headline)
                }
                Text(detail.status.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.forest)
            }
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder
    private func contactSection(_ detail: MobilePartyDetail) -> some View {
        if detail.email != nil || detail.phone != nil || !detail.contacts.isEmpty {
            Section("Contact") {
                if let phone = detail.phone { Label(phone, systemImage: "phone.fill") }
                if let email = detail.email { Label(email, systemImage: "envelope.fill") }
                ForEach(detail.contacts) { contact in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(contact.name).font(.headline)
                        if let role = contact.role { Text(role).font(.subheadline).foregroundStyle(.secondary) }
                        ContactQuickActions(email: contact.email, phone: contact.phone)
                    }
                    .padding(.vertical, 5)
                }
            }
        }
    }

    private func locationSection(_ detail: MobilePartyDetail) -> some View {
        Section("Service locations") {
            if detail.serviceLocations.isEmpty {
                Text("No service locations are available.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(detail.serviceLocations) { location in
                    NavigationLink {
                        ServiceLocationDetailView(
                            location: location,
                            party: detail,
                            access: access,
                            fieldService: fieldService,
                            photoService: photoService
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(location.label ?? "Service location").font(.headline)
                            Text(location.fullAddress).font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 5)
                    }
                }
            }
        }
    }

    private func workSection(_ detail: MobilePartyDetail) -> some View {
        let upcoming = detail.jobs.filter { ($0.scheduledStartDate ?? .distantPast) >= Calendar.current.startOfDay(for: Date()) }
        let recent = detail.jobs.filter { !upcoming.contains($0) }
        return Section("Work") {
            if detail.jobs.isEmpty {
                Text("No accessible work history is available.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(upcoming + recent.prefix(10)) { job in
                    NavigationLink {
                        JobDetailView(
                            jobID: job.id,
                            summary: job,
                            scheduleItem: nil,
                            access: access,
                            fieldService: fieldService,
                            photoService: photoService
                        )
                    } label: {
                        JobSummaryRow(job: job)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func officeRecordsSection(_ detail: MobilePartyDetail) -> some View {
        if !detail.proposals.isEmpty {
            Section("Active proposals") {
                ForEach(detail.proposals) { record in
                    if access.canManageProposals {
                        NavigationLink {
                            ProposalDetailView(
                                quoteID: record.id,
                                access: access,
                                fieldService: fieldService,
                                photoService: photoService
                            )
                        } label: {
                            RecordSummaryRow(prefix: "Proposal", record: record)
                        }
                    } else {
                        RecordSummaryRow(prefix: "Proposal", record: record)
                    }
                }
            }
        }
        if !detail.invoices.isEmpty {
            Section("Recent invoices") {
                ForEach(detail.invoices) { record in
                    if access.canViewInvoices {
                        NavigationLink {
                            InvoiceDetailView(
                                invoiceID: record.id,
                                access: access,
                                fieldService: fieldService,
                                photoService: photoService
                            )
                        } label: {
                            RecordSummaryRow(prefix: "Invoice", record: record)
                        }
                    } else {
                        RecordSummaryRow(prefix: "Invoice", record: record)
                    }
                }
            }
        }
    }

    private func load(force: Bool = false) async {
        isLoading = detail == nil
        errorMessage = nil
        do {
            let result = try await fieldService.partyDetail(
                kind: reference.kind,
                id: reference.id,
                userID: access.userID,
                allowCached: !force
            )
            detail = result.detail
            isShowingSavedData = result.cached
            isLoading = false
            if result.cached && !force { await load(force: true) }
        } catch {
            isLoading = false
            if detail == nil {
                errorMessage = (error as? LocalizedError)?.errorDescription
                    ?? "Check your connection and try again."
            } else {
                isShowingSavedData = true
            }
        }
    }
}

struct JobSummaryRow: View {
    let job: MobilePartyWorkSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(job.title).font(.headline)
                Spacer()
                StatusBadge(status: job.status, label: job.status.replacingOccurrences(of: "_", with: " ").capitalized)
            }
            if let date = job.scheduledStartDate {
                Label(date.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let scope = job.scope {
                Text(scope).font(.subheadline).lineLimit(2)
            }
        }
        .padding(.vertical, 5)
    }
}

private struct RecordSummaryRow: View {
    let prefix: String
    let record: MobileRecordSummary

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(record.number.map { "\(prefix) \($0)" } ?? prefix).font(.headline)
                if let date = record.date.flatMap(CRMDateParser.date(from:)) {
                    Text(date.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(record.status.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AngelTreeTheme.forest)
        }
    }
}

private struct ContactQuickActions: View {
    let email: String?
    let phone: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                actions
            }

            VStack(spacing: 8) {
                actions
            }
        }
    }

    @ViewBuilder
    private var actions: some View {
        action("Call", "phone.fill", SystemActions.phoneURL(phone))
        action("Text", "message.fill", SystemActions.messageURL(phone))
        action("Email", "envelope.fill", SystemActions.emailURL(email))
    }

    private func action(_ label: String, _ image: String, _ url: URL?) -> some View {
        Button { if let url { openURL(url) } } label: {
            Label(label, systemImage: image).frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(url == nil)
    }
}
