import SwiftUI

struct TodayView: View {
    let access: AppAccess
    @ObservedObject var store: ScheduleStore
    @State private var scope: ScheduleScope = .mine

    private var today: Date { Date() }
    private var dateKey: String { BusinessCalendar.dateKey(for: today) }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    header

                    RefreshBanner(
                        isStale: store.isStale,
                        lastUpdated: store.lastUpdated,
                        errorMessage: store.errorMessage
                    ) {
                        Task { await load(force: true) }
                    }

                    if store.isLoading && store.items.isEmpty {
                        loadingState
                    } else if store.items.isEmpty {
                        EmptyScheduleView(
                            title: "No work scheduled today",
                            detail: scope == .mine
                                ? "Your assigned work will appear here."
                                : "The team schedule is clear today."
                        )
                    } else {
                        ForEach(store.items) { item in
                            WorkCard(item: item)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: MobileScheduleItem.self) { item in
                WorkDetailView(item: item)
            }
            .refreshable { await load(force: true) }
            .task(id: "\(dateKey)-\(scope.rawValue)") { await load() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(BusinessCalendar.dayHeading(today))
                .font(.title2.bold())
                .foregroundStyle(AngelTreeTheme.charcoal)
            Text(access.employee?.crewName ?? access.employee?.jobTitle ?? access.displayName)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)

            if access.canViewTeamSchedule {
                Picker("Schedule scope", selection: $scope) {
                    ForEach(ScheduleScope.allCases, id: \.self) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.large)
            Text("Loading today's work")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }

    private func load(force: Bool = false) async {
        await store.load(
            startDate: dateKey,
            endDate: dateKey,
            scope: scope,
            force: force
        )
    }
}

struct EmptyScheduleView: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "calendar.badge.checkmark")
                .font(.system(size: 34))
                .foregroundStyle(AngelTreeTheme.forest)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 42)
        .frame(maxWidth: .infinity)
    }
}
