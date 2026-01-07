# Network state control

## Goal

Provide a single MCP tool to toggle Wi-Fi, cellular, and airplane mode,
plus emulator-friendly latency/bandwidth shaping.

## Proposed MCP tool

```
setNetworkState({
  airplaneMode?: boolean,
  wifi?: boolean,
  cellular?: boolean,
  profile?: "edge" | "umts" | "lte" | "full",
  delayProfile?: "gprs" | "edge" | "umts" | "none"
})
```

Semantics:

- Toggles are applied first (airplane, wifi, cellular).
- Profiles are best-effort on emulators only.
- Response includes `supported` and `applied` fields per sub-action.

## Android implementation

Wi-Fi:

- `adb -s <device> shell svc wifi enable`
- `adb -s <device> shell svc wifi disable`

Cellular:

- `adb -s <device> shell svc data enable`
- `adb -s <device> shell svc data disable`

Airplane mode (preferred, API 29/35 emulators):

- `adb -s <device> shell cmd connectivity airplane-mode enable`
- `adb -s <device> shell cmd connectivity airplane-mode disable`

Airplane mode fallback:

- `adb -s <device> shell settings put global airplane_mode_on 1|0`
- `adb -s <device> shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true|false`

Emulator shaping (API 29/35 emulator only):

- `adb -s <device> emu network speed <profile>`
- `adb -s <device> emu network delay <profile>`

Notes:

- Custom ms/throughput values are not supported by `emu network` and should
  be rejected with a clear error.
- Physical devices often restrict airplane mode toggles; report
  `supported: false` with a reason when blocked.

## Plan

1. Implement toggles with capability reporting.
2. Add emulator shaping support (speed/delay profiles).
3. Expose `getNetworkState` for verification in assertions.

## Risks

- OEM images may block `cmd connectivity airplane-mode`.
- Work profile behavior can differ from personal profile toggles.
