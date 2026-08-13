import SwiftUI

struct CustomersView: View {
    @ObservedObject var todayStore: ScheduleStore
    @ObservedObject var scheduleStore: ScheduleStore
    @State private var searchText = ""

    private var scheduledParties: [ScheduledParty] {
        let items = todayStore.items + scheduleStore.items
        var parties: [String: ScheduledParty] = [:]

        for item in items {
            guard let party = item.party else { continue }
            let key = "\(party.kind.rawValue)-\(party.id ?? party.name.lowercased())"
            let candidate = ScheduledParty(party: party, item: item)
            if let existing = parties[key] {
                let existingDate = existing.nextWorkAt ?? .distantFuture
                let candidateDate = candidate.nextWorkAt ?? .distantFuture
                if candidateDate < existingDate {
                    parties[key] = candidate
                }
            } else {
                parties[key] = candidate
            }
        }

        return parties.values
            .filter { searchText.isEmpty || $0.name.localizedCaseInsensitiveContains(searchText) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            List {
                if scheduledParties.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "person.2")
                            .font(.system(size: 34))
                            .foregroundStyle(AngelTreeTheme.forest)
                        Text(searchText.isEmpty ? "No scheduled customers loaded" : "No matching customers")
                            .font(.headline)
                        Text("Customers from Today and Schedule appear here for quick field access.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 42)
                    .listRowBackground(Color.clear)
                } else {
                    Section("From your schedule") {
                        ForEach(scheduledParties) { party in
                            NavigationLink(value: party) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(party.name)
                                        .font(.headline)
                                    if let address = party.address {
                                        Label(address, systemImage: "mappin.and.ellipse")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                    if let nextWorkAt = party.nextWorkAt {
                                        Text("Scheduled \(nextWorkAt.formatted(date: .abbreviated, time: .shortened))")
                                            .font(.caption.weight(.medium))
                                            .foregroundStyle(AngelTreeTheme.forest)
                                    }
                                }
                                .padding(.vertical, 5)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Customers")
            .searchable(text: $searchText, prompt: "Search scheduled customers")
            .navigationDestination(for: ScheduledParty.self) { party in
                ScheduledPartyView(party: party)
            }
        }
    }
}

private struct ScheduledParty: Hashable, Identifiable {
    let id: String
    let name: String
    let kind: MobileScheduleItem.Party.Kind
    let phone: String?
    let email: String?
    let address: String?
    let nextWorkAt: Date?

    init(party: MobileScheduleItem.Party, item: MobileScheduleItem) {
        id = "\(party.kind.rawValue)-\(party.id ?? party.name.lowercased())"
        name = party.name
        kind = party.kind
        phone = party.phone
        email = party.email
        address = item.location?.fullAddress
        nextWorkAt = item.startsAtDate
    }
}

private struct ScheduledPartyView: View {
    let party: ScheduledParty

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(party.name)
                        .font(.title2.bold())
                    Text(party.kind == .organization ? "Organization" : "Customer")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AngelTreeTheme.forest)
                }
                .padding(.vertical, 6)
            }

            Section("Quick actions") {
                WorkQuickActions(address: party.address, phone: party.phone)
            }

            Section("Contact") {
                if let phone = party.phone {
                    Label(phone, systemImage: "phone.fill")
                }
                if let email = party.email {
                    Label(email, systemImage: "envelope.fill")
                }
                if let address = party.address {
                    Label(address, systemImage: "mappin.and.ellipse")
                }
            }
        }
        .navigationTitle(party.kind == .organization ? "Organization" : "Customer")
        .navigationBarTitleDisplayMode(.inline)
    }
}
