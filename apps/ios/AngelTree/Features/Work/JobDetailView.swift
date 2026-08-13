import SwiftUI

struct JobDetailView: View {
    let jobID: String
    let summary: MobilePartyWorkSummary?
    let scheduleItem: MobileScheduleItem?
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @State private var detail: MobileJobDetail?
    @State private var isLoading = true
    @State private var isShowingSavedData = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let detail {
                List {
                    header(detail)
                    quickActions(detail)
                    scheduleSection(detail)
                    partySection(detail)
                    locationSection(detail)
                    scopeSection(detail)
                    crewSection(detail)
                    requirementsSection(detail)
                    JobPhotosSection(jobID: jobID, photoService: photoService)
                }
                .refreshable { await load(force: true) }
            } else if isLoading {
                ProgressView("Loading work order")
                    .controlSize(.large)
            } else {
                FieldUnavailableView(
                    title: "Couldn't load this job",
                    systemImage: "briefcase.fill.badge.exclamationmark",
                    detail: errorMessage ?? "This job may no longer be assigned to you."
                )
            }
        }
        .background(AngelTreeTheme.canvas)
        .navigationTitle("Work details")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            if isShowingSavedData {
                Text("Showing saved job details. Pull to refresh.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.warning)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(AngelTreeTheme.canvas)
            }
        }
        .task { await load() }
    }

    private func header(_ detail: MobileJobDetail) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(detail.contractingParty?.name ?? scheduleItem?.operationalTitle ?? summary?.title ?? "Work order")
                    .font(.title2.bold())
                    .foregroundStyle(AngelTreeTheme.charcoal)
                HStack {
                    Label(serviceTitle(detail), systemImage: "leaf.fill").font(.headline)
                    Spacer()
                    StatusBadge(status: detail.status, label: statusTitle(detail.status))
                }
                if let item = scheduleItem, let workdayLabel = item.workdayLabel {
                    Text(workdayLabel).font(.subheadline.weight(.semibold)).foregroundStyle(AngelTreeTheme.forest)
                }
            }
            .padding(.vertical, 6)
        }
    }

    private func quickActions(_ detail: MobileJobDetail) -> some View {
        Section("Quick actions") {
            WorkQuickActions(address: detail.serviceLocation?.fullAddress, phone: detail.contractingParty?.phone)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
        }
    }

    private func scheduleSection(_ detail: MobileJobDetail) -> some View {
        Section("Schedule") {
            if let item = scheduleItem {
                DetailRow(label: "Time", value: BusinessCalendar.timeRange(for: item), systemImage: "clock.fill")
                DetailRow(label: "Date", value: item.startsAtDate.map(BusinessCalendar.dayHeading) ?? "Date unavailable", systemImage: "calendar")
            } else if let start = detail.scheduledStartAt.flatMap(CRMDateParser.date(from:)) {
                DetailRow(label: "Scheduled", value: start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
            }
            if !detail.assignedEmployees.isEmpty {
                DetailRow(label: "Assigned crew", value: detail.assignedEmployees.map(\.name).joined(separator: ", "), systemImage: "person.2.fill")
            }
            if detail.workSessions.count > 1 {
                ForEach(Array(detail.workSessions.enumerated()), id: \.element.id) { index, session in
                    if let date = CRMDateParser.date(from: session.startsAt) {
                        DetailRow(
                            label: "Workday \(index + 1) of \(detail.workSessions.count)",
                            value: date.formatted(date: .abbreviated, time: .shortened),
                            systemImage: "calendar.badge.clock"
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func partySection(_ detail: MobileJobDetail) -> some View {
        if let party = detail.contractingParty {
            Section(party.kind.label) {
                NavigationLink {
                    CustomerDetailView(
                        reference: .init(
                            id: party.id,
                            kind: party.kind,
                            name: party.name,
                            contactName: nil,
                            email: party.email,
                            phone: party.phone,
                            address: detail.serviceLocation?.fullAddress
                        ),
                        access: access,
                        fieldService: fieldService,
                        photoService: photoService
                    )
                } label: {
                    DetailRow(label: "Open record", value: party.name, systemImage: party.kind == .organization ? "building.2.fill" : "person.fill")
                }
                if let phone = party.phone { DetailRow(label: "Phone", value: phone, systemImage: "phone.fill") }
                if let email = party.email { DetailRow(label: "Email", value: email, systemImage: "envelope.fill") }
            }
        }
    }

    @ViewBuilder
    private func locationSection(_ detail: MobileJobDetail) -> some View {
        if let location = detail.serviceLocation {
            Section("Service location") {
                DetailRow(label: location.label ?? "Address", value: location.fullAddress, systemImage: "mappin.and.ellipse")
                if let accessNotes = location.accessNotes { DetailTextBlock(title: "Access instructions", text: accessNotes) }
                if let gateCode = location.gateCode { DetailTextBlock(title: "Gate code", text: gateCode) }
                if let serviceNotes = location.serviceNotes { DetailTextBlock(title: "Service notes", text: serviceNotes) }
            }
        }
    }

    @ViewBuilder
    private func scopeSection(_ detail: MobileJobDetail) -> some View {
        if let scope = detail.scope ?? scheduleItem?.customerFacingScope ?? summary?.scope {
            Section("Work scope") {
                Text(scope).font(.body).textSelection(.enabled)
            }
        }
        if !detail.crewVisibleNotes.isEmpty {
            Section("Crew notes") {
                ForEach(detail.crewVisibleNotes) { note in
                    Label {
                        Text(note.body).foregroundStyle(AngelTreeTheme.charcoal)
                    } icon: {
                        Image(systemName: "lock.fill").foregroundStyle(AngelTreeTheme.forest)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func crewSection(_ detail: MobileJobDetail) -> some View {
        if let item = scheduleItem, let notes = item.teamNotes, detail.crewVisibleNotes.allSatisfy({ $0.body != notes }) {
            Section("Schedule notes") { DetailTextBlock(title: "Internal team information", text: notes) }
        }
    }

    @ViewBuilder
    private func requirementsSection(_ detail: MobileJobDetail) -> some View {
        let equipment = detail.equipment.isEmpty ? scheduleItem?.equipment ?? [] : detail.equipment
        let materials = detail.materials.isEmpty ? scheduleItem?.materials ?? [] : detail.materials
        if !equipment.isEmpty {
            Section("Equipment") {
                ForEach(equipment, id: \.self) { Label($0, systemImage: "wrench.and.screwdriver.fill") }
            }
        }
        if !materials.isEmpty {
            Section("Materials") {
                ForEach(materials, id: \.self) { Label($0, systemImage: "shippingbox.fill") }
            }
        }
    }

    private func load(force: Bool = false) async {
        isLoading = detail == nil
        errorMessage = nil
        do {
            let result = try await fieldService.jobDetail(
                id: jobID,
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
                    ?? "This job is no longer available to your account."
            } else {
                isShowingSavedData = true
            }
        }
    }

    private func serviceTitle(_ detail: MobileJobDetail) -> String {
        detail.serviceType?.replacingOccurrences(of: "_", with: " ").capitalized ?? summary?.title ?? "Tree service"
    }

    private func statusTitle(_ status: String) -> String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
