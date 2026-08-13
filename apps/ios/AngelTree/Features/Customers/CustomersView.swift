import SwiftUI

struct CustomersView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @StateObject private var store: CustomerDirectoryStore
    @State private var path: [MobilePartySearchResult] = []
    @State private var searchText = ""
    @State private var isShowingAddParty = false
    @State private var pendingCreatedParty: MobilePartySearchResult?

    init(
        access: AppAccess,
        fieldService: any FieldDataService,
        photoService: any JobPhotoService
    ) {
        self.access = access
        self.fieldService = fieldService
        self.photoService = photoService
        _store = StateObject(wrappedValue: CustomerDirectoryStore(service: fieldService))
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if hasSearchQuery {
                    searchContent
                } else {
                    directoryContent
                }
            }
            .scrollContentBackground(.hidden)
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Customers")
            .searchable(text: $searchText, prompt: "Name, phone, or address")
            .autocorrectionDisabled()
            .textInputAutocapitalization(.words)
            .toolbar {
                if access.canCreateParties {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            isShowingAddParty = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add customer or organization")
                    }
                }
            }
            .navigationDestination(for: MobilePartySearchResult.self) { result in
                CustomerDetailView(
                    reference: result,
                    access: access,
                    fieldService: fieldService,
                    photoService: photoService
                )
            }
            .task { await store.loadDirectory() }
            .task(id: searchText) { await updateSearch() }
            .refreshable {
                if hasSearchQuery {
                    await store.search(query: normalizedQuery)
                } else {
                    await store.loadDirectory(force: true)
                }
            }
            .sheet(isPresented: $isShowingAddParty) {
                AddPartyView(fieldService: fieldService) { party in
                    pendingCreatedParty = party
                    isShowingAddParty = false
                }
            }
            .onChange(of: isShowingAddParty) { isPresented in
                guard !isPresented, let party = pendingCreatedParty else { return }
                pendingCreatedParty = nil
                Task {
                    await store.loadDirectory(force: true)
                    path.append(party)
                }
            }
        }
    }

    @ViewBuilder
    private var directoryContent: some View {
        if store.isLoadingDirectory && store.directoryResults.isEmpty {
            Section {
                loadingRow("Loading customer directory")
            }
        } else if let error = store.directoryError, store.directoryResults.isEmpty {
            Section {
                retryView(message: error) { await store.loadDirectory(force: true) }
            }
        } else if store.directoryResults.isEmpty {
            Section {
                compactEmptyState(
                    title: "No customers to show yet.",
                    detail: access.canCreateParties
                        ? "Search by name, phone, or address, or add the first customer."
                        : "Search by name, phone, or address."
                )
            }
        } else {
            Section("Recent customers") {
                ForEach(store.directoryResults) { result in
                    partyLink(result)
                        .task { await store.loadMoreIfNeeded(current: result) }
                }
            }

            Section {
                if store.isLoadingMore {
                    loadingRow("Loading more")
                } else if let error = store.directoryError, store.hasMore {
                    Button("Try loading more") { Task { await store.loadNextPage() } }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityHint(error)
                } else if !store.hasMore {
                    Text("All available customers are loaded.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
            }
        }
    }

    @ViewBuilder
    private var searchContent: some View {
        if normalizedQuery.count < 2 {
            Section {
                Text("Enter at least 2 characters to search.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            }
        } else if store.isSearching {
            Section { loadingRow("Searching customers and organizations") }
        } else if let error = store.searchError {
            Section {
                retryView(message: error) { await store.search(query: normalizedQuery) }
            }
        } else if store.searchResults.isEmpty {
            Section {
                compactEmptyState(
                    title: "No matching customers",
                    detail: "Try a different name, phone number, or address."
                )
            }
        } else {
            Section("Results") {
                ForEach(store.searchResults) { partyLink($0) }
            }
        }
    }

    private var normalizedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasSearchQuery: Bool { !normalizedQuery.isEmpty }

    private func partyLink(_ result: MobilePartySearchResult) -> some View {
        NavigationLink(value: result) {
            PartyDirectoryRow(result: result)
        }
    }

    private func loadingRow(_ label: String) -> some View {
        HStack(spacing: 12) {
            ProgressView()
            Text(label).foregroundStyle(.secondary)
        }
        .frame(minHeight: 44)
    }

    private func compactEmptyState(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline)
            Text(detail).font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }

    private func retryView(message: String, action: @escaping () async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message).font(.subheadline).foregroundStyle(.secondary)
            Button("Try again") { Task { await action() } }
                .buttonStyle(.bordered)
        }
        .padding(.vertical, 6)
    }

    private func updateSearch() async {
        let query = normalizedQuery
        guard query.count >= 2 else {
            store.clearSearch()
            return
        }
        do {
            try await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await store.search(query: query)
        } catch is CancellationError {
            return
        } catch {
            return
        }
    }
}

private struct PartyDirectoryRow: View {
    let result: MobilePartySearchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
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
                Text(contactName).font(.subheadline).foregroundStyle(.secondary)
            }
            if let address = result.address {
                Label(address, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let phone = result.phone {
                Label(phone, systemImage: "phone")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 5)
    }
}
