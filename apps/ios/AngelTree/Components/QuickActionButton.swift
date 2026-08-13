import SwiftUI

struct QuickActionButton: View {
    let title: String
    let systemImage: String
    let url: URL?

    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            guard let url else { return }
            openURL(url)
        } label: {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(url == nil)
        .accessibilityHint(url == nil ? "Not available for this work item" : "Opens a system app")
    }
}
