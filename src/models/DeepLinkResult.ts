export interface IntentFilter {
    action: string;
    category: string[];
    data?: {
        scheme?: string;
        host?: string;
        port?: string;
        path?: string;
        pathPattern?: string;
        pathPrefix?: string;
        mimeType?: string;
    }[];
}

export interface DeepLinkInfo {
    schemes: string[];
    hosts: string[];
    intentFilters: IntentFilter[];
    supportedMimeTypes: string[];
}

export interface DeepLinkResult {
    success: boolean;
    appId: string;
    deepLinks: DeepLinkInfo;
    rawOutput?: string;
    error?: string;
}
