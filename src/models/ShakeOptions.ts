/**
 * Options for performing a shake operation
 */
export interface ShakeOptions {
    /**
     * Duration of the shake in milliseconds (default: 1000ms)
     */
    duration?: number;

    /**
     * Intensity of the shake acceleration (default: 100)
     * Higher values create more intense shaking
     */
    intensity?: number;
}
