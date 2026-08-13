import SwiftUI

enum WorkSection: String, CaseIterable, Hashable {
    case jobs
    case proposals
    case invoices

    var label: String {
        switch self {
        case .jobs: "Jobs"
        case .proposals: "Proposals"
        case .invoices: "Invoices"
        }
    }

    static func available(for access: AppAccess) -> [WorkSection] {
        var sections: [WorkSection] = [.jobs]
        if access.canManageProposals { sections.append(.proposals) }
        if access.canViewInvoices { sections.append(.invoices) }
        return sections
    }
}

struct WorkView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    @StateObject private var jobStore: JobDirectoryStore
    @StateObject private var proposalStore: QuoteDirectoryStore
    @StateObject private var invoiceStore: InvoiceDirectoryStore
    @State private var selectedSection: WorkSection
    @State private var jobScope: MobileJobDirectoryScope = .upcoming
    @State private var jobSearch = ""
    @State private var proposalScope: MobileQuoteScope = .draft
    @State private var proposalSearch = ""
    @State private var invoiceScope: MobileInvoiceScope = .outstanding
    @State private var invoiceSearch = ""

    init(access: AppAccess, fieldService: any FieldDataService, photoService: any JobPhotoService) {
        self.access = access
        self.fieldService = fieldService
        self.photoService = photoService
        _jobStore = StateObject(wrappedValue: JobDirectoryStore(service: fieldService, userID: access.userID))
        _proposalStore = StateObject(wrappedValue: QuoteDirectoryStore(service: fieldService, userID: access.userID))
        _invoiceStore = StateObject(wrappedValue: InvoiceDirectoryStore(service: fieldService, userID: access.userID))
        _selectedSection = State(initialValue: WorkSection.available(for: access)[0])
    }

    private var availableSections: [WorkSection] {
        WorkSection.available(for: access)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if availableSections.count > 1 {
                    Picker("Work area", selection: $selectedSection) {
                        ForEach(availableSections, id: \.self) { section in
                            Text(section.label).tag(section)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(AngelTreeTheme.canvas)
                    .accessibilityHint("Switches between jobs, proposals, and invoices")
                }

                selectedDirectory
            }
            .background(AngelTreeTheme.canvas)
            .navigationTitle("Work")
        }
        .onChange(of: availableSections) { sections in
            if !sections.contains(selectedSection), let first = sections.first {
                selectedSection = first
            }
        }
    }

    @ViewBuilder
    private var selectedDirectory: some View {
        switch selectedSection {
        case .jobs:
            JobsView(
                access: access,
                fieldService: fieldService,
                photoService: photoService,
                store: jobStore,
                scope: $jobScope,
                searchText: $jobSearch
            )
        case .proposals:
            QuotesView(
                access: access,
                fieldService: fieldService,
                photoService: photoService,
                store: proposalStore,
                scope: $proposalScope,
                searchText: $proposalSearch
            )
        case .invoices:
            InvoicesView(
                access: access,
                fieldService: fieldService,
                photoService: photoService,
                store: invoiceStore,
                scope: $invoiceScope,
                query: $invoiceSearch
            )
        }
    }
}
