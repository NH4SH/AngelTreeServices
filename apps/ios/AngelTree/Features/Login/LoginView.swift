import SwiftUI

struct LoginView: View {
    @ObservedObject var model: AppModel
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    private enum Field {
        case email
        case password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 26) {
                Spacer(minLength: 30)

                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 116, height: 116)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .accessibilityLabel("Angel Tree Services")

                VStack(spacing: 7) {
                    Text("Angel Tree")
                        .font(.largeTitle.bold())
                    Text("Internal field operations")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 16) {
                    TextField("Work email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                        .padding(14)
                        .background(Color(uiColor: .secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { submit() }
                        .padding(14)
                        .background(Color(uiColor: .secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                    if let message = model.message {
                        Label(message, systemImage: "exclamationmark.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(AngelTreeTheme.emergency)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button(action: submit) {
                        HStack {
                            if model.isWorking {
                                ProgressView()
                                    .tint(Color(uiColor: .systemBackground))
                            }
                            Text(model.isWorking ? "Signing in" : "Sign in")
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isWorking || email.isEmpty || password.isEmpty)
                }
                .frame(maxWidth: 440)

                Text("Use the same account as the Angel Tree CRM.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity)
        }
        .background(AngelTreeTheme.canvas)
    }

    private func submit() {
        focusedField = nil
        Task { await model.signIn(email: email, password: password) }
    }
}
