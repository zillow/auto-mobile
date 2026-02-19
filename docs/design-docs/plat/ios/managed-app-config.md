# Managed App Configuration

<kbd>🚧 Design Only</kbd>

> **Current state:** This page provides guidance for testing in MDM-managed environments. AutoMobile has no specific implementation for detecting or surfacing Managed App Configuration state. Physical devices are required; simulators do not reproduce MDM behavior. See the [Status Glossary](../../status-glossary.md) for chip definitions.

MDM-managed devices can deliver Managed App Configuration values to apps. These
settings are surfaced through `UserDefaults` under `com.apple.configuration.managed`.
AutoMobile should behave predictably when managed configuration is present.

## Scope

- MDM-managed devices and policies
- Managed App Configuration payloads
- Simulator limitations vs physical device behavior

## Managed App Configuration

Managed App Config is delivered by MDM and read by apps at runtime. It can:

- Change app behavior based on enterprise policy
- Toggle features or endpoints
- Inject environment-specific values

AutoMobile considerations:

- Support reading managed configuration values when the app exposes them for automation.
- Provide guidance for test apps to surface managed config state in UI where needed.
- Avoid assumptions about defaults when managed config is present.

## MDM policy effects

MDM policies can affect automation flows:

- App install restrictions
- App launch policies and per-app VPN
- Network access limitations
- Restrictions on data sharing

AutoMobile considerations:

- Detect and surface policy-related errors when install/launch fails.
- Provide troubleshooting guidance for profile-caused failures.
- Track which policies are active when tests run (if observable).

## Simulator vs Device

- Simulators do not fully emulate MDM or managed configuration policies.
- Physical devices are required to validate Managed App Config behavior.
- Test plans should document when a scenario requires a managed device.

## Limitations

- Access to MDM state is limited without device-side instrumentation.
- Policies vary by organization and MDM vendor.

## See also

- [Managed Apple IDs and profiles](managed-apple-ids.md)
- [iOS overview](index.md)
