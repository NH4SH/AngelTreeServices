import Foundation
import WidgetKit

protocol WidgetSyncing: Sendable {
    func sync(payload: MobileSchedulePayload, userID: String, savedAt: Date)
    func clear()
}

struct LiveWidgetSyncService: WidgetSyncing {
    private let store: WidgetSnapshotStore

    init(store: WidgetSnapshotStore = WidgetSnapshotStore()) {
        self.store = store
    }

    func sync(payload: MobileSchedulePayload, userID: String, savedAt: Date) {
        guard payload.scope == .mine,
              WidgetSnapshotMapper.rangeIncludesToday(payload.range, now: savedAt) else {
            return
        }

        let snapshot = WidgetSnapshotMapper.snapshot(
            payload: payload,
            userID: userID,
            savedAt: savedAt
        )
        guard store.write(snapshot) else { return }
        WidgetCenter.shared.reloadTimelines(ofKind: AngelTreeWidgetConfiguration.kind)
    }

    func clear() {
        _ = store.remove()
        WidgetCenter.shared.reloadTimelines(ofKind: AngelTreeWidgetConfiguration.kind)
    }
}

enum WidgetSnapshotMapper {
    static func snapshot(
        payload: MobileSchedulePayload,
        userID: String,
        savedAt: Date
    ) -> WidgetScheduleSnapshot {
        WidgetScheduleSnapshot(
            userID: userID,
            generatedAt: CRMDateParser.date(from: payload.generatedAt) ?? savedAt,
            savedAt: savedAt,
            items: SchedulePresentation.visibleItems(payload.items).map(map)
        )
    }

    static func rangeIncludesToday(_ range: MobileSchedulePayload.Range, now: Date) -> Bool {
        let today = BusinessCalendar.dateKey(for: now)
        return range.startDate <= today && range.endDate >= today
    }

    static func map(_ item: MobileScheduleItem) -> WidgetScheduleItem {
        WidgetScheduleItem(
            id: item.id,
            jobID: item.jobId,
            title: clean(item.title) ?? item.typeLabel,
            partyName: clean(item.party?.name),
            city: city(from: item.location?.fullAddress),
            status: item.status,
            startsAt: item.startsAtDate ?? .distantFuture,
            endsAt: item.endsAtDate,
            allDay: item.allDay,
            workdayNumber: item.workdayNumber,
            workdayCount: item.workdayCount
        )
    }

    static func city(from address: String?) -> String? {
        guard let address = clean(address) else { return nil }
        let components = address.split(separator: ",").map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if components.count >= 3 {
            return clean(components[components.count - 2])
        }
        if components.count == 2,
           components[0].range(of: #"^\d"#, options: .regularExpression) == nil {
            return clean(components[0])
        }
        return nil
    }

    private static func clean(_ value: String?) -> String? {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? value?.trimmingCharacters(in: .whitespacesAndNewlines)
            : nil
    }
}
