import WS from 'ws';
import { Mw, RequestParameters } from '../../mw/Mw';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { ControlCenter } from '../services/ControlCenter';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { DeviceTrackerEvent } from '../../../types/DeviceTrackerEvent';
import { DeviceTrackerEventList } from '../../../types/DeviceTrackerEventList';
import { Multiplexer } from '../../../packages/multiplexer/Multiplexer';
import { ChannelCode } from '../../../common/ChannelCode';

export class DeviceTracker extends Mw {
    public static readonly TAG = 'DeviceTracker';
    public static readonly type = 'android';
    private adt: ControlCenter = ControlCenter.getInstance();
    private readonly id: string;
    private readonly targetUdid?: string;
    private readonly autoConnect: boolean;
    private readonly disconnectOnClose: boolean;
    private autoConnectedUdid?: string;
    private pendingAutoConnectUdid?: string;
    private connectPromise?: Promise<string>;

    public static processChannel(ws: Multiplexer, code: string): Mw | undefined {
        if (code !== ChannelCode.GTRC) {
            return;
        }
        return new DeviceTracker(ws);
    }

    public static processRequest(ws: WS, params: RequestParameters): DeviceTracker | undefined {
        if (params.action !== ACTION.GOOG_DEVICE_LIST) {
            return;
        }
        return new DeviceTracker(ws, {
            targetUdid: params.url.searchParams.get('targetUdid') || undefined,
            autoConnect: params.url.searchParams.get('autoConnect') === 'true',
            disconnectOnClose: params.url.searchParams.get('disconnectOnClose') === 'true',
        });
    }

    constructor(
        ws: WS | Multiplexer,
        options: { targetUdid?: string; autoConnect?: boolean; disconnectOnClose?: boolean } = {},
    ) {
        super(ws);

        this.id = this.adt.getId();
        this.targetUdid = options.targetUdid;
        this.autoConnect = !!options.autoConnect;
        this.disconnectOnClose = !!options.disconnectOnClose;
        this.adt
            .init()
            .then(() => {
                this.adt.on('device', this.sendDeviceMessage);
                const devices = this.filterDevices(this.adt.getDevices());
                this.buildAndSendMessage(devices);
                this.connectTargetIfNeeded(devices);
            })
            .catch((error: Error) => {
                console.error(`[${DeviceTracker.TAG}] Error: ${error.message}`);
            });
    }

    private sendDeviceMessage = (device: GoogDeviceDescriptor): void => {
        if (this.targetUdid && !this.matchesTarget(device, this.targetUdid)) {
            return;
        }
        const data: DeviceTrackerEvent<GoogDeviceDescriptor> = {
            device,
            id: this.id,
            name: this.adt.getName(),
        };
        this.sendMessage({
            id: -1,
            type: 'device',
            data,
        });
        this.connectTargetIfNeeded([device]);
    };

    private buildAndSendMessage = (list: GoogDeviceDescriptor[]): void => {
        const data: DeviceTrackerEventList<GoogDeviceDescriptor> = {
            list,
            id: this.id,
            name: this.adt.getName(),
        };
        this.sendMessage({
            id: -1,
            type: 'devicelist',
            data,
        });
    };

    private filterDevices(list: GoogDeviceDescriptor[]): GoogDeviceDescriptor[] {
        const { targetUdid } = this;
        if (!targetUdid) {
            return list;
        }
        return list.filter((device) => this.matchesTarget(device, targetUdid));
    }

    private matchesTarget(device: GoogDeviceDescriptor, targetUdid: string): boolean {
        return device.udid === targetUdid || device.frpLocalSerial === targetUdid || device.frpServerName === targetUdid;
    }

    private connectTargetIfNeeded(devices: GoogDeviceDescriptor[]): void {
        const { targetUdid } = this;
        if (!targetUdid || !this.autoConnect || this.connectPromise) {
            return;
        }
        const device = devices.find((item) => this.matchesTarget(item, targetUdid));
        if (!device || !device.isFrpRemote || device.frpLocalSerial || device.state !== 'device') {
            return;
        }
        this.pendingAutoConnectUdid = device.udid;
        this.connectPromise = this.adt
            .connectFrpDevice(device.udid)
            .then((serial) => {
                this.autoConnectedUdid = device.udid;
                return serial;
            })
            .catch((error: Error) => {
                this.connectPromise = undefined;
                console.error(`[${DeviceTracker.TAG}] Failed to auto-connect frp device ${device.udid}: ${error.message}`);
                return '';
            });
    }

    protected onSocketMessage(event: WS.MessageEvent): void {
        let command: ControlCenterCommand;
        try {
            command = ControlCenterCommand.fromJSON(event.data.toString());
        } catch (error: any) {
            console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${error?.message}`);
            return;
        }
        this.adt.runCommand(command).catch((e) => {
            console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${e.message}`);
        });
    }

    public release(): void {
        super.release();
        this.adt.off('device', this.sendDeviceMessage);
        const udid = this.autoConnectedUdid;
        if (udid && this.disconnectOnClose) {
            this.adt.disconnectFrpDevice(udid).catch((error: Error) => {
                console.error(`[${DeviceTracker.TAG}] Failed to disconnect frp device ${udid}: ${error.message}`);
            });
            this.autoConnectedUdid = undefined;
        } else if (this.disconnectOnClose && this.connectPromise && this.pendingAutoConnectUdid) {
            const pendingUdid = this.pendingAutoConnectUdid;
            this.connectPromise
                .then(() => {
                    return this.adt.disconnectFrpDevice(pendingUdid);
                })
                .catch(() => undefined);
        }
    }
}
