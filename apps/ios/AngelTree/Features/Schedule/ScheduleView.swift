import SwiftUI

struct ScheduleView: View {
    private enum ViewMode: String, CaseIterable {
        case day = "Day"
        case week = "Week"
    }

    let access: AppAccess
    @ObservedObject var store: ScheduleStore
    @State private var selectedDate = Date()
    @State private var mode: ViewMode = .day
    @State private var scope: ScheduleScope = .mine

    private var range: (start: String, end: String) {
        if mode == .day {
            let key = BusinessCalendar.dateKey(for: selectedDate)
            return (key, key)
        }
        let dates = BusinessCalendar.week(containing: selectedDate)
        return (
            BusinessCalendar.dateKey(for: dates[0]),
            BusinessCalendar.dateKey(for: dates[6])
        )
    }

    private var selectedItems: [MobileScheduleItem] {
        BusinessCalendar.items(store.items, on: selectedDate)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    controls

                    RefreshBanner(
                        isStale: store.isStale,
                        lastUpdated: store.lastUpdated,
                        errorMessage: store.errorMessage
                    ) {
                        Task { await load(force: true) }
                    }

                    Text(BusinessCalendar.dayHeading(selectedDate))
                        .font(.title2.bold())
                        .foregroundStyle(AngelTreeTheme.charcoal)

                    if store.isLoading && store.items.isEmpty {
                        ProgressView("Loading schedule")
                            .controlSize(.large)
                            .frame(maxWidth: .infinity, minHeight: 220)
                    } else if selectedItems.isEmpty {
                        EmptyScheduleView(
                            title: "No work on this day",
                            detail: "Choose another date or refresh the schedule."
                        )
                    } else {
                        ForEach(selectedItems) { item in
                            WorkCard(item: item)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
                .frame(maxWidth: 780)
                .frame(maxWidth: .infinity)
            }
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Schedule")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: MobileScheduleItem.self) { item in
                WorkDetailView(item: item)
            }
            .refreshable { await load(force: true) }
            .task(id: requestKey) { await load() }
        }
    }

    private var controls: some View {
        VStack(spacing: 14) {
            Picker("Schedule view", selection: $mode) {
                ForEach(ViewMode.allCases, id: \.self) { option in
                    Text(option.rawValue).tag(option)
                }
            }
            .pickerStyle(.segmented)

            if access.canViewTeamSchedule {
                Picker("Schedule scope", selection: $scope) {
                    ForEach(ScheduleScope.allCases, id: \.self) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            }

            HStack(spacing: 10) {
                Button {
                    selectedDate = BusinessCalendar.addingDays(mode == .week ? -7 : -1, to: selectedDate)
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(mode == .week ? "Previous week" : "Previous day")

                Button("Today") {
                    selectedDate = Date()
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity, minHeight: 44)

                Button {
                    selectedDate = BusinessCalendar.addingDays(mode == .week ? 7 : 1, to: selectedDate)
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(mode == .week ? "Next week" : "Next day")
            }

            if mode == .week {
                WeekDateStrip(selectedDate: $selectedDate)
            }
        }
    }

    private var requestKey: String {
        "\(range.start)-\(range.end)-\(scope.rawValue)-\(mode.rawValue)"
    }

    private func load(force: Bool = false) async {
        await store.load(
            startDate: range.start,
            endDate: range.end,
            scope: scope,
            force: force
        )
    }
}

private struct WeekDateStrip: View {
    @Binding var selectedDate: Date

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(BusinessCalendar.week(containing: selectedDate), id: \.self) { date in
                        let selected = BusinessCalendar.dateKey(for: date)
                            == BusinessCalendar.dateKey(for: selectedDate)
                        Button {
                            selectedDate = date
                        } label: {
                            VStack(spacing: 5) {
                                Text(BusinessCalendar.shortDay(date))
                                    .font(.caption.weight(.semibold))
                                Text(BusinessCalendar.dayNumber(date))
                                    .font(.title3.bold().monospacedDigit())
                            }
                            .foregroundStyle(selected ? Color(uiColor: .systemBackground) : AngelTreeTheme.charcoal)
                            .frame(width: 50, height: 58)
                            .background(selected ? AngelTreeTheme.deepForest : Color(uiColor: .secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(selected ? Color.clear : AngelTreeTheme.border, lineWidth: 1)
                            }
                        }
                        .buttonStyle(.plain)
                        .id(BusinessCalendar.dateKey(for: date))
                        .accessibilityLabel(date.formatted(date: .complete, time: .omitted))
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
            .onAppear {
                proxy.scrollTo(BusinessCalendar.dateKey(for: selectedDate), anchor: .center)
            }
        }
    }
}
