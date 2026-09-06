import * as http from 'http';
import * as https from 'https';
import { FrpAdminConfig } from '../../../types/Configuration';

type RequestOptions = {
    method?: string;
    body?: unknown;
};

export class FrpHttpClient {
    constructor(private readonly config: FrpAdminConfig, private readonly label: string) {}

    public async get<T>(pathname: string): Promise<T> {
        return this.request<T>(pathname);
    }

    public async post<T>(pathname: string, body?: unknown): Promise<T> {
        return this.request<T>(pathname, { method: 'POST', body });
    }

    public async delete<T>(pathname: string): Promise<T> {
        return this.request<T>(pathname, { method: 'DELETE' });
    }

    private async request<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
        const url = new URL(pathname, this.config.baseUrl);
        const body = typeof options.body === 'undefined' ? undefined : JSON.stringify(options.body);
        const headers: Record<string, string | number> = {
            Accept: 'application/json',
        };
        if (body) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        }
        if (this.config.username || this.config.password) {
            const value = Buffer.from(`${this.config.username || ''}:${this.config.password || ''}`).toString('base64');
            headers.Authorization = `Basic ${value}`;
        }

        const transport = url.protocol === 'https:' ? https : http;
        return new Promise<T>((resolve, reject) => {
            const req = transport.request(
                url,
                {
                    method: options.method || 'GET',
                    headers,
                    timeout: this.config.timeoutMs || 5000,
                },
                (res) => {
                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        const statusCode = res.statusCode || 0;
                        if (statusCode < 200 || statusCode >= 300) {
                            reject(new Error(`${this.label} ${url.pathname} failed with ${statusCode}: ${data}`));
                            return;
                        }
                        if (!data) {
                            resolve(undefined as unknown as T);
                            return;
                        }
                        try {
                            resolve(JSON.parse(data) as T);
                        } catch (error: any) {
                            reject(new Error(`${this.label} ${url.pathname} returned invalid JSON: ${error.message}`));
                        }
                    });
                },
            );
            req.on('timeout', () => {
                req.destroy(new Error(`${this.label} ${url.pathname} timed out`));
            });
            req.on('error', reject);
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
}
