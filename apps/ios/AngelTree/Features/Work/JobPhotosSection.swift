import PhotosUI
import SwiftUI
import UIKit

struct JobPhotosSection: View {
    let jobID: String
    let photoService: any JobPhotoService

    @State private var photos: [JobPhotoSummary] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedPhoto: JobPhotoSummary?
    @State private var pickerItem: PhotosPickerItem?
    @State private var cameraPresented = false
    @State private var draft: PhotoDraft?

    private let columns = [GridItem(.adaptive(minimum: 104, maximum: 160), spacing: 8)]

    var body: some View {
        Section("Job photos") {
            photoActions

            if isLoading && photos.isEmpty {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Loading private photos").foregroundStyle(.secondary)
                }
                .frame(minHeight: 44)
            } else if let errorMessage, photos.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(errorMessage).foregroundStyle(.secondary)
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.bordered)
                }
                .padding(.vertical, 4)
            } else if photos.isEmpty {
                Text("No job photos yet. Add the first field photo above.")
                    .foregroundStyle(.secondary)
            } else {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(photos) { photo in
                        Button { selectedPhoto = photo } label: {
                            PhotoThumbnail(photo: photo)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(photo.caption ?? "\(photo.photoType.capitalized) job photo")
                        .disabled(photo.signedUrl == nil)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .task { await load() }
        .onChange(of: pickerItem) { item in
            guard let item else { return }
            Task { await preparePickerItem(item) }
        }
        .sheet(item: $selectedPhoto) { photo in
            FullScreenPhotoView(photo: photo)
        }
        .sheet(isPresented: $cameraPresented) {
            CameraPicker { image in
                cameraPresented = false
                prepareImage(image)
            }
            .ignoresSafeArea()
        }
        .sheet(item: $draft) { draft in
            PhotoUploadView(draft: draft) { category, caption in
                try await upload(draft: draft, category: category, caption: caption)
            }
        }
    }

    private var photoActions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { actionControls }
            VStack(spacing: 8) { actionControls }
        }
    }

    @ViewBuilder
    private var actionControls: some View {
        Button {
            cameraPresented = true
        } label: {
            Label("Take Photo", systemImage: "camera.fill")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
        .accessibilityHint(UIImagePickerController.isSourceTypeAvailable(.camera) ? "Opens the camera" : "Camera unavailable on this device")

        PhotosPicker(selection: $pickerItem, matching: .images) {
            Label("Choose Photo", systemImage: "photo.on.rectangle")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            photos = try await photoService.photos(for: jobID)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Photo gallery couldn't load. Pull to try again."
        }
        isLoading = false
    }

    private func preparePickerItem(_ item: PhotosPickerItem) async {
        defer { pickerItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                errorMessage = "That image couldn't be prepared. Choose another photo."
                return
            }
            prepareImage(image)
        } catch {
            errorMessage = "That image couldn't be prepared. Choose another photo."
        }
    }

    private func prepareImage(_ image: UIImage) {
        guard let data = ImagePreparation.jpegData(from: image), data.count <= 6 * 1024 * 1024 else {
            errorMessage = "That photo is too large to upload. Choose a smaller image."
            return
        }
        draft = PhotoDraft(image: image, data: data)
    }

    private func upload(draft: PhotoDraft, category: PhotoCategory, caption: String) async throws {
        try await photoService.upload(
            jobID: jobID,
            data: draft.data,
            fileName: "job-photo-\(UUID().uuidString).jpg",
            mimeType: "image/jpeg",
            category: category.rawValue,
            caption: caption
        )
        self.draft = nil
        await load()
    }
}

private struct PhotoThumbnail: View {
    let photo: JobPhotoSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            AsyncImage(url: photo.signedUrl.flatMap(URL.init(string:))) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    Image(systemName: "photo.badge.exclamationmark").font(.title2).foregroundStyle(.secondary)
                default:
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1.2, contentMode: .fit)
            .background(AngelTreeTheme.secondarySurface)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(photo.caption ?? photo.photoType.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(.caption.weight(.medium))
                .lineLimit(2)
        }
    }
}

private struct FullScreenPhotoView: View {
    let photo: JobPhotoSummary
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                AngelTreeTheme.charcoal.ignoresSafeArea()
                AsyncImage(url: photo.signedUrl.flatMap(URL.init(string:))) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFit()
                    } else if case .failure = phase {
                        FieldUnavailableView(
                            title: "Photo unavailable",
                            systemImage: "photo.badge.exclamationmark",
                            detail: "Close this photo and try again."
                        )
                        .foregroundStyle(.white)
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                .padding(12)
            }
            .navigationTitle(photo.caption ?? "Job photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } }
            }
        }
    }
}

private enum PhotoCategory: String, CaseIterable, Identifiable {
    case before, during, after, issue, completion, equipmentAccess = "equipment_access"
    var id: String { rawValue }
    var label: String { rawValue.replacingOccurrences(of: "_", with: " ").capitalized }
}

private struct PhotoDraft: Identifiable {
    let id = UUID()
    let image: UIImage
    let data: Data
}

private struct PhotoUploadView: View {
    let draft: PhotoDraft
    let upload: (PhotoCategory, String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var category: PhotoCategory = .during
    @State private var caption = ""
    @State private var isUploading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image(uiImage: draft.image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: 320)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                Section("Photo details") {
                    Picker("Type", selection: $category) {
                        ForEach(PhotoCategory.allCases) { Text($0.label).tag($0) }
                    }
                    TextField("Caption (optional)", text: $caption, axis: .vertical)
                        .lineLimit(2...4)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(AngelTreeTheme.emergency) }
                }
                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            if isUploading { ProgressView().tint(.white) }
                            Text(isUploading ? "Uploading..." : "Upload Photo")
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isUploading)
                }
            }
            .navigationTitle("Review photo")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isUploading)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(isUploading)
                }
            }
        }
    }

    private func submit() async {
        guard !isUploading else { return }
        isUploading = true
        errorMessage = nil
        do {
            try await upload(category, caption.trimmingCharacters(in: .whitespacesAndNewlines))
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Photo upload failed. Try again."
        }
        isUploading = false
    }
}

private struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraPicker
        init(parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

private enum ImagePreparation {
    static func jpegData(from image: UIImage) -> Data? {
        let maximumDimension: CGFloat = 2400
        let scale = min(1, maximumDimension / max(image.size.width, image.size.height))
        let target = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        let normalized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
        for quality in [0.82, 0.68, 0.54] {
            if let data = normalized.jpegData(compressionQuality: quality), data.count <= 6 * 1024 * 1024 {
                return data
            }
        }
        return nil
    }
}
