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
                    Text("Advanced billing, delivery, reminders, and corrections remain available in the admin CRM.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    CRMRouteButton(
                        title: "Open admin CRM",
                        systemImage: "rectangle.on.rectangle",
                        route: "admin",
                        baseURL: apiBaseURL,
                        openURL: openURL
                    )
                }

                Section("Privacy & Data") {
                    NavigationLink {
                        PrivacyDataView()
                    } label: {
                        Label("Privacy & Data", systemImage: "hand.raised.fill")
                    }
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

private struct PrivacyDataView: View {
    private let privacyURL = URL(string: "https://angeltreeservices.org/privacy/")!
    private let requestURL = URL(string: "https://angeltreeservices.org/privacy-request/")!

    private var versionDescription: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "Unknown"
        return "Version \(version) (\(build))"
    }

    var body: some View {
        List {
            Section("Information in the app") {
                Text("Depending on your role, Angel Tree can show your account details, assigned schedules, customer and property information, job records, estimates, invoices, notes, documents, and field photos.")
                Text("Access is role-based and supports scheduling, field work, customer service, billing, safety, and company recordkeeping.")
            }

            Section("On this device") {
                Label("Camera access is used only when you choose to document assigned job conditions or completed work.", systemImage: "camera.fill")
                Label("The system photo picker lets you choose specific photos without giving the app unrestricted access to your library.", systemImage: "photo.on.rectangle")
                Text("The app does not request location, microphone, contacts, calendar, or advertising-tracking permission.")
                    .foregroundStyle(.secondary)
            }

            Section("Account & access") {
                Text("Signing out clears the app's operational caches and widget summary from this device. Removing account access does not automatically erase historical company business records that must remain accurate.")
                Link(destination: requestURL) {
                    Label("Request account removal or a data review", systemImage: "person.crop.circle.badge.minus")
                }
            }

            Section("Resources") {
                Link(destination: privacyURL) {
                    Label("Privacy policy", systemImage: "doc.text")
                }
                Link(destination: requestURL) {
                    Label("Privacy request", systemImage: "envelope")
                }
            }

            Section {
                Text(versionDescription)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .accessibilityLabel("Angel Tree app \(versionDescription)")
            }
        }
        .navigationTitle("Privacy & Data")
        .navigationBarTitleDisplayMode(.inline)
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
