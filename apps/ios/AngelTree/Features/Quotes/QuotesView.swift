import SwiftUI

struct QuotesView: View {
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService
    @ObservedObject var store: QuoteDirectoryStore
    @Binding var scope: MobileQuoteScope
    @Binding var searchText: String
    @State private var createdQuote: MobileQuoteDetail?
    @State private var showCreate = false

    var body: some View {
        List {
            Section { Picker("Proposal status", selection: $scope) { ForEach(MobileQuoteScope.allCases, id: \.self) { Text($0.label).tag($0) } }.pickerStyle(.segmented) }
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { directory } else { search }
        }
        .searchable(text: $searchText, prompt: "Proposal, customer, or address")
        .scrollContentBackground(.hidden).background(AngelTreeTheme.canvas)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showCreate = true } label: { Image(systemName: "plus") }.accessibilityLabel("Create proposal") } }
        .safeAreaInset(edge: .top) { if store.isShowingSavedData { Text("Showing saved proposals. Pull to refresh.").font(.caption.weight(.semibold)).foregroundStyle(AngelTreeTheme.warning).frame(maxWidth: .infinity).padding(8).background(AngelTreeTheme.canvas) } }
        .task(id: scope) { searchText = ""; store.clearSearch(); await store.load(scope: scope) }
        .task(id: searchText) { await updateSearch() }
        .refreshable { await store.refresh(scope: scope) }
        .sheet(isPresented: $showCreate) { NavigationStack { ProposalEditorView(access: access, fieldService: fieldService, quote: nil) { quote in createdQuote = quote; showCreate = false } } }
        .navigationDestination(isPresented: Binding(get: { createdQuote != nil }, set: { if !$0 { createdQuote = nil } })) {
            if let createdQuote { ProposalDetailView(quoteID: createdQuote.id, access: access, fieldService: fieldService, photoService: photoService) }
        }
    }

    @ViewBuilder private var directory: some View {
        if store.isLoading && store.results.isEmpty { Section { ProgressView("Loading proposals") } }
        else if let error = store.errorMessage, store.results.isEmpty { Section { retry(error) { await store.load(scope: scope, force: true) } } }
        else if store.results.isEmpty { Section { empty("No \(scope.label.lowercased()) proposals") } }
        else { Section(scope.label) { ForEach(store.results) { quote in row(quote).task { await store.loadMoreIfNeeded(quote, scope: scope) } } }; if store.isLoadingMore { Section { ProgressView("Loading more") } } }
    }

    @ViewBuilder private var search: some View {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if query.count < 2 { Section { Text("Enter at least 2 characters to search.").foregroundStyle(.secondary) } }
        else if store.isSearching { Section { ProgressView("Searching proposals") } }
        else if let error = store.searchError { Section { retry(error) { await store.search(query, scope: scope) } } }
        else if store.searchResults.isEmpty { Section { empty("No matching proposals") } }
        else { Section("Results") { ForEach(store.searchResults) { row($0) } } }
    }

    private func row(_ quote: MobileQuoteDirectoryItem) -> some View {
        NavigationLink { ProposalDetailView(quoteID: quote.id, access: access, fieldService: fieldService, photoService: photoService) } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack { Text(quote.proposalNumber.map { "Proposal #\($0)" } ?? "Draft proposal").font(.headline); Spacer(); Text(money(quote.totalCents)).font(.headline).foregroundStyle(AngelTreeTheme.forest) }
                Text(quote.party?.name ?? "Unknown contracting party").font(.subheadline.weight(.semibold))
                Text(quote.title).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                Label(quote.serviceLocation.fullAddress, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                StatusBadge(status: quote.status, label: quote.status.replacingOccurrences(of: "_", with: " ").capitalized)
            }.padding(.vertical, 5)
        }
    }

    private func empty(_ title: String) -> some View { VStack(alignment: .leading, spacing: 4) { Text(title).font(.headline); Text("Pull to refresh or choose another status.").font(.subheadline).foregroundStyle(.secondary) }.padding(.vertical, 8) }
    private func retry(_ message: String, action: @escaping () async -> Void) -> some View { VStack(alignment: .leading, spacing: 8) { Text(message).foregroundStyle(.secondary); Button("Try again") { Task { await action() } }.buttonStyle(.bordered) } }
    private func money(_ cents: Int) -> String { (Double(cents) / 100).formatted(.currency(code: "USD")) }
    private func updateSearch() async { let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines); guard query.count >= 2 else { store.clearSearch(); return }; try? await Task.sleep(for: .milliseconds(350)); guard !Task.isCancelled else { return }; await store.search(query, scope: scope) }
}
