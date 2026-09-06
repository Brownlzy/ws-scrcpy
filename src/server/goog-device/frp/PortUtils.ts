import * as net from 'net';

export class PortUtils {
    public static async isAvailable(host: string, port: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.once('error', () => {
                resolve(false);
            });
            server.once('listening', () => {
                server.close(() => {
                    resolve(true);
                });
            });
            server.listen(port, host);
        });
    }

    public static async waitForReachable(host: string, port: number, timeoutMs: number): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await this.canConnect(host, port)) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error(`Timed out waiting for ${host}:${port}`);
    }

    private static async canConnect(host: string, port: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const socket = net.createConnection({ host, port });
            const done = (value: boolean) => {
                socket.removeAllListeners();
                socket.destroy();
                resolve(value);
            };
            socket.setTimeout(1000);
            socket.once('connect', () => done(true));
            socket.once('timeout', () => done(false));
            socket.once('error', () => done(false));
        });
    }
}
