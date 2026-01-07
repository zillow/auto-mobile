# Managed Apple IDs and Device Profiles

Managed Apple IDs and configuration profiles are common in enterprise deployments.
They can impose restrictions that affect app installation, network access, and
system behavior.

## Scope

- Managed Apple IDs
- Configuration profiles and device restrictions
- Automation implications

## Managed Apple IDs

Managed Apple IDs are tied to enterprise enrollment and may enforce restrictions
across apps and services. These policies can impact automation flows:

- App installation or update constraints
- Network access policies
- App-to-app data sharing limitations

AutoMobile considerations:

- Surface policy-related failures with clear errors.
- Provide troubleshooting guidance for account or profile restrictions.
- Avoid relying on behaviors that differ between managed and unmanaged IDs.

## Configuration profiles

Profiles can enforce device-wide settings such as VPN, web filtering, and
app launch restrictions.

AutoMobile considerations:

- Detect and report when policies block actions.
- Keep test plans explicit about required profiles.
- Prefer stable selectors in UI that may show policy banners.

## Simulator vs Device

- Simulators do not fully reproduce managed account or profile policies.
- Physical devices are required for reliable validation.

## Limitations

- Policy details vary by organization and MDM vendor.
- Some restrictions are opaque without device-side instrumentation.

## See also

- [Managed App Configuration (MDM)](managed-app-config.md)
- [iOS overview](index.md)
