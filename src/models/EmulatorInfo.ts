export interface EmulatorInfo {
    name: string;
    isRunning: boolean;
    deviceId?: string;
    source?: "local";
}
