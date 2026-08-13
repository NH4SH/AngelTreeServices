import SwiftUI

struct StatusBadge: View {
    let status: String
    let label: String

    var body: some View {
        let style = StatusStyle.forStatus(status)
        Label(label, systemImage: style.icon)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(style.foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(style.background)
            .clipShape(Capsule())
            .accessibilityLabel("Status: \(label)")
    }
}
