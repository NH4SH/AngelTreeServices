import SwiftUI

struct StatusStyle {
    let icon: String
    let foreground: Color
    let background: Color

    static func forStatus(_ status: String) -> StatusStyle {
        switch status {
        case "confirmed", "completed":
            return StatusStyle(
                icon: "checkmark.circle.fill",
                foreground: AngelTreeTheme.deepForest,
                background: AngelTreeTheme.secondarySurface
            )
        case "in_progress":
            return StatusStyle(
                icon: "clock.fill",
                foreground: AngelTreeTheme.informational,
                background: AngelTreeTheme.informational.opacity(0.12)
            )
        case "cancelled", "no_show":
            return StatusStyle(
                icon: "xmark.circle.fill",
                foreground: AngelTreeTheme.emergency,
                background: AngelTreeTheme.emergency.opacity(0.10)
            )
        default:
            return StatusStyle(
                icon: "calendar.badge.clock",
                foreground: AngelTreeTheme.warning,
                background: AngelTreeTheme.warning.opacity(0.10)
            )
        }
    }
}
