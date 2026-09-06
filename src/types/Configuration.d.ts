import * as https from 'https';

export type OperatingSystem = 'android' | 'ios';

export interface HostItem {
    type: OperatingSystem;
    secure: boolean;
    hostname: string;
    port: number;
    pathname?: string;
    useProxy?: boolean;
}

export interface HostsItem {
    type: OperatingSystem | OperatingSystem[];
    secure: boolean;
    hostname: string;
    port: number;
    pathname?: string;
    useProxy?: boolean;
}

export type ExtendedServerOption = https.ServerOptions & {
    certPath?: string;
    keyPath?: string;
};

export interface ServerItem {
    secure: boolean;
    port: number;
    options?: ExtendedServerOption;
    redirectToSecure?:
        | {
              port?: number;
              host?: string;
          }
        | boolean;
}

export interface FrpAdminConfig {
    baseUrl: string;
    username?: string;
    password?: string;
    timeoutMs?: number;
}

export interface FrpcProcessConfig {
    executablePath: string;
    tempConfigDir?: string;
    serverAddr: string;
    serverPort: number;
    dnsServer?: string;
    authToken: string;
}

export interface FrpAdbConfig {
    executablePath?: string;
    bindAddr?: string;
    portRange?: {
        start: number;
        end: number;
    };
    connectTimeoutMs?: number;
    idleTimeoutMs?: number;
    secretKey: string;
    serverNamePrefix?: string;
    visitorNamePrefix?: string;
}

export interface FrpConfig {
    enabled?: boolean;
    frps: FrpAdminConfig;
    frpc: FrpcProcessConfig;
    adb: FrpAdbConfig;
}

// The configuration file must contain a single object with this structure
export interface Configuration {
    server?: ServerItem[];
    runApplTracker?: boolean;
    announceApplTracker?: boolean;
    runGoogTracker?: boolean;
    announceGoogTracker?: boolean;
    remoteHostList?: HostsItem[];
    frp?: FrpConfig;
}
