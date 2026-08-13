import SwiftUI

struct CustomersView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @State private var searchText = ""
    @State private var results: [MobilePartySearchResult] = []
    @State private var isSearching = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if isSearching {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Searching customers and organizations")
                                .foregroundStyle(.secondary)
                        }
                        .frame(minHeight: 44)
                    }
                } else if let errorMessage {
                    Section {
                        FieldUnavailableView(
                            title: "Couldn't search customers",
                            systemImage: "wifi.exclamationmark",
                            detail: errorMessage
                        )
                    }
                } else if searchText.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
                    Section {
                        FieldUnavailableView(
                            title: "Find a customer",
                            systemImage: "person.text.rectangle",
                            detail: "Search by name, organization, phone, email, or service address."
                        )
                    }
                } else if results.isEmpty {
                    Section {
                        FieldUnavailableView(
                            title: "No matching customers",
                            systemImage: "magnifyingglass",
                            detail: "Try a different name, phone number, or address."
                        )
                    }
                } else {
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
                }
            }
            .scrollContentBackground(.hidden)
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Customers")
            .searchable(text: $searchText, prompt: "Name, phone, or address")
            .autocorrectionDisabled()
            .textInputAutocapitalization(.words)
            .task(id: searchText) { await search() }
        }
    }

    private func search() async {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else {
            results = []
            errorMessage = nil
            isSearching = false
            return
        }

        do {
            try await Task.sleep(for: .milliseconds(350))
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
