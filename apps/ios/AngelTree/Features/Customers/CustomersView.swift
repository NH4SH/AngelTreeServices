import SwiftUI

struct CustomersView: View {
    let access: AppAccess
    @ObservedObject var previewStore: ScheduleStore
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @State private var searchText = ""
    @State private var results: [MobilePartySearchResult] = []
    @State private var recentParties: [MobilePartySearchResult] = []
    @State private var isSearching = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if hasSearchQuery && isSearching {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Searching customers and organizations")
                                .foregroundStyle(.secondary)
                        }
                        .frame(minHeight: 44)
                    }
                } else if hasSearchQuery, let errorMessage {
                    Section {
                        FieldUnavailableView(
                            title: "Couldn't search customers",
                            systemImage: "wifi.exclamationmark",
                            detail: errorMessage
                        )
                    }
                } else if hasSearchQuery && normalizedQuery.count < 2 {
                    Section {
                        Text("Enter at least 2 characters to search.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 8)
                    }
                } else if hasSearchQuery && results.isEmpty {
                    Section {
                        FieldUnavailableView(
                            title: "No matching customers",
                            systemImage: "magnifyingglass",
                            detail: "Try a different name, phone number, or address."
                        )
                    }
                } else if hasSearchQuery {
                    Section("Results") {
                        ForEach(results) { result in
                            NavigationLink {
                                CustomerDetailView(
                                    reference: result,
                                    access: access,
                                    fieldService: fieldService,
                                    photoService: photoService
                                )
                            } label: {
                                PartySearchRow(result: result)
                            }
                        }
                    }
                } else {
                    defaultContent
                }
            }
            .scrollContentBackground(.hidden)
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Customers")
            .searchable(text: $searchText, prompt: "Name, phone, or address")
            .autocorrectionDisabled()
            .textInputAutocapitalization(.words)
            .task(id: searchText) { await search() }
            .task(id: access.userID) { await loadPreviews() }
            .onAppear {
                Task { recentParties = await fieldService.recentParties(userID: access.userID) }
            }
            .refreshable {
                if hasSearchQuery {
                    await search(immediate: true)
                } else {
                    await loadPreviews(force: true)
                }
            }
        }
    }

    @ViewBuilder
    private var defaultContent: some View {
        let upcoming = CustomerPreviewPresentation.upcoming(from: previewStore.items)
        let upcomingIDs = Set(upcoming.map(\.partyKey))
        let recent = recentParties.filter { !upcomingIDs.contains($0.partyKey) }

        if !upcoming.isEmpty {
            Section("Upcoming") {
                ForEach(upcoming) { item in
                    partyLink(item.reference, context: item.context)
                }
            }
        }

        if !recent.isEmpty {
            Section("Recently Viewed") {
                ForEach(recent) { result in
                    partyLink(result)
                }
            }
        }

        if upcoming.isEmpty && recent.isEmpty {
            Section {
                if previewStore.isLoading {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Loading customers")
                            .foregroundStyle(.secondary)
                    }
                    .frame(minHeight: 44)
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("No customers to show yet.")
                            .font(.headline)
                        Text("Search by name, phone, or address.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }
            }
        }
    }

    private var normalizedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasSearchQuery: Bool { !normalizedQuery.isEmpty }

    private func partyLink(_ result: MobilePartySearchResult, context: String? = nil) -> some View {
        NavigationLink {
            CustomerDetailView(
                reference: result,
                access: access,
                fieldService: fieldService,
                photoService: photoService
            )
        } label: {
            PartySearchRow(result: result, context: context)
        }
    }

    private func loadPreviews(force: Bool = false) async {
        async let recent = fieldService.recentParties(userID: access.userID)
        let start = Date()
        let end = BusinessCalendar.addingDays(6, to: start)
        await previewStore.load(
            startDate: BusinessCalendar.dateKey(for: start),
            endDate: BusinessCalendar.dateKey(for: end),
            scope: CustomerPreviewPresentation.scheduleScope,
            force: force
        )
        recentParties = await recent
    }

    private func search(immediate: Bool = false) async {
        let query = normalizedQuery
        guard query.count >= 2 else {
            results = []
            errorMessage = nil
            isSearching = false
            return
        }

        do {
            if !immediate { try await Task.sleep(for: .milliseconds(350)) }
            guard !Task.isCancelled else { return }
            isSearching = true
            errorMessage = nil
            results = try await fieldService.searchParties(query: query)
        } catch is CancellationError {
            return
        } catch {
            results = []
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Check your connection and try again."
        }
        isSearching = false
    }
}

private struct PartySearchRow: View {
    let result: MobilePartySearchResult
    var context: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(result.name)
                    .font(.headline)
                    .foregroundStyle(AngelTreeTheme.charcoal)
                Spacer(minLength: 8)
                Text(result.kind.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.forest)
            }
            if let contactName = result.contactName, contactName != result.name {
                Text(contactName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let context {
                Label(context, systemImage: "calendar")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AngelTreeTheme.forest)
                    .lineLimit(2)
            }
            if let address = result.address {
                Label(address, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            } else if let phone = result.phone {
                Label(phone, systemImage: "phone")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}

struct CustomerPreviewItem: Equatable, Identifiable {
    let reference: MobilePartySearchResult
    let context: String

    var id: String { reference.partyKey }
    var partyKey: String { reference.partyKey }
}

enum CustomerPreviewPresentation {
    static let scheduleScope: ScheduleScope = .mine

    static func showsDefaultContent(for query: String) -> Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func upcoming(
        from items: [MobileScheduleItem],
        now: Date = Date(),
        limit: Int = 8
    ) -> [CustomerPreviewItem] {
        let blockedStatuses = Set(["cancelled", "canceled", "completed", "void", "voided"])
        var seen = Set<String>()

        return items
            .filter { item in
                guard !blockedStatuses.contains(item.status.lowercased()),
                      let start = item.startsAtDate else { return false }
                return (item.endsAtDate ?? start) >= now
            }
            .sorted { ($0.startsAtDate ?? .distantFuture) < ($1.startsAtDate ?? .distantFuture) }
            .compactMap { item -> CustomerPreviewItem? in
                guard let party = item.party,
                      let id = party.id?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !id.isEmpty else { return nil }
                let kind: MobilePartyKind = party.kind == .organization ? .organization : .customer
                let reference = MobilePartySearchResult(
                    id: id,
                    kind: kind,
                    name: party.name,
                    contactName: nil,
                    email: party.email,
                    phone: party.phone,
                    address: item.location?.fullAddress
                )
                guard seen.insert(reference.partyKey).inserted else { return nil }
                return CustomerPreviewItem(
                    reference: reference,
                    context: "\(item.typeLabel) · \(scheduleLabel(item.startsAtDate, now: now))"
                )
            }
            .prefix(limit)
            .map { $0 }
    }

    private static func scheduleLabel(_ date: Date?, now: Date) -> String {
        guard let date else { return "Upcoming" }
        if BusinessCalendar.calendar.isDate(date, inSameDayAs: now) {
            return "Today at \(BusinessCalendar.time(date))"
        }
        let formatter = DateFormatter()
        formatter.calendar = BusinessCalendar.calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = BusinessCalendar.timeZone
        formatter.dateFormat = "MMM d 'at' h:mm a"
        return formatter.string(from: date)
    }
}

extension MobilePartySearchResult {
    var partyKey: String { "\(kind.rawValue):\(id)" }
}
