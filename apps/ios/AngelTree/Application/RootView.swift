import SwiftUI

struct RootView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Group {
            switch model.phase {
            case .configurationRequired(let message):
                ConfigurationRequiredView(message: message)
            case .launching:
                LaunchingView()
                    .task { await model.start() }
            case .signedOut:
                LoginView(model: model)
            case .accessRequired(let message):
                AccessRequiredView(message: message) {
                    Task { await model.signOut() }
                }
            case .signedIn(let access):
                if let todayStore = model.todayStore,
                   let scheduleStore = model.scheduleStore,
                   let customerPreviewStore = model.customerPreviewStore,
                   let fieldService = model.fieldService,
                   let photoService = model.photoService,
                   let apiBaseURL = model.apiBaseURL {
                    MainTabView(
                        model: model,
                        access: access,
                        apiBaseURL: apiBaseURL,
                        todayStore: todayStore,
                        scheduleStore: scheduleStore,
                        customerPreviewStore: customerPreviewStore,
                        fieldService: fieldService,
                        photoService: photoService
                    )
                } else {
                    ConfigurationRequiredView(message: "The app services could not be started.")
                }
            }
        }
        .tint(AngelTreeTheme.forest)
        .onOpenURL { model.open(url: $0) }
    }
}

private struct LaunchingView: View {
    var body: some View {
        VStack(spacing: 18) {
            Image("AppLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 104, height: 104)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .accessibilityHidden(true)
            ProgressView("Opening Angel Tree")
                .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AngelTreeTheme.canvas)
    }
}

private struct ConfigurationRequiredView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.system(size: 36))
                .foregroundStyle(AngelTreeTheme.forest)
            Text("Configuration needed")
                .font(.title2.bold())
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(28)
        .frame(maxWidth: 440, maxHeight: .infinity)
        .frame(maxWidth: .infinity)
        .background(AngelTreeTheme.canvas)
    }
}

private struct AccessRequiredView: View {
    let message: String
    let signOut: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "person.badge.key.fill")
                .font(.system(size: 38))
                .foregroundStyle(AngelTreeTheme.forest)
            Text("Access required")
                .font(.title2.bold())
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Sign out", action: signOut)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding(28)
        .frame(maxWidth: 440, maxHeight: .infinity)
        .frame(maxWidth: .infinity)
        .background(AngelTreeTheme.canvas)
    }
}
