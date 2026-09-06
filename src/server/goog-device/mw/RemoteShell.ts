import WS from 'ws';
import { Mw, RequestParameters } from '../../mw/Mw';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { Message } from '../../../types/Message';
import { XtermClientMessage, XtermServiceParameters } from '../../../types/XtermMessage';
import { ACTION } from '../../../common/Action';
import { Multiplexer } from '../../../packages/multiplexer/Multiplexer';
import { ChannelCode } from '../../../common/ChannelCode';

const EVENT_TYPE_SHELL = 'shell';

export class RemoteShell extends Mw {
    public static readonly TAG = 'RemoteShell';
    private term?: ChildProcessWithoutNullStreams;
    private initialized = false;
    private timeoutString: NodeJS.Timeout | null = null;
    private timeoutBuffer: NodeJS.Timeout | null = null;
    private terminated = false;
    private closeCode = 1000;
    private closeReason = '';

    public static processChannel(ws: Multiplexer, code: string): Mw | undefined {
        if (code !== ChannelCode.SHEL) {
            return;
        }
        return new RemoteShell(ws);
    }

    public static processRequest(ws: WS, params: RequestParameters): RemoteShell | undefined {
        if (params.action !== ACTION.SHELL) {
            return;
        }
        return new RemoteShell(ws);
    }

    constructor(protected ws: WS | Multiplexer) {
        super(ws);
    }

    public createTerminal(params: XtermServiceParameters): ChildProcessWithoutNullStreams {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = Object.assign({}, process.env) as any;
        env['COLORTERM'] = 'truecolor';
        const cwd = params.cwd || env.PWD || process.cwd();
        const term = spawn('adb', ['-s', params.udid, 'shell', '-t', '-t'], {
            cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const send = this.bufferUtf8(5);
        term.stdout.on('data', send);
        term.stderr.on('data', send);
        term.on('close', (code: number) => {
            if (code === 0) {
                this.closeCode = 1000;
            } else {
                this.closeCode = 4500;
            }
            this.closeReason = `[${[RemoteShell.TAG]}] terminal process exited with code: ${code}`;
            if (this.timeoutString || this.timeoutBuffer) {
                this.terminated = true;
            } else {
                this.ws.close(this.closeCode, this.closeReason);
            }
        });
        return term;
    }

    protected onSocketMessage(event: WS.MessageEvent): void {
        if (this.initialized) {
            if (!this.term) {
                return;
            }
            this.term.stdin.write(this.getInput(event.data));
            return;
        }
        let data;
        try {
            data = JSON.parse(event.data.toString());
        } catch (error: any) {
            console.error(`[${RemoteShell.TAG}]`, error?.message);
            return;
        }
        this.handleMessage(data as Message).catch((error: Error) => {
            console.error(`[${RemoteShell.TAG}]`, error.message);
        });
    }

    private handleMessage = async (message: Message): Promise<void> => {
        if (message.type !== EVENT_TYPE_SHELL) {
            return;
        }
        const data: XtermClientMessage = message.data as XtermClientMessage;
        const { type } = data;
        if (type === 'start') {
            this.term = this.createTerminal(data);
            this.initialized = true;
        }
        if (type === 'stop') {
            this.release();
        }
    };

    private getInput(data: string | Buffer | ArrayBuffer | Buffer[]): string | Buffer {
        if (typeof data === 'string') {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data);
        }
        if (Array.isArray(data)) {
            return Buffer.concat(data);
        }
        return data;
    }

    private bufferUtf8(timeout: number): (data: Buffer) => void {
        let buffer: Buffer[] = [];
        let length = 0;
        return (data: Buffer) => {
            buffer.push(data);
            length += data.length;
            if (!this.timeoutBuffer) {
                this.timeoutBuffer = setTimeout(() => {
                    this.ws.send(Buffer.concat(buffer, length));
                    buffer = [];
                    this.timeoutBuffer = null;
                    length = 0;
                    if (this.terminated) {
                        this.ws.close(this.closeCode, this.closeReason);
                    }
                }, timeout);
            }
        };
    }

    public release(): void {
        super.release();
        if (this.timeoutBuffer) {
            clearTimeout(this.timeoutBuffer);
        }
        if (this.timeoutString) {
            clearTimeout(this.timeoutString);
        }
        if (this.term) {
            this.term.kill();
        }
    }
}
