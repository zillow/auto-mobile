# Apple Signing for iOS and macOS

This guide describes how AutoMobile signs iOS frameworks and macOS tools in CI.
Signing runs during the iOS Swift package build job when credentials are available.

## What gets signed

- `XCTestRunner.framework` built for iOS Release (`generic/platform=iOS`).
- `XCTestService.framework` built for iOS Release (`generic/platform=iOS`).
- `AutoMobileCompanion` executable built for macOS Release.
- macOS Swift package artifacts from `XcodeExtension` when present.

## Required GitHub Secrets

Set these in the repo settings:

### iOS (Apple Distribution)

- `IOS_CERTIFICATE_BASE64`: Base64-encoded `.p12` distribution certificate.
- `IOS_CERTIFICATE_PASSWORD`: Password for the `.p12` certificate.
- `IOS_SIGNING_IDENTITY`: Exact codesign identity string, e.g. `Apple Distribution: Your Team (TEAMID)`.
- `IOS_SIGNING_TEAM_ID`: Apple Developer Team ID (10-character ID).
- `IOS_KEYCHAIN_PASSWORD`: Password for the temporary CI keychain (can be any value).
- `IOS_SIGNING_STRICT`: Set to `true` to fail if no iOS frameworks are produced.

### macOS (Developer ID)

- `MACOS_DEVELOPER_ID_CERT_BASE64`: Base64-encoded `.p12` Developer ID Application certificate.
- `MACOS_DEVELOPER_ID_CERT_PASSWORD`: Password for the `.p12` certificate.
- `MACOS_DEVELOPER_ID_SIGNING_IDENTITY`: Exact codesign identity string, e.g. `Developer ID Application: Your Team (TEAMID)`.
- `MACOS_DEVELOPER_ID_TEAM_ID`: Apple Developer Team ID (10-character ID).
- `MACOS_KEYCHAIN_PASSWORD`: Password for the temporary CI keychain (can be any value).
- `MACOS_SIGNING_STRICT`: Set to `true` to fail if no macOS signable artifacts are produced.

## Generate certificates

### iOS Distribution

1. Create or access the Apple Developer Program account.
2. In the Apple Developer portal, create a new Apple Distribution certificate.
3. Download the certificate and add it to your local keychain.
4. Export the certificate as a `.p12` with a password.
5. Base64-encode the `.p12`:

```bash
base64 -i ios-distribution.p12 | pbcopy
```

### macOS Developer ID

1. In the Apple Developer portal, create a Developer ID Application certificate.
2. Download the certificate and add it to your local keychain.
3. Export the certificate as a `.p12` with a password.
4. Base64-encode the `.p12`:

```bash
base64 -i developer-id-application.p12 | pbcopy
```

## Configure CI

CI uses these scripts:

- `scripts/ios/setup-signing-keychain.sh` to install the certificate in a temporary keychain.
- `scripts/ios/sign-ios-frameworks.sh` to build and verify the signed iOS frameworks.
- `scripts/ios/setup-macos-signing-keychain.sh` to install the Developer ID certificate in a temporary keychain.
- `scripts/ios/sign-macos-products.sh` to build and verify macOS products.

If the secrets are not present (for example, in forked PRs), signing is skipped.

## Local usage

### Strict (release-like) signing

```bash
export IOS_CERTIFICATE_BASE64="..."
export IOS_CERTIFICATE_PASSWORD="..."
export IOS_SIGNING_IDENTITY="Apple Distribution: Your Team (TEAMID)"
export IOS_SIGNING_TEAM_ID="TEAMID"
export IOS_KEYCHAIN_PASSWORD="temp"
export IOS_SIGNING_STRICT=true

export MACOS_DEVELOPER_ID_CERT_BASE64="..."
export MACOS_DEVELOPER_ID_CERT_PASSWORD="..."
export MACOS_DEVELOPER_ID_SIGNING_IDENTITY="Developer ID Application: Your Team (TEAMID)"
export MACOS_DEVELOPER_ID_TEAM_ID="TEAMID"
export MACOS_KEYCHAIN_PASSWORD="temp"
export MACOS_SIGNING_STRICT=true

./scripts/ios/setup-signing-keychain.sh
./scripts/ios/setup-macos-signing-keychain.sh
./scripts/ios/swift-build.sh
```

### Non-strict (development) signing

```bash
export IOS_CERTIFICATE_BASE64="..."
export IOS_CERTIFICATE_PASSWORD="..."
export IOS_SIGNING_IDENTITY="Apple Distribution: Your Team (TEAMID)"
export IOS_SIGNING_TEAM_ID="TEAMID"
export IOS_KEYCHAIN_PASSWORD="temp"

export MACOS_DEVELOPER_ID_CERT_BASE64="..."
export MACOS_DEVELOPER_ID_CERT_PASSWORD="..."
export MACOS_DEVELOPER_ID_SIGNING_IDENTITY="Developer ID Application: Your Team (TEAMID)"
export MACOS_DEVELOPER_ID_TEAM_ID="TEAMID"
export MACOS_KEYCHAIN_PASSWORD="temp"

./scripts/ios/setup-signing-keychain.sh
./scripts/ios/setup-macos-signing-keychain.sh
./scripts/ios/swift-build.sh
```

## Certificate rotation

- Apple Distribution certificates expire yearly. Set a reminder 30 days before expiry.
- Reissue a new certificate, export a new `.p12`, and update the GitHub secrets.
- Rotate `IOS_SIGNING_IDENTITY` if the certificate name changes.

## Troubleshooting

- `codesign` failures: run `security find-identity -v -p codesigning` to confirm the identity name.
- Build missing framework: confirm `xcodebuild -scheme XCTestRunner -destination 'generic/platform=iOS'` works locally.
