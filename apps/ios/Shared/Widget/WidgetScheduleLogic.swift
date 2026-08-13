import Foundation

enum WidgetScheduleLogic {
    private static let excludedStatuses = Set([
        "cancelled",
        "canceled",
        "completed",
        "declined",
        "void",
        "voided",
    ])

    static func upcomingItems(
        in snapshot: WidgetScheduleSnapshot?,
        now: Date = Date()
    ) -> [WidgetScheduleItem] {
        guard let snapshot else { return [] }
        let today = WidgetBusinessCalendar.dateKey(for: now)

        return snapshot.items
            .filter { item in
                guard WidgetBusinessCalendar.dateKey(for: item.startsAt) == today,
                      !excludedStatuses.contains(item.status.lowercased()) else {
                    return false
                }
                if item.allDay { return true }
                if item.status.lowercased() == "in_progress" { return true }
                if let endsAt = item.endsAt { return endsAt > now }
                return item.startsAt >= now
            }
            .sorted {
                if $0.startsAt == $1.startsAt { return $0.id < $1.id }
                return $0.startsAt < $1.startsAt
            }
    }

    static func nextItem(
        in snapshot: WidgetScheduleSnapshot?,
        now: Date = Date()
    ) -> WidgetScheduleItem? {
        upcomingItems(in: snapshot, now: now).first
    }

    static func isStale(
        _ snapshot: WidgetScheduleSnapshot?,
        now: Date = Date(),
        maximumAge: TimeInterval = AngelTreeWidgetConfiguration.staleAfter
    ) -> Bool {
        guard let snapshot else { return false }
        return now.timeIntervalSince(snapshot.savedAt) > maximumAge
    }

    static func timelineDates(
        for snapshot: WidgetScheduleSnapshot?,
        now: Date = Date()
    ) -> [Date] {
        guard let snapshot else { return [now] }
        let endOfDay = WidgetBusinessCalendar.startOfNextDay(after: now)
        let transitions = snapshot.items.flatMap { [$0.startsAt, $0.endsAt].compactMap { $0 } }
            .filter { $0 > now && $0 < endOfDay }
        return Array(Set([now] + transitions)).sorted()
    }

    static func refreshDate(
        for snapshot: WidgetScheduleSnapshot?,
        now: Date = Date()
    ) -> Date {
        let nextHour = now.addingTimeInterval(60 * 60)
        let nextDay = WidgetBusinessCalendar.startOfNextDay(after: now)
        let nextTransition = timelineDates(for: snapshot, now: now).first(where: { $0 > now })
        return [nextHour, nextDay, nextTransition].compactMap { $0 }.min() ?? nextHour
    }
}

enum WidgetBusinessCalendar {
    static let timeZone = TimeZone(identifier: "America/New_York")!

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = timeZone
        return calendar
    }

    static func dateKey(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func startOfNextDay(after date: Date) -> Date {
        let start = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(24 * 60 * 60)
    }

    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
