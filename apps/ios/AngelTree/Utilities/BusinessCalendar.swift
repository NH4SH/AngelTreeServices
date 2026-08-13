import Foundation

enum BusinessCalendar {
    static let timeZoneIdentifier = "America/New_York"
    static let timeZone = TimeZone(identifier: timeZoneIdentifier)!

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US")
        calendar.timeZone = timeZone
        calendar.firstWeekday = 2
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

    static func date(fromKey key: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.date(from: "\(key) 12:00")
    }

    static func addingDays(_ count: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: count, to: date) ?? date
    }

    static func week(containing date: Date) -> [Date] {
        let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        let monday = calendar.date(from: components) ?? date
        return (0..<7).map { addingDays($0, to: monday) }
    }

    static func items(_ items: [MobileScheduleItem], on date: Date) -> [MobileScheduleItem] {
        let key = dateKey(for: date)
        return items
            .filter { item in
                guard let startsAt = item.startsAtDate else { return false }
                return dateKey(for: startsAt) == key
            }
            .sorted { ($0.startsAtDate ?? .distantFuture) < ($1.startsAtDate ?? .distantFuture) }
    }

    static func dayHeading(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter.string(from: date)
    }

    static func shortDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.dateFormat = "EEE"
        return formatter.string(from: date)
    }

    static func dayNumber(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.dateFormat = "d"
        return formatter.string(from: date)
    }

    static func time(_ date: Date?) -> String {
        guard let date else { return "Time not set" }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    static func timeRange(for item: MobileScheduleItem) -> String {
        if item.allDay { return "All day" }
        let start = time(item.startsAtDate)
        guard item.endsAtDate != nil else { return start }
        return "\(start) to \(time(item.endsAtDate))"
    }
}
