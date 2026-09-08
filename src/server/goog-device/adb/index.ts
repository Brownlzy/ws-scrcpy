import Adb from '@dead50f7/adbkit/lib/adb';
import { ExtendedClient } from './ExtendedClient';
import { ClientOptions } from '@dead50f7/adbkit/lib/ClientOptions';
import * as path from 'path';
import { Config } from '../../Config';

interface Options {
    host?: string;
    port?: number;
    bin?: string;
}

export class AdbExtended extends Adb {
    static createClient(options: Options = {}): ExtendedClient {
        const opts: ClientOptions = {
            bin: options.bin || this.getExecutablePath(),
            host: options.host || process.env.ADB_HOST || '127.0.0.1',
            port: options.port || 0,
        };
        if (!opts.port) {
            const port = parseInt(process.env.ADB_PORT || '', 10);
            if (!isNaN(port)) {
                opts.port = port;
            } else {
                opts.port = 5037;
            }
        }
        return new ExtendedClient(opts);
    }

    static getExecutablePath(): string {
        return this.resolveExecutablePath(Config.getInstance().frp?.adb.executablePath || 'adb');
    }

    private static resolveExecutablePath(executablePath: string): string {
        if (path.isAbsolute(executablePath)) {
            return executablePath;
        }
        return /[\\/]/.test(executablePath) ? path.resolve(process.cwd(), executablePath) : executablePath;
    }
}
