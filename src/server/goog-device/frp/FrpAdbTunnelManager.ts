import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { FrpAdbConfig, FrpcProcessConfig } from '../../../types/Configuration';
import { PortUtils } from './PortUtils';

type TunnelSession = {
    udid: string;
    serial: string;
    port: number;
    visitorName: string;
    configPath: string;
    proc: ChildProcess;
    pid?: number;
};

export type FrpTunnelInfo = {
    udid: string;
    serial: string;
    port: number;
    visitorName: string;
    pid?: number;
};

export class FrpAdbTunnelManager {
    private readonly sessions = new Map<string, TunnelSession>();
    private readonly tempConfigDir: string;
    private readonly executablePath: string;
    private readonly adbExecutablePath: string;

    constructor(private readonly frpc: Required<FrpcProcessConfig>, private readonly config: Required<FrpAdbConfig>) {
        this.tempConfigDir = path.resolve(process.cwd(), frpc.tempConfigDir);
        this.executablePath = path.resolve(process.cwd(), frpc.executablePath);
        this.adbExecutablePath = this.resolveExecutablePath(config.executablePath);
        console.log(`[FrpAdbTunnelManager] frpc executable "${this.executablePath}"`);
        console.log(`[FrpAdbTunnelManager] adb executable "${this.adbExecutablePath}"`);
    }

    public async connect(udid: string, serverName?: string): Promise<string> {
        const old = this.sessions.get(udid);
        if (old) {
            return old.serial;
        }
        const port = await this.allocatePort();
        const visitorName = this.createVisitorName(udid);
        const bindAddr = this.config.bindAddr;
        const serial = `${bindAddr}:${port}`;
        const configPath = this.createConfigPath(visitorName);
        const content = this.createConfig({
            bindAddr,
            bindPort: port,
            serverName: serverName || `${this.config.serverNamePrefix}${udid}`,
            visitorName,
        });

        fs.mkdirSync(this.tempConfigDir, { recursive: true });
        fs.writeFileSync(configPath, content);

        const proc = spawn(this.executablePath, ['-c', configPath], {
            cwd: path.dirname(this.executablePath),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const session: TunnelSession = { udid, serial, port, visitorName, configPath, proc };
        proc.once('spawn', () => {
            session.pid = proc.pid;
            console.log(`[FrpAdbTunnelManager] started frpc pid=${proc.pid} visitor=${visitorName}`);
        });
        proc.stdout.on('data', (data) => {
            console.log(`[FrpAdbTunnelManager:${visitorName}] ${data.toString().trim()}`);
        });
        proc.stderr.on('data', (data) => {
            console.error(`[FrpAdbTunnelManager:${visitorName}] ${data.toString().trim()}`);
        });
        proc.once('error', async (error) => {
            await this.cleanupSession(session);
            console.error(`[FrpAdbTunnelManager] failed to start frpc for ${udid}: ${error.message}`);
        });
        proc.once('exit', (code, signal) => {
            console.log(`[FrpAdbTunnelManager] frpc exited visitor=${visitorName} code=${code} signal=${signal}`);
        });

        this.sessions.set(udid, session);
        try {
            await PortUtils.waitForReachable(bindAddr, port, this.config.connectTimeoutMs);
            const output = await this.adb(['connect', serial], this.config.connectTimeoutMs);
            if (/failed|unable|cannot/i.test(output)) {
                throw new Error(`adb connect ${serial} failed: ${output.trim()}`);
            }
            await this.waitForAdbDevice(serial);
        } catch (error) {
            this.sessions.delete(udid);
            await this.cleanupSession(session);
            throw error;
        }

        return serial;
    }

    public getSession(udid: string): FrpTunnelInfo | undefined {
        const session = this.sessions.get(udid);
        return session ? this.toInfo(session) : undefined;
    }

    public getSessionBySerial(serial: string): FrpTunnelInfo | undefined {
        const session = this.findBySerial(serial);
        return session ? this.toInfo(session) : undefined;
    }

    public isManagedSerial(serial: string): boolean {
        return !!this.findBySerial(serial);
    }

    public async disconnect(udidOrSerial: string): Promise<void> {
        const session = this.sessions.get(udidOrSerial) || this.findBySerial(udidOrSerial);
        if (!session) {
            return;
        }
        this.sessions.delete(session.udid);
        await this.cleanupSession(session);
    }

    public cleanupStaleConfigs(): void {
        if (!fs.existsSync(this.tempConfigDir)) {
            return;
        }
        fs.readdirSync(this.tempConfigDir)
            .filter((name) => name.startsWith(this.config.visitorNamePrefix) && name.endsWith('.toml'))
            .forEach((name) => {
                this.removeFile(path.join(this.tempConfigDir, name));
            });
    }

    public release(): void {
        Array.from(this.sessions.keys()).forEach((udid) => {
            this.disconnect(udid).catch((error: Error) => {
                console.error(`[FrpAdbTunnelManager] release cleanup failed for ${udid}: ${error.message}`);
            });
        });
    }

    private async cleanupSession(session: TunnelSession): Promise<void> {
        await this.adb(['disconnect', session.serial], 5000).catch(() => undefined);
        if (!session.proc.killed) {
            session.proc.kill();
        }
        this.removeFile(session.configPath);
    }

    private findBySerial(serial: string): TunnelSession | undefined {
        for (const session of this.sessions.values()) {
            if (session.serial === serial) {
                return session;
            }
        }
        return;
    }

    private toInfo(session: TunnelSession): FrpTunnelInfo {
        return {
            udid: session.udid,
            serial: session.serial,
            port: session.port,
            visitorName: session.visitorName,
            pid: session.pid,
        };
    }

    private async allocatePort(): Promise<number> {
        const { start, end } = this.config.portRange;
        for (let i = 0; i < 50; i++) {
            const port = start + Math.floor(Math.random() * (end - start + 1));
            if (await PortUtils.isAvailable(this.config.bindAddr, port)) {
                return port;
            }
        }
        throw new Error(`Unable to allocate available port in range ${start}-${end}`);
    }

    private createVisitorName(udid: string): string {
        const safeUdid = udid.replace(/[^a-zA-Z0-9_-]/g, '_');
        const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
        return `${this.config.visitorNamePrefix}${safeUdid}_${Date.now()}_${suffix}`;
    }

    private removeFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    private resolveExecutablePath(executablePath: string): string {
        if (path.isAbsolute(executablePath)) {
            return executablePath;
        }
        return /[\\/]/.test(executablePath) ? path.resolve(process.cwd(), executablePath) : executablePath;
    }

    private createConfigPath(visitorName: string): string {
        return path.join(this.tempConfigDir, `${visitorName}.toml`);
    }

    private createConfig(params: {
        visitorName: string;
        serverName: string;
        bindAddr: string;
        bindPort: number;
    }): string {
        const dnsServer = this.frpc.dnsServer ? `dnsServer = "${this.escapeToml(this.frpc.dnsServer)}"\n` : '';
        return (
            `serverAddr = "${this.escapeToml(this.frpc.serverAddr)}"\n` +
            `serverPort = ${this.frpc.serverPort}\n` +
            dnsServer +
            '\n' +
            '[auth]\n' +
            `token = "${this.escapeToml(this.frpc.authToken)}"\n` +
            '\n' +
            '[[visitors]]\n' +
            `name = "${this.escapeToml(params.visitorName)}"\n` +
            'type = "stcp"\n' +
            `serverName = "${this.escapeToml(params.serverName)}"\n` +
            `secretKey = "${this.escapeToml(this.config.secretKey)}"\n` +
            `bindAddr = "${this.escapeToml(params.bindAddr)}"\n` +
            `bindPort = ${params.bindPort}\n`
        );
    }

    private escapeToml(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    private async adb(args: string[], timeoutMs: number): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const proc = spawn(this.adbExecutablePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            let errorOutput = '';
            const timeout = setTimeout(() => {
                proc.kill();
                reject(new Error(`${this.adbExecutablePath} ${args.join(' ')} timed out`));
            }, timeoutMs);
            proc.stdout.on('data', (data) => {
                output += data.toString();
            });
            proc.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            proc.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            proc.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve(output);
                    return;
                }
                reject(new Error(`${this.adbExecutablePath} ${args.join(' ')} failed with ${code}: ${errorOutput || output}`));
            });
        });
    }

    private async waitForAdbDevice(serial: string): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < this.config.connectTimeoutMs) {
            const output = await this.adb(['devices'], 5000);
            const found = output
                .split('\n')
                .some((line) => line.trim().startsWith(serial) && line.includes('\tdevice'));
            if (found) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(`Timed out waiting for adb device ${serial}`);
    }
}
