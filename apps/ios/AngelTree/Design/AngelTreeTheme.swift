import SwiftUI

enum AngelTreeTheme {
    static let forest = Color(red: 0.075, green: 0.345, blue: 0.239)
    static let deepForest = Color(red: 0.035, green: 0.235, blue: 0.153)
    static let canvas = Color(red: 0.969, green: 0.984, blue: 0.969)
    static let secondarySurface = Color(red: 0.925, green: 0.965, blue: 0.941)
    static let border = Color(red: 0.79, green: 0.84, blue: 0.80)
    static let charcoal = Color(red: 0.12, green: 0.15, blue: 0.13)
    static let warning = Color(red: 0.72, green: 0.40, blue: 0.06)
    static let emergency = Color(red: 0.70, green: 0.12, blue: 0.12)
    static let informational = Color(red: 0.08, green: 0.38, blue: 0.64)
}

struct FieldCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color(uiColor: .secondarySystemBackground))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(AngelTreeTheme.border.opacity(0.7), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

extension View {
    func fieldCard() -> some View {
        modifier(FieldCardModifier())
    }
}
