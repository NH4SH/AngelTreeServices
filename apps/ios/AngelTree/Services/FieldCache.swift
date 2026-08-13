import Foundation

actor FieldCache {
    private let directory: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.temporaryDirectory
        self.directory = root.appendingPathComponent("AngelTree/FieldCache", isDirectory: true)
    }

    func readParty(userID: String, kind: MobilePartyKind, id: String) -> MobilePartyDetail? {
        read(MobilePartyDetail.self, key: "\(userID)-party-\(kind.rawValue)-\(id)")
    }

    func writeParty(_ party: MobilePartyDetail, userID: String) {
        write(party, key: "\(userID)-party-\(party.kind.rawValue)-\(party.id)")
        recordRecentParty(party, userID: userID)
    }

    func readRecentParties(userID: String) -> [MobilePartySearchResult] {
        read([MobilePartySearchResult].self, key: "\(userID)-recent-parties") ?? []
    }

    func recordRecentParty(_ party: MobilePartyDetail, userID: String) {
        let result = MobilePartySearchResult(
            id: party.id,
            kind: party.kind,
            name: party.name,
            contactName: party.contactName,
            email: party.email,
            phone: party.phone,
            address: party.serviceLocations.first?.fullAddress
        )
        let existing = readRecentParties(userID: userID)
            .filter { $0.id != result.id || $0.kind != result.kind }
        write(Array(([result] + existing).prefix(8)), key: "\(userID)-recent-parties")
    }

    func readJob(userID: String, id: String) -> MobileJobDetail? {
        read(MobileJobDetail.self, key: "\(userID)-job-\(id)")
    }

    func writeJob(_ job: MobileJobDetail, userID: String) {
        write(job, key: "\(userID)-job-\(job.id)")
    }

    func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func read<Value: Decodable>(_ type: Value.Type, key: String) -> Value? {
        guard let data = try? Data(contentsOf: fileURL(key)) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    private func write<Value: Encodable>(_ value: Value, key: String) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try encoder.encode(value).write(to: fileURL(key), options: .atomic)
        } catch {
            // Field data remains available in memory when local storage is unavailable.
        }
    }

    private func fileURL(_ key: String) -> URL {
        let safeKey = key.replacingOccurrences(of: "/", with: "-")
        return directory.appendingPathComponent("\(safeKey).json")
    }
}
