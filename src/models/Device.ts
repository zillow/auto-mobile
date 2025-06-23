export interface Device {
    /** Unique identifier for the device (e.g., device serial, IP:port) */
    id: string;

    /** Human-readable name assigned to the device */
    name: string;

    /** Platform type */
    platform: "android" | "ios";

    /** Device source/provider */
    source: "local" | "device_farm" | "physical";

    /** Whether the device is currently running and available */
    isRunning: boolean;

    /** MAC address if available (useful for device identification) */
    macAddress?: string;

    /** Device model information */
    model?: string;

    /** OS version */
    osVersion?: string;

    /** Screen resolution */
    screenSize?: {
        width: number;
        height: number;
    };

    /** Device capabilities */
    capabilities?: {
        hasCamera?: boolean;
        hasGps?: boolean;
        hasBiometric?: boolean;
        hasNfc?: boolean;
    };

    /** Additional metadata for device management */
    metadata?: {
        [key: string]: any;
    };
}
