import SwiftUI

struct RefreshBanner: View {
    let isStale: Bool
    let lastUpdated: Date?
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        if isStale || errorMessage != nil {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: isStale ? "wifi.slash" : "exclamationmark.circle.fill")
                    .foregroundStyle(isStale ? AngelTreeTheme.warning : AngelTreeTheme.emergency)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(isStale ? "Showing saved schedule" : "Could not refresh")
                        .font(.subheadline.weight(.semibold))
                    if let lastUpdated {
                        Text("Last updated \(lastUpdated.formatted(date: .omitted, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                Button("Try again", action: retry)
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
            }
            .padding(12)
            .background(AngelTreeTheme.warning.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }
}
