import SwiftUI

struct WorkDetailView: View {
    let item: MobileScheduleItem

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(item.operationalTitle)
                        .font(.title2.bold())
                        .foregroundStyle(AngelTreeTheme.charcoal)
                    HStack {
                        Label(item.typeLabel, systemImage: "leaf.fill")
                            .font(.headline)
                        Spacer()
                        StatusBadge(status: item.status, label: item.statusLabel)
                    }
                    if let workdayLabel = item.workdayLabel {
                        Text(workdayLabel)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AngelTreeTheme.forest)
                    }
                }
                .padding(.vertical, 6)
            }

            Section("Quick actions") {
                WorkQuickActions(
                    address: item.location?.fullAddress,
                    phone: item.party?.phone
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            }

            Section("Schedule") {
                DetailRow(
                    label: "Time",
                    value: BusinessCalendar.timeRange(for: item),
                    systemImage: "clock.fill"
                )
                DetailRow(
                    label: "Date",
                    value: item.startsAtDate.map(BusinessCalendar.dayHeading) ?? "Date unavailable",
                    systemImage: "calendar"
                )
                if !item.assignees.isEmpty {
                    DetailRow(
                        label: "Assigned",
                        value: item.assignees.map(\.name).joined(separator: ", "),
                        systemImage: "person.2.fill"
                    )
                }
            }

            if let party = item.party {
                Section(party.kind == .organization ? "Organization" : "Customer") {
                    DetailRow(label: "Name", value: party.name, systemImage: "person.fill")
                    if let phone = party.phone {
                        DetailRow(label: "Phone", value: phone, systemImage: "phone.fill")
                    }
                    if let email = party.email {
                        DetailRow(label: "Email", value: email, systemImage: "envelope.fill")
                    }
                }
            }

            if let location = item.location {
                Section("Service location") {
                    if let address = location.fullAddress {
                        DetailRow(label: "Address", value: address, systemImage: "mappin.and.ellipse")
                    }
                    if let accessNotes = location.accessNotes {
                        DetailTextBlock(title: "Access instructions", text: accessNotes)
                    }
                    if let serviceNotes = location.serviceNotes {
                        DetailTextBlock(title: "Service notes", text: serviceNotes)
                    }
                }
            }

            if let scope = item.customerFacingScope {
                Section("Work scope") {
                    Text(scope)
                        .font(.body)
                        .textSelection(.enabled)
                }
            }

            if let notes = item.teamNotes {
                Section("Team notes") {
                    Label {
                        Text(notes)
                            .foregroundStyle(AngelTreeTheme.charcoal)
                    } icon: {
                        Image(systemName: "lock.fill")
                            .foregroundStyle(AngelTreeTheme.forest)
                    }
                    .accessibilityLabel("Internal team notes: \(notes)")
                }
            }

            if !item.equipment.isEmpty {
                Section("Equipment") {
                    ForEach(item.equipment, id: \.self) { value in
                        Label(value, systemImage: "wrench.and.screwdriver.fill")
                    }
                }
            }

            if !item.materials.isEmpty {
                Section("Materials") {
                    ForEach(item.materials, id: \.self) { value in
                        Label(value, systemImage: "shippingbox.fill")
                    }
                }
            }
        }
        .navigationTitle("Work details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DetailRow: View {
    let label: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(AngelTreeTheme.forest)
                .frame(width: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.body)
                    .textSelection(.enabled)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct DetailTextBlock: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(text)
                .font(.body)
                .textSelection(.enabled)
        }
    }
}
