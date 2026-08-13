import SwiftUI

struct JobsView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @ObservedObject var store: JobDirectoryStore
    @Binding var scope: MobileJobDirectoryScope
    @Binding var searchText: String

    var body: some View {
        List {
            Section {
                Picker("Job view", selection: $scope) {
                    ForEach(MobileJobDirectoryScope.allCases, id: \.self) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityHint("Filters jobs by operational stage")
            }

            if hasSearchQuery {
                searchContent
            } else {
                directoryContent
            }
        }
        .scrollContentBackground(.hidden)
        .background(AngelTreeTheme.canvas)
        .searchable(text: $searchText, prompt: "Customer, address, or job")
        .autocorrectionDisabled()
        .textInputAutocapitalization(.words)
        .safeAreaInset(edge: .top) {
            if store.isShowingSavedData {
                Text("Showing saved jobs. Pull to refresh.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.warning)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(AngelTreeTheme.canvas)
            }
        }
        .task(id: scope) {
            searchText = ""
            store.clearSearch()
            await store.load(scope: scope)
        }
        .task(id: searchText) { await updateSearch() }
        .refreshable {
            if hasSearchQuery {
                await store.search(query: normalizedQuery, scope: scope)
            } else {
                await store.load(scope: scope, force: true)
            }
        }
    }

    @ViewBuilder
    private var directoryContent: some View {
        if store.isLoading && store.directoryResults.isEmpty {
            Section { loadingRow("Loading \(scope.label.lowercased()) jobs") }
        } else if let error = store.errorMessage, store.directoryResults.isEmpty {
            Section { retryView(message: error) { await store.load(scope: scope, force: true) } }
        } else if store.directoryResults.isEmpty {
            Section { emptyState(for: scope) }
        } else {
            Section(scope.label) {
                ForEach(store.directoryResults) { job in
                    jobLink(job)
                        .task { await store.loadMoreIfNeeded(current: job, scope: scope) }
                }
            }
            Section {
                if store.isLoadingMore {
                    loadingRow("Loading more jobs")
                } else if let error = store.errorMessage, store.hasMore {
                    Button("Try loading more") { Task { await store.loadNextPage(scope: scope) } }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityHint(error)
                } else if !store.hasMore {
                    Text("All available \(scope.label.lowercased()) jobs are loaded.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    @ViewBuilder
    private var searchContent: some View {
        if normalizedQuery.count < 2 {
            Section { Text("Enter at least 2 characters to search.").foregroundStyle(.secondary) }
        } else if store.isSearching {
            Section { loadingRow("Searching \(scope.label.lowercased()) jobs") }
        } else if let error = store.searchError {
            Section { retryView(message: error) { await store.search(query: normalizedQuery, scope: scope) } }
        } else if store.searchResults.isEmpty {
            Section { compactEmptyState("No matching jobs", "Try another customer, address, or service.") }
        } else {
            Section("Results") {
                ForEach(store.searchResults) { jobLink($0) }
            }
        }
    }

    private func jobLink(_ job: MobileJobDirectoryItem) -> some View {
        NavigationLink {
            JobDetailView(
                jobID: job.id,
                summary: nil,
                scheduleItem: nil,
                access: access,
                fieldService: fieldService,
                photoService: photoService
            )
        } label: {
            JobDirectoryRow(job: job)
        }
    }

    private func emptyState(for scope: MobileJobDirectoryScope) -> some View {
        compactEmptyState(
            "No \(scope.label.lowercased()) jobs",
            scope == .unscheduled
                ? "Approved work appears here until it is scheduled."
                : "Pull to refresh or choose another view."
        )
    }

    private func compactEmptyState(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline)
            Text(detail).font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }

    private func loadingRow(_ label: String) -> some View {
        HStack(spacing: 12) { ProgressView(); Text(label).foregroundStyle(.secondary) }
            .frame(minHeight: 44)
    }

    private func retryView(message: String, action: @escaping () async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message).font(.subheadline).foregroundStyle(.secondary)
            Button("Try again") { Task { await action() } }.buttonStyle(.bordered)
        }
        .padding(.vertical, 6)
    }

    private var normalizedQuery: String { searchText.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasSearchQuery: Bool { !normalizedQuery.isEmpty }

    private func updateSearch() async {
        let query = normalizedQuery
        guard query.count >= 2 else { store.clearSearch(); return }
        do {
            try await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await store.search(query: query, scope: scope)
        } catch { return }
    }
}

private struct JobDirectoryRow: View {
    let job: MobileJobDirectoryItem

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            VStack(alignment: .leading, spacing: 2) {
                Text(job.party?.name ?? "Work order")
                    .font(.headline)
                    .foregroundStyle(AngelTreeTheme.charcoal)
                Text(job.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.forest)
            }
            StatusBadge(status: job.status, label: statusLabel)
            if let address = job.serviceLocation?.fullAddress {
                Label(address, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let start = job.scheduledStartDate {
                Label(scheduleLabel(start), systemImage: "calendar")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if !job.assignedCrewNames.isEmpty {
                Label(job.assignedCrewNames.joined(separator: ", "), systemImage: "person.2.fill")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if job.workdayCount > 1 {
                Label("\(job.workdayCount)-day job", systemImage: "calendar.badge.clock")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AngelTreeTheme.forest)
            }
        }
        .padding(.vertical, 5)
    }

    private var statusLabel: String {
        job.status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func scheduleLabel(_ date: Date) -> String {
        "\(BusinessCalendar.dayHeading(date)) at \(BusinessCalendar.time(date))"
    }
}
