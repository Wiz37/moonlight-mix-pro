# Turn the CI build into a signed TestFlight build

The included `codemagic.yaml` intentionally starts with an unsigned simulator build. This verifies that GitHub, npm, Vite, Capacitor, Xcode, and Codemagic all work before Apple signing is introduced.

After the CI check passes:

1. Create the app in App Store Connect using bundle ID `com.davidwis.moonlightmix` (or change the ID everywhere first).
2. In Codemagic, connect your Apple Developer Portal/App Store Connect API key.
3. Generate or upload an Apple Distribution certificate and App Store provisioning profile.
4. Replace the unsigned `xcodebuild` step with `xcode-project use-profiles` followed by an archive/export command.
5. Add an App Store Connect publishing block.

Codemagic currently recommends an App Store Connect API key with App Manager access and a distribution certificate for TestFlight/App Store publishing. The first workflow is deliberately safer because signing configuration is account-specific.
