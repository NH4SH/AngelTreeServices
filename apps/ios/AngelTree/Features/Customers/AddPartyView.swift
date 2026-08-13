import SwiftUI

struct AddPartyView: View {
    private enum PartyChoice: String, CaseIterable, Identifiable {
        case customer = "Customer"
        case organization = "Organization"

        var id: String { rawValue }
        var kind: MobilePartyKind { self == .organization ? .organization : .customer }
    }

    private let organizationTypes = [
        "property_manager", "hoa", "commercial", "nonprofit", "church", "municipality",
        "general_contractor", "apartment_community", "real_estate", "other",
    ]

    let fieldService: any FieldDataService
    let onCreated: (MobilePartySearchResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var choice: PartyChoice = .customer
    @State private var name = ""
    @State private var contactName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var organizationType = "property_manager"
    @State private var street = ""
    @State private var city = ""
    @State private var state = "VA"
    @State private var postalCode = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Record type", selection: $choice) {
                        ForEach(PartyChoice.allCases) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section(choice == .customer ? "Customer" : "Organization") {
                    TextField(choice == .customer ? "Customer name" : "Organization name", text: $name)
                        .textContentType(.name)
                    if choice == .organization {
                        TextField("Primary contact name (optional)", text: $contactName)
                            .textContentType(.name)
                        Picker("Organization type", selection: $organizationType) {
                            ForEach(organizationTypes, id: \.self) { type in
                                Text(type.replacingOccurrences(of: "_", with: " ").capitalized).tag(type)
                            }
                        }
                    }
                }

                Section("Contact") {
                    TextField(choice == .organization ? "Billing phone (optional)" : "Phone (optional)", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                    TextField(choice == .organization ? "Billing email (optional)" : "Email (optional)", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section {
                    TextField("Street", text: $street)
                        .textContentType(.streetAddressLine1)
                    TextField("City", text: $city)
                        .textContentType(.addressCity)
                    HStack {
                        TextField("State", text: $state)
                            .textContentType(.addressState)
                            .frame(maxWidth: 90)
                        TextField("ZIP", text: $postalCode)
                            .keyboardType(.numbersAndPunctuation)
                            .textContentType(.postalCode)
                    }
                } header: {
                    Text("Primary service location")
                } footer: {
                    Text("Leave this section blank if the service address is not known yet.")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .accessibilityLabel("Error: \(errorMessage)")
                    }
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Spacer()
                            if isSaving { ProgressView().padding(.trailing, 6) }
                            Text(isSaving ? "Saving..." : "Add \(choice.rawValue.lowercased())")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                        .frame(minHeight: 44)
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle("Add \(choice.rawValue)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    private func save() async {
        let cleanedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedStreet = street.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedCity = city.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedPostalCode = postalCode.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanedName.isEmpty else {
            errorMessage = "Enter a \(choice.rawValue.lowercased()) name."
            return
        }
        if !cleanedEmail.isEmpty,
           cleanedEmail.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil {
            errorMessage = "Enter a valid email address or leave email blank."
            return
        }
        let hasAddress = !cleanedStreet.isEmpty || !cleanedCity.isEmpty || !cleanedPostalCode.isEmpty
        guard !hasAddress || (!cleanedStreet.isEmpty && !cleanedCity.isEmpty) else {
            errorMessage = "Street and city are required when adding a service location."
            return
        }

        isSaving = true
        errorMessage = nil
        let input = MobilePartyCreateRequest(
            kind: choice.kind,
            name: cleanedName,
            contactName: optional(contactName),
            email: optional(cleanedEmail),
            phone: optional(phone),
            organizationType: choice == .organization ? organizationType : nil,
            serviceLocation: hasAddress ? .init(
                street: cleanedStreet,
                city: cleanedCity,
                state: optional(state) ?? "VA",
                postalCode: optional(cleanedPostalCode)
            ) : nil
        )

        do {
            let party = try await fieldService.createParty(input)
            isSaving = false
            onCreated(party)
        } catch {
            isSaving = false
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "The record could not be created. Check the details and try again."
        }
    }

    private func optional(_ value: String) -> String? {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }
}
