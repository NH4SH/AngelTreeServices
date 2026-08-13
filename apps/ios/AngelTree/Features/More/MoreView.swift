import SwiftUI

struct MoreView: View {
    @ObservedObject var model: AppModel
    let access: AppAccess
    let apiBaseURL: URL
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            List {
                Section("Profile") {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(access.displayName)
                            .font(.headline)
                        if let email = access.email {
                            Text(email)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Text(access.roleSummary)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AngelTreeTheme.forest)
                    }
                    .padding(.vertical, 5)

                    if let crewName = access.employee?.crewName {
                        Label(crewName, systemImage: "person.3.fill")
                    }
                    if let jobTitle = access.employee?.jobTitle {
                        Label(jobTitle, systemImage: "briefcase.fill")
                    }
                }

                Section("Full CRM") {
                    CRMRouteButton(
                        title: "Jobs",
                        systemImage: "leaf.fill",
                        route: "admin/jobs",
                        baseURL: apiBaseURL,
                        openURL: openURL
                    )
                    CRMRouteButton(
                        title: "Quotes",
                        systemImage: "doc.text.fill",
                        route: "admin/quotes",
                        baseURL: apiBaseURL,
                        openURL: openURL
                    )
                    CRMRouteButton(
                        title: "Invoices",
                        systemImage: "doc.plaintext.fill",
                        route: "admin/invoices",
                        baseURL: apiBaseURL,
                        openURL: openURL
                    )
                }

                Section {
                    Button(role: .destructive) {
                        Task { await model.signOut() }
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(minHeight: 44)
                    }
                    .disabled(model.isWorking)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AngelTreeTheme.canvas)
            .navigationTitle("More")
        }
    }
}

private struct CRMRouteButton: View {
    let title: String
    let systemImage: String
    let route: String
    let baseURL: URL
    let openURL: OpenURLAction

    var body: some View {
        Button {
            openURL(baseURL.appendingPathComponent(route))
        } label: {
            HStack {
                Label(title, systemImage: systemImage)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 44)
        }
        .foregroundStyle(AngelTreeTheme.charcoal)
        .accessibilityHint("Opens the full CRM")
    }
}
