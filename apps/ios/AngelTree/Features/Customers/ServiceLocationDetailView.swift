import SwiftUI

struct ServiceLocationDetailView: View {
    let location: MobileServiceLocation
    let party: MobilePartyDetail
    let access: AppAccess
    let fieldService: any FieldDataService
    let photoService: any JobPhotoService

    private var jobs: [MobilePartyWorkSummary] {
        party.jobs.filter { $0.serviceLocationId == location.id }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 7) {
                    Text(location.label ?? "Service location").font(.title2.bold())
                    Text(location.fullAddress).font(.headline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }
            Section("Directions") {
                QuickActionButton(
                    title: "Open in Maps",
                    systemImage: "arrow.triangle.turn.up.right.diamond.fill",
                    url: SystemActions.directionsURL(address: location.fullAddress)
                )
            }
            if location.accessNotes != nil || location.gateCode != nil || location.serviceNotes != nil {
                Section("Field information") {
                    if let accessNotes = location.accessNotes { DetailTextBlock(title: "Access instructions", text: accessNotes) }
                    if let gateCode = location.gateCode { DetailTextBlock(title: "Gate code", text: gateCode) }
                    if let serviceNotes = location.serviceNotes { DetailTextBlock(title: "Service notes", text: serviceNotes) }
                }
            }
            Section("Linked customer") {
                Label(party.name, systemImage: party.kind == .organization ? "building.2.fill" : "person.fill")
            }
            Section("Work at this location") {
                if jobs.isEmpty {
                    Text("No accessible work is linked to this location.").foregroundStyle(.secondary)
                } else {
                    ForEach(jobs) { job in
                        NavigationLink {
                            JobDetailView(
                                jobID: job.id,
                                summary: job,
                                scheduleItem: nil,
                                access: access,
                                fieldService: fieldService,
                                photoService: photoService
                            )
                        } label: { JobSummaryRow(job: job) }
                    }
                }
            }
        }
        .navigationTitle("Service location")
        .navigationBarTitleDisplayMode(.inline)
    }
}
