import SwiftUI

struct WorkQuickActions: View {
    let address: String?
    let phone: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 8) {
                actions
            }
        } else {
            HStack(spacing: 8) {
                actions
            }
        }
    }

    @ViewBuilder
    private var actions: some View {
        QuickActionButton(
            title: "Directions",
            systemImage: "arrow.triangle.turn.up.right.diamond.fill",
            url: SystemActions.directionsURL(address: address)
        )
        QuickActionButton(
            title: "Call",
            systemImage: "phone.fill",
            url: SystemActions.phoneURL(phone)
        )
        QuickActionButton(
            title: "Text",
            systemImage: "message.fill",
            url: SystemActions.messageURL(phone)
        )
    }
}
