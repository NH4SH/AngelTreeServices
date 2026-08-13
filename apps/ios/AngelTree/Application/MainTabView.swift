import SwiftUI

struct MainTabView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var model: AppModel
    let access: AppAccess
    let apiBaseURL: URL
    @ObservedObject var todayStore: ScheduleStore
    @ObservedObject var scheduleStore: ScheduleStore

    var body: some View {
        TabView {
            TodayView(access: access, store: todayStore)
                .tabItem {
                    Label("Today", systemImage: "sun.max.fill")
                }

            ScheduleView(access: access, store: scheduleStore)
                .tabItem {
                    Label("Schedule", systemImage: "calendar")
                }

            CustomersView(todayStore: todayStore, scheduleStore: scheduleStore)
                .tabItem {
                    Label("Customers", systemImage: "person.2.fill")
                }

            MoreView(model: model, access: access, apiBaseURL: apiBaseURL)
                .tabItem {
                    Label("More", systemImage: "ellipsis.circle.fill")
                }
        }
        .onChange(of: scenePhase) { newPhase in
            guard newPhase == .active else { return }
            Task { await model.refreshAccess() }
        }
    }
}
