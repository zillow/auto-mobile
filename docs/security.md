# Security

Zillow Group takes the security of our software products and services seriously, which includes all source code repositories in our GitHub organizations.

**Please do not report security vulnerabilities through public GitHub issues.**

To report security issues, please follow [Zillow Group's Responsible Disclosure](https://www.zillowgroup.com/security/disclosure/).

## Responsible Use Disclaimer

AutoMobile is an experimental software project designed to enable AI agent interaction with mobile devices. See [LICENSE](https://github.com/kaeawc/auto-mobile/blob/main/LICENSE).

## Warnings and Limitations

Security Risks

- AutoMobile executes system-level commands and accesses device internals
- The software may expose sensitive device information and system functions
- Shell command execution capabilities present potential security vulnerabilities
- No security audits have been performed on this experimental codebase

Not Intended for Production

- This software is experimental and not intended for production environments
- No stability, reliability, or performance guarantees are provided
- Features may change or be removed without notice
- Testing and validation remain incomplete

Device and Data Risks

- AutoMobile accesses and manipulates mobile device functions
- Risk of unintended device modifications or data loss
- Screenshot and UI hierarchy data may contain sensitive information
- App installation, removal, and data manipulation capabilities present data risks

## Responsible Use Requirements

- Use only on devices you own or have explicit permission to test
- Do not use on devices containing sensitive or production data
- Implement appropriate security measures in your testing environment, do not expose AutoMobile as a networked MCP.
- Comply with all applicable laws and regulations
- Obtain necessary approvals before deployment in any organizational context

## Implementation References

- ADB shell command execution: https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/AdbClient.ts#L1-L260
- Screenshot capture: https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/TakeScreenshot.ts#L1-L230
- View hierarchy collection: https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/ViewHierarchy.ts#L1-L220
- App install: https://github.com/kaeawc/auto-mobile/blob/main/src/features/action/InstallApp.ts#L1-L84
- App uninstall: https://github.com/kaeawc/auto-mobile/blob/main/src/features/action/UninstallApp.ts#L1-L199
- Clear app data: https://github.com/kaeawc/auto-mobile/blob/main/src/features/action/ClearAppData.ts#L1-L70
