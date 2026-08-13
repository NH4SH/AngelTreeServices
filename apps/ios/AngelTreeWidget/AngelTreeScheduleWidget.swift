import SwiftUI
import WidgetKit

@main
struct AngelTreeWidgetBundle: WidgetBundle {
    var body: some Widget {
        AngelTreeScheduleWidget()
    }
}

struct AngelTreeScheduleWidget: Widget {
    let kind = AngelTreeWidgetConfiguration.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AngelTreeTimelineProvider()) { entry in
            AngelTreeWidgetView(entry: entry)
        }
        .configurationDisplayName("Angel Tree Schedule")
        .description("See your next job or today's upcoming stops.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct AngelTreeWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetScheduleSnapshot?
}

struct AngelTreeTimelineProvider: TimelineProvider {
    private let store = WidgetSnapshotStore()

    func placeholder(in context: Context) -> AngelTreeWidgetEntry {
        AngelTreeWidgetEntry(date: Date(), snapshot: Self.previewSnapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (AngelTreeWidgetEntry) -> Void) {
        completion(AngelTreeWidgetEntry(
            date: Date(),
            snapshot: context.isPreview ? Self.previewSnapshot : store.read()
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AngelTreeWidgetEntry>) -> Void) {
        let now = Date()
        let snapshot = store.read()
        let entries = WidgetScheduleLogic.timelineDates(for: snapshot, now: now).map {
            AngelTreeWidgetEntry(date: $0, snapshot: snapshot)
        }
        completion(Timeline(
            entries: entries,
            policy: .after(WidgetScheduleLogic.refreshDate(for: snapshot, now: now))
        ))
    }

    private static var previewSnapshot: WidgetScheduleSnapshot {
        let now = Date()
        return WidgetScheduleSnapshot(
            userID: "preview",
            generatedAt: now,
            savedAt: now,
            items: [
                WidgetScheduleItem(
                    id: "preview-one",
                    jobID: "preview-job",
                    title: "Tree Removal",
                    partyName: "Smith",
                    city: "Spotsylvania",
                    status: "scheduled",
                    startsAt: now.addingTimeInterval(42 * 60),
                    endsAt: now.addingTimeInterval(3 * 60 * 60),
                    allDay: false,
                    workdayNumber: nil,
                    workdayCount: nil
                ),
                WidgetScheduleItem(
                    id: "preview-two",
                    jobID: "preview-job-two",
                    title: "Stump Grinding",
                    partyName: "Johnson",
                    city: "Fredericksburg",
                    status: "scheduled",
                    startsAt: now.addingTimeInterval(4 * 60 * 60),
                    endsAt: now.addingTimeInterval(5 * 60 * 60),
                    allDay: false,
                    workdayNumber: nil,
                    workdayCount: nil
                ),
            ]
        )
    }
}

private struct AngelTreeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AngelTreeWidgetEntry

    var body: some View {
        Group {
            if entry.snapshot == nil {
                SignedOutWidgetView()
            } else if family == .systemMedium {
                TodayWidgetView(entry: entry)
            } else {
                NextJobWidgetView(entry: entry)
            }
        }
        .widgetSurface()
    }
}

private struct NextJobWidgetView: View {
    let entry: AngelTreeWidgetEntry

    private var nextItem: WidgetScheduleItem? {
        WidgetScheduleLogic.nextItem(in: entry.snapshot, now: entry.date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            WidgetHeader(title: "NEXT JOB", isStale: WidgetScheduleLogic.isStale(entry.snapshot, now: entry.date))

            if let item = nextItem {
                Text(item.allDay ? "All day" : WidgetBusinessCalendar.time(item.startsAt))
                    .font(.title2.bold().monospacedDigit())
                    .foregroundStyle(WidgetPalette.forest)
                    .minimumScaleFactor(0.8)

                Text(item.title)
                    .font(.headline)
                    .foregroundStyle(WidgetPalette.charcoal)
                    .lineLimit(1)

                VStack(alignment: .leading, spacing: 2) {
                    if let partyName = item.partyName {
                        Text(partyName).font(.subheadline.weight(.semibold))
                    }
                    if let city = item.city {
                        Text(city).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .lineLimit(1)

                Spacer(minLength: 0)

                if item.status.lowercased() == "in_progress" {
                    Label("In progress", systemImage: "clock.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(WidgetPalette.forest)
                } else if !item.allDay {
                    Text(item.startsAt, style: .relative)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(WidgetPalette.forest)
                }
            } else {
                Spacer(minLength: 0)
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(WidgetPalette.forest)
                Text("No more scheduled stops today")
                    .font(.headline)
                    .foregroundStyle(WidgetPalette.charcoal)
                Spacer(minLength: 0)
            }
        }
        .widgetURL(nextItem.map { WidgetDeepLink.forItem($0).url } ?? WidgetDeepLink.today.url)
        .accessibilityElement(children: .combine)
    }
}

private struct TodayWidgetView: View {
    let entry: AngelTreeWidgetEntry

    private var items: [WidgetScheduleItem] {
        Array(WidgetScheduleLogic.upcomingItems(in: entry.snapshot, now: entry.date).prefix(3))
    }

    private var remainingCount: Int {
        WidgetScheduleLogic.upcomingItems(in: entry.snapshot, now: entry.date).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            WidgetHeader(
                title: "TODAY · \(remainingCount) \(remainingCount == 1 ? "STOP" : "STOPS")",
                isStale: WidgetScheduleLogic.isStale(entry.snapshot, now: entry.date)
            )

            if items.isEmpty {
                Spacer()
                Label("No more scheduled stops today", systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(WidgetPalette.charcoal)
                Spacer()
            } else {
                ForEach(items) { item in
                    Link(destination: WidgetDeepLink.forItem(item).url) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(item.allDay ? "All day" : WidgetBusinessCalendar.time(item.startsAt))
                                .font(.subheadline.bold().monospacedDigit())
                                .foregroundStyle(WidgetPalette.forest)
                                .frame(width: 66, alignment: .leading)

                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 5) {
                                    Text(item.title)
                                        .font(.subheadline.weight(.semibold))
                                    if let workday = item.workdayLabel {
                                        Text(workday)
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .lineLimit(1)
                                Text([item.partyName, item.city].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.caption.bold())
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .accessibilityLabel(accessibilityLabel(for: item))

                    if item.id != items.last?.id {
                        Divider().overlay(WidgetPalette.border)
                    }
                }
            }
        }
        .widgetURL(WidgetDeepLink.today.url)
    }

    private func accessibilityLabel(for item: WidgetScheduleItem) -> String {
        [
            item.allDay ? "All day" : WidgetBusinessCalendar.time(item.startsAt),
            item.title,
            item.partyName,
            item.city,
            item.workdayLabel,
        ].compactMap { $0 }.joined(separator: ", ")
    }
}

private struct SignedOutWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetHeader(title: "ANGEL TREE", isStale: false)
            Spacer()
            Image(systemName: "person.crop.circle.badge.checkmark")
                .font(.title2)
                .foregroundStyle(WidgetPalette.forest)
            Text("Open Angel Tree to sign in")
                .font(.headline)
                .foregroundStyle(WidgetPalette.charcoal)
            Spacer()
        }
        .widgetURL(WidgetDeepLink.today.url)
        .accessibilityElement(children: .combine)
    }
}

private struct WidgetHeader: View {
    let title: String
    let isStale: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "leaf.fill")
                .foregroundStyle(WidgetPalette.forest)
            Text(title)
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer(minLength: 4)
            if isStale {
                Label("Cached", systemImage: "arrow.clockwise")
                    .labelStyle(.titleAndIcon)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private enum WidgetPalette {
    static let forest = Color(red: 0.02, green: 0.29, blue: 0.16)
    static let charcoal = Color(red: 0.12, green: 0.14, blue: 0.13)
    static let canvas = Color(red: 0.97, green: 0.99, blue: 0.97)
    static let border = Color(red: 0.82, green: 0.87, blue: 0.83)
}

private extension View {
    @ViewBuilder
    func widgetSurface() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self
                .containerBackground(WidgetPalette.canvas, for: .widget)
                .padding(4)
        } else {
            self
                .padding()
                .background(WidgetPalette.canvas)
        }
    }
}
