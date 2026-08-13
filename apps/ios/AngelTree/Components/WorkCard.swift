import SwiftUI

struct WorkCard: View {
    let item: MobileScheduleItem

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            NavigationLink(value: item) {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(BusinessCalendar.time(item.startsAtDate))
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(AngelTreeTheme.deepForest)
                        Spacer(minLength: 8)
                        StatusBadge(status: item.status, label: item.statusLabel)
                    }

                    Text(item.operationalTitle)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(AngelTreeTheme.charcoal)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 8) {
                        Label(item.typeLabel, systemImage: eventIcon)
                        if let workdayLabel = item.workdayLabel {
                            Text(workdayLabel)
                        }
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)

                    if let address = item.location?.fullAddress {
                        Label(address, systemImage: "mappin.and.ellipse")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                    }

                    if !item.assignees.isEmpty {
                        Label(
                            item.assignees.map(\.name).joined(separator: ", "),
                            systemImage: "person.2.fill"
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens work details")

            WorkQuickActions(
                address: item.location?.fullAddress,
                phone: item.party?.phone
            )
        }
        .fieldCard()
    }

    private var eventIcon: String {
        switch item.eventType {
        case "estimate": "doc.text.magnifyingglass"
        case "emergency": "exclamationmark.triangle.fill"
        case "maintenance": "wrench.and.screwdriver.fill"
        case "follow_up": "arrowshape.turn.up.right.fill"
        case "pto", "unavailable": "person.crop.circle.badge.minus"
        default: "leaf.fill"
        }
    }
}
