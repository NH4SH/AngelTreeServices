import SwiftUI

struct MainTabView: View {
    private enum Tab: Hashable {
        case today
        case schedule
        case customers
        case work
        case more
    }

    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab: Tab = .today
    @ObservedObject var model: AppModel
    let access: AppAccess
    let apiBaseURL: URL
    @ObservedObject var todayStore: ScheduleStore
    @ObservedObject var scheduleStore: ScheduleStore
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    var body: some View {
        TabView(selection: $selectedTab) {
            TodayView(
                model: model,
                access: access,
                store: todayStore,
                fieldService: fieldService,
                photoService: photoService
            )
                .tabItem {
                    Label("Today", systemImage: "sun.max.fill")
                }
                .tag(Tab.today)

            ScheduleView(access: access, store: scheduleStore, fieldService: fieldService, photoService: photoService)
                .tabItem {
                    Label("Schedule", systemImage: "calendar")
                }
                .tag(Tab.schedule)

            CustomersView(
                access: access,
                fieldService: fieldService,
                photoService: photoService
            )
                .tabItem {
                    Label("Customers", systemImage: "person.2.fill")
                }
                .tag(Tab.customers)

            WorkView(
                access: access,
                fieldService: fieldService,
                photoService: photoService
            )
                .tabItem {
                    Label("Work", systemImage: "briefcase.fill")
                }
                .tag(Tab.work)

            MoreView(
                model: model,
                access: access,
                apiBaseURL: apiBaseURL
            )
                .tabItem {
                    Label("More", systemImage: "ellipsis.circle.fill")
                }
                .tag(Tab.more)
        }
        .onChange(of: model.pendingDeepLink) { deepLink in
            if deepLink != nil { selectedTab = .today }
        }
        .onChange(of: scenePhase) { newPhase in
            guard newPhase == .active else { return }
            Task { await model.refreshAccess() }
        }
        .task(id: model.pendingDeepLink) {
            if model.pendingDeepLink != nil { selectedTab = .today }
        }
    }
}
