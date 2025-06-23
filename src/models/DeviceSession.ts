export interface DeviceSession {
    /** Unique session identifier */
    sessionId: string;

    /** Device ID for this session */
    deviceId: string;

    /** ADB port for Android devices (if applicable) */
    adbPort?: number;

    /** Platform type */
    platform: "android" | "ios";

    /** Device source/provider */
    source: "local" | "device_farm" | "physical";

    /** Session start time */
    startTime: Date;

    /** Additional session metadata */
    metadata?: {
        [key: string]: any;
    };
}
