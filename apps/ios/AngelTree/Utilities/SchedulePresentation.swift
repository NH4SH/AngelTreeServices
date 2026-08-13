import Foundation

enum SchedulePresentation {
    static func visibleItems(_ items: [MobileScheduleItem]) -> [MobileScheduleItem] {
        items.filter { item in
            !(item.eventType == "job" && item.status == "cancelled")
        }
    }
}
