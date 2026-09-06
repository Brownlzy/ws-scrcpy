import { FrpAdminConfig } from '../../../types/Configuration';
import { FrpHttpClient } from './FrpHttpClient';

export type FrpsProxyStats = {
    name: string;
    status: string;
    conf?: unknown;
    curConns?: number;
    lastStartTime?: string;
    lastCloseTime?: string;
};

type ProxyListResponse = {
    proxies: FrpsProxyStats[];
};

export class FrpsAdminClient {
    private readonly http: FrpHttpClient;

    constructor(config: FrpAdminConfig) {
        this.http = new FrpHttpClient(config, 'frps');
    }

    public async healthz(): Promise<void> {
        await this.http.get<string>('/healthz');
    }

    public async listStcpProxies(): Promise<FrpsProxyStats[]> {
        const response = await this.http.get<ProxyListResponse>('/api/proxy/stcp');
        return response?.proxies || [];
    }

    public async getProxy(name: string): Promise<FrpsProxyStats> {
        return this.http.get<FrpsProxyStats>(`/api/proxy/stcp/${encodeURIComponent(name)}`);
    }
}
