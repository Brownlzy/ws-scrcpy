import { TypedEmitter } from '../../../common/TypedEmitter';
import { FrpConfig } from '../../../types/Configuration';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { DeviceState } from '../../../common/DeviceState';
import { FrpsAdminClient } from './FrpsAdminClient';
import { FrpAdbTunnelManager } from './FrpAdbTunnelManager';

type FrpRemoteDeviceEvents = {
    device: GoogDeviceDescriptor;
};

export class FrpRemoteDeviceService extends TypedEmitter<FrpRemoteDeviceEvents> {
    private readonly frps: FrpsAdminClient;
    private readonly tunnelManager: FrpAdbTunnelManager;
    private readonly descriptors = new Map<string, GoogDeviceDescriptor>();
    private readonly mappedDescriptors = new Map<string, GoogDeviceDescriptor>();

    constructor(private readonly config: FrpConfig) {
        super();
        this.frps = new FrpsAdminClient(config.frps);
        this.tunnelManager = new FrpAdbTunnelManager(
            config.frpc as Required<FrpConfig['frpc']>,
            config.adb as Required<FrpConfig['adb']>,
        );
    }

    public async init(): Promise<void> {
        await this.refresh().catch((error: Error) => {
            console.error(`[FrpRemoteDeviceService] initial refresh failed: ${error.message}`);
            return [];
        });
        this.tunnelManager.cleanupStaleConfigs();
    }

    public async refresh(): Promise<GoogDeviceDescriptor[]> {
        const prefix = this.config.adb.serverNamePrefix || 'adb_';
        const proxies = await this.frps.listStcpProxies();
        const seen = new Set<string>();
        proxies.forEach((proxy) => {
            if (!proxy.name.startsWith(prefix)) {
                return;
            }
            const udid = proxy.name.slice(prefix.length);
            seen.add(udid);
            const descriptor = this.createDescriptor(
                udid,
                proxy.name,
                proxy.status === 'online' ? DeviceState.DEVICE : proxy.status,
            );
            this.descriptors.set(udid, descriptor);
            this.emit('device', descriptor);
        });
        Array.from(this.descriptors.keys()).forEach((udid) => {
            if (!seen.has(udid)) {
                const old = this.descriptors.get(udid);
                if (old) {
                    const descriptor = this.createDescriptor(
                        udid,
                        old.frpServerName || `${prefix}${udid}`,
                        DeviceState.DISCONNECTED,
                    );
                    this.descriptors.set(udid, descriptor);
                    this.emit('device', descriptor);
                }
            }
        });
        return this.getDevices();
    }

    public getDevices(): GoogDeviceDescriptor[] {
        return Array.from(this.descriptors.values());
    }

    public async connect(udid: string): Promise<string> {
        let descriptor = this.descriptors.get(udid);
        if (!descriptor) {
            await this.refresh();
            descriptor = this.descriptors.get(udid);
        }
        if (!descriptor) {
            throw new Error(`Remote frp device not found: ${udid}`);
        }
        const serial = await this.tunnelManager.connect(udid, descriptor.frpServerName);
        const updated = this.createDescriptor(udid, descriptor.frpServerName || '', DeviceState.DEVICE);
        this.applyTunnelInfo(updated);
        this.descriptors.set(udid, updated);
        this.emit('device', updated);
        return serial;
    }

    public async disconnect(udidOrSerial: string): Promise<void> {
        const session = this.tunnelManager.getSession(udidOrSerial);
        await this.tunnelManager.disconnect(udidOrSerial);
        const udid = session?.udid || udidOrSerial;
        const descriptor = this.descriptors.get(udid);
        if (descriptor) {
            const serverName = descriptor.frpServerName || `${this.config.adb.serverNamePrefix}${udid}`;
            this.mappedDescriptors.delete(udid);
            const updated = this.createDescriptor(udid, serverName, DeviceState.DEVICE);
            this.descriptors.set(udid, updated);
            this.emit('device', updated);
        }
    }

    public isManagedSerial(serial: string): boolean {
        return this.tunnelManager.isManagedSerial(serial);
    }

    public updateMappedDevice(localDescriptor: GoogDeviceDescriptor): void {
        const session = this.tunnelManager.getSessionBySerial(localDescriptor.udid);
        if (!session) {
            return;
        }
        const current = this.descriptors.get(session.udid);
        const descriptor: GoogDeviceDescriptor = {
            ...localDescriptor,
            udid: session.udid,
            isFrpRemote: true,
            frpServerName: current?.frpServerName || `${this.config.adb.serverNamePrefix}${session.udid}`,
        };
        this.applyTunnelInfo(descriptor);
        this.mappedDescriptors.set(session.udid, descriptor);
        this.descriptors.set(session.udid, descriptor);
        this.emit('device', descriptor);
    }

    public release(): void {
        this.tunnelManager.release();
    }

    private createDescriptor(udid: string, serverName: string, state: string): GoogDeviceDescriptor {
        const mapped = this.mappedDescriptors.get(udid);
        const descriptor: GoogDeviceDescriptor = {
            ...mapped,
            udid,
            state: mapped?.state || state,
            interfaces: [],
            pid: -1,
            'wifi.interface': '',
            'ro.build.version.release': '',
            'ro.build.version.sdk': '',
            'ro.product.manufacturer': 'frp',
            'ro.product.model': udid,
            'ro.product.cpu.abi': '',
            'last.update.timestamp': Date.now(),
            ...mapped,
            isFrpRemote: true,
            frpServerName: serverName,
            frpStatus: mapped?.frpStatus || state,
        };
        this.applyTunnelInfo(descriptor);
        return descriptor;
    }

    private applyTunnelInfo(descriptor: GoogDeviceDescriptor): void {
        const session = this.tunnelManager.getSession(descriptor.udid);
        if (!session) {
            return;
        }
        descriptor.frpLocalSerial = session.serial;
        descriptor.frpLocalPort = session.port;
        descriptor.frpVisitorName = session.visitorName;
        descriptor.frpPid = session.pid;
        descriptor.state = DeviceState.DEVICE;
        descriptor.frpStatus = 'connected';
    }
}
