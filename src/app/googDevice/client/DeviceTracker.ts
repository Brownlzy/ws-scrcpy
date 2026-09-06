import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { SERVER_PORT } from '../../../common/Constants';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { StreamClientScrcpy } from './StreamClientScrcpy';
import SvgImage from '../../ui/SvgImage';
import { html } from '../../ui/HtmlTag';
import Util from '../../Util';
import { Attribute } from '../../Attribute';
import { DeviceState } from '../../../common/DeviceState';
import { Message } from '../../../types/Message';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { Tool } from '../../client/Tool';

type Field = keyof GoogDeviceDescriptor | ((descriptor: GoogDeviceDescriptor) => string);
type DescriptionColumn = { title: string; field: Field };

const DESC_COLUMNS: DescriptionColumn[] = [
    {
        title: 'Net Interface',
        field: 'interfaces',
    },
    {
        title: 'Server PID',
        field: 'pid',
    },
];

export class DeviceTracker extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    public static readonly CREATE_DIRECT_LINKS = true;
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();
    protected static tools: Set<Tool> = new Set();
    protected tableId = 'goog_device_list';
    private searchText = '';

    public static start(hostItem: HostItem): DeviceTracker {
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceTracker(hostItem, url);
        }
        return instance;
    }

    public static getInstance(hostItem: HostItem): DeviceTracker {
        return this.start(hostItem);
    }

    protected constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.buildDeviceTable();
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // nothing here;
    }

    protected setIdAndHostName(id: string, hostName: string): void {
        super.setIdAndHostName(id, hostName);
        for (const value of DeviceTracker.instancesByUrl.values()) {
            if (value.id === id && value !== this) {
                console.warn(
                    `Tracker with url: "${this.url}" has the same id(${this.id}) as tracker with url "${value.url}"`,
                );
                console.warn(`This tracker will shut down`);
                this.destroy();
            }
        }
    }

    onInterfaceSelected = (event: Event): void => {
        const selectElement = event.currentTarget as HTMLSelectElement;
        const option = selectElement.selectedOptions[0];
        const url = decodeURI(option.getAttribute(Attribute.URL) || '');
        const name = option.getAttribute(Attribute.NAME) || '';
        const fullName = decodeURIComponent(selectElement.getAttribute(Attribute.FULL_NAME) || '');
        const udid = selectElement.getAttribute(Attribute.UDID) || '';
        this.updateLink({ url, name, fullName, udid, store: true });
    };

    private updateLink(params: { url: string; name: string; fullName: string; udid: string; store: boolean }): void {
        const { url, name, fullName, udid, store } = params;
        const playerTds = document.getElementsByName(
            encodeURIComponent(`${DeviceTracker.AttributePrefixPlayerFor}${fullName}`),
        );
        if (typeof udid !== 'string') {
            return;
        }
        if (store) {
            const localStorageKey = DeviceTracker.getLocalStorageKey(fullName || '');
            if (localStorage && name) {
                localStorage.setItem(localStorageKey, name);
            }
        }
        const action = ACTION.STREAM_SCRCPY;
        playerTds.forEach((item) => {
            item.innerHTML = '';
            const playerFullName = item.getAttribute(DeviceTracker.AttributePlayerFullName);
            const playerCodeName = item.getAttribute(DeviceTracker.AttributePlayerCodeName);
            if (!playerFullName || !playerCodeName) {
                return;
            }
            const link = DeviceTracker.buildLink(
                {
                    action,
                    udid,
                    player: decodeURIComponent(playerCodeName),
                    ws: url,
                    fitToScreen: true,
                },
                decodeURIComponent(playerFullName),
                this.params,
            );
            item.appendChild(link);
        });
    }

    onActionButtonClick = (event: MouseEvent): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        const pidString = button.getAttribute(Attribute.PID) || '';
        const command = button.getAttribute(Attribute.COMMAND) as string;
        const pid = parseInt(pidString, 10);
        const data: Message = {
            id: this.getNextId(),
            type: command,
            data: {
                udid: typeof udid === 'string' ? udid : undefined,
                pid: isNaN(pid) ? undefined : pid,
            },
        };

        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    };

    private static getLocalStorageKey(udid: string): string {
        return `device_list::${udid}::interface`;
    }

    protected buildDeviceTable(): void {
        const frpDevices = this.descriptors.filter((descriptor) => descriptor.isFrpRemote);
        if (!frpDevices.length) {
            super.buildDeviceTable();
            return;
        }
        this.buildFrpDeviceCards(frpDevices);
    }

    private buildFrpDeviceCards(devices: GoogDeviceDescriptor[]): void {
        const holder = this.getOrCreateTableHolder();
        let root = document.getElementById(this.elementId);
        if (!root) {
            root = document.createElement('div');
            root.id = this.elementId;
            root.className = 'frp-device-board';
            holder.appendChild(root);
        }
        root.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'tracker-name';
        title.innerText = this.trackerName;
        root.appendChild(title);

        const search = this.createSearchInput();
        root.appendChild(search);

        const filtered = this.filterFrpDevices(devices);
        const connected = filtered.filter((device) => device.frpLocalSerial);
        const available = filtered.filter((device) => !device.frpLocalSerial);

        root.appendChild(this.createSection('Connected frp', connected, true));
        root.appendChild(this.createSection('Available frp devices', available, false));
    }

    private createSearchInput(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'frp-search';
        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search device id';
        input.value = this.searchText;
        input.oninput = () => {
            this.searchText = input.value;
            this.buildDeviceTable();
            const next = document.getElementById(input.id) as HTMLInputElement | null;
            next?.focus();
        };
        input.id = `${this.elementId}_frp_search`;
        wrapper.appendChild(input);
        const refresh = document.createElement('button');
        refresh.className = 'action-button active frp-refresh';
        refresh.innerText = 'Refresh';
        refresh.title = 'Refresh frp device list';
        refresh.setAttribute(Attribute.COMMAND, ControlCenterCommand.REFRESH_FRP_DEVICES);
        refresh.onclick = this.onActionButtonClick;
        wrapper.appendChild(refresh);
        return wrapper;
    }

    private filterFrpDevices(devices: GoogDeviceDescriptor[]): GoogDeviceDescriptor[] {
        const query = this.searchText.trim().toLowerCase();
        if (!query) {
            return devices;
        }
        return devices.filter((device) => {
            return (
                device.udid.toLowerCase().includes(query) ||
                (device.frpLocalSerial || '').toLowerCase().includes(query) ||
                (device.frpServerName || '').toLowerCase().includes(query)
            );
        });
    }

    private createSection(titleText: string, devices: GoogDeviceDescriptor[], connected: boolean): HTMLElement {
        const section = document.createElement('section');
        section.className = connected ? 'frp-section connected' : 'frp-section available';
        const title = document.createElement('div');
        title.className = 'frp-section-title';
        title.innerText = `${titleText} (${devices.length})`;
        section.appendChild(title);
        const flow = document.createElement('div');
        flow.className = connected ? 'frp-connected-list' : 'frp-flow-row';
        devices.forEach((device) => {
            flow.appendChild(connected ? this.createConnectedCard(device) : this.createAvailableCard(device));
        });
        if (!devices.length) {
            const empty = document.createElement('div');
            empty.className = 'frp-empty';
            empty.innerText = connected ? 'No connected frp devices' : 'No matching frp devices';
            flow.appendChild(empty);
        }
        section.appendChild(flow);
        return section;
    }

    private createAvailableCard(device: GoogDeviceDescriptor): HTMLElement {
        const card = document.createElement('div');
        card.className = `frp-card available ${device.state === DeviceState.DEVICE ? 'active' : 'not-active'}`;
        card.appendChild(this.createCardHeader(device));

        const button = document.createElement('button');
        button.className = 'action-button active';
        button.innerText = 'Connect frp';
        button.title = `Connect through frp`;
        button.disabled = device.state !== DeviceState.DEVICE;
        button.setAttribute(Attribute.UDID, device.udid);
        button.setAttribute(Attribute.COMMAND, ControlCenterCommand.CONNECT_FRP_DEVICE);
        button.onclick = this.onActionButtonClick;
        card.appendChild(button);
        return card;
    }

    private createConnectedCard(device: GoogDeviceDescriptor): HTMLElement {
        const row = document.createElement('div');
        row.className = 'frp-connected-row';

        const id = document.createElement('div');
        id.className = 'frp-connected-id';
        id.innerText = device.udid;
        row.appendChild(id);

        const meta = document.createElement('div');
        meta.className = 'frp-connected-meta';
        meta.innerText = `${device.frpLocalSerial || ''}${device.frpPid ? ` / frpc ${device.frpPid}` : ''}`;
        row.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'frp-connected-actions';
        this.appendConnectedActions(actions, device);
        row.appendChild(actions);

        return row;
    }

    private createCardHeader(device: GoogDeviceDescriptor): HTMLElement {
        const header = document.createElement('div');
        header.className = 'frp-card-header';
        const id = document.createElement('div');
        id.className = 'frp-card-id';
        id.innerText = device.udid;
        header.appendChild(id);
        const state = document.createElement('div');
        state.className = `frp-card-state ${device.state === DeviceState.DEVICE ? 'online' : 'offline'}`;
        state.innerText = device.state === DeviceState.DEVICE ? 'online' : device.state;
        header.appendChild(state);
        return header;
    }

    private appendConnectedActions(parent: HTMLElement, device: GoogDeviceDescriptor): void {
        const effectiveUdid = device.frpLocalSerial || device.udid;
        const adbDevice = { ...device, udid: effectiveUdid };
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;

        parent.appendChild(this.createServerButton(adbDevice));

        DeviceTracker.tools.forEach((tool) => {
            const entry = tool.createEntryForDeviceList(adbDevice, 'frp-action', this.params);
            if (Array.isArray(entry)) {
                entry.forEach((item) => item && parent.appendChild(item));
            } else if (entry) {
                parent.appendChild(entry);
            }
        });

        const streamEntry = StreamClientScrcpy.createEntryForDeviceList(adbDevice, 'frp-action', fullName, this.params);
        streamEntry && parent.appendChild(streamEntry);
        this.appendStreamLinks(parent, effectiveUdid, fullName);

        const disconnect = document.createElement('button');
        disconnect.className = 'action-button active frp-action';
        disconnect.innerText = 'Disconnect';
        disconnect.title = `Disconnect frp tunnel ${device.frpLocalSerial}`;
        disconnect.setAttribute(Attribute.UDID, device.udid);
        disconnect.setAttribute(Attribute.COMMAND, ControlCenterCommand.DISCONNECT_FRP_DEVICE);
        disconnect.onclick = this.onActionButtonClick;
        parent.appendChild(disconnect);
    }

    private createServerButton(device: GoogDeviceDescriptor): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'action-button active frp-action';
        button.setAttribute(Attribute.UDID, device.udid);
        const pid = device.pid;
        if (pid && pid !== -1) {
            button.innerText = 'Kill server';
            button.title = `Kill scrcpy server ${pid}`;
            button.setAttribute(Attribute.PID, pid.toString(10));
            button.setAttribute(Attribute.COMMAND, ControlCenterCommand.KILL_SERVER);
        } else {
            button.innerText = 'Start server';
            button.title = 'Start scrcpy server';
            button.setAttribute(Attribute.COMMAND, ControlCenterCommand.START_SERVER);
        }
        button.onclick = this.onActionButtonClick;
        return button;
    }

    private appendStreamLinks(parent: HTMLElement, udid: string, fullName: string): void {
        const proxyUrl = DeviceTracker.createUrl(this.params, udid).toString();
        const select = document.createElement('select');
        select.className = 'hidden';
        select.setAttribute(Attribute.UDID, udid);
        select.setAttribute(Attribute.FULL_NAME, fullName);
        select.setAttribute('name', `${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`);
        select.appendChild(DeviceTracker.createInterfaceOption('proxy', proxyUrl));
        parent.appendChild(select);

        StreamClientScrcpy.getPlayers().forEach((playerClass) => {
            const { playerCodeName, playerFullName } = playerClass;
            const link = DeviceTracker.buildLink(
                {
                    action: ACTION.STREAM_SCRCPY,
                    udid,
                    player: playerCodeName,
                    ws: proxyUrl,
                    fitToScreen: true,
                },
                playerFullName,
                this.params,
            );
            const entry = document.createElement('div');
            entry.className = 'frp-action stream';
            entry.appendChild(link);
            parent.appendChild(entry);
        });
    }

    protected static createUrl(params: ParamsDeviceTracker, udid = ''): URL {
        const secure = !!params.secure;
        const hostname = params.hostname || location.hostname;
        const port = typeof params.port === 'number' ? params.port : secure ? 443 : 80;
        const pathname = params.pathname || location.pathname;
        const urlObject = this.buildUrl({ ...params, secure, hostname, port, pathname });
        if (udid) {
            urlObject.searchParams.set('action', ACTION.PROXY_ADB);
            urlObject.searchParams.set('remote', `tcp:${SERVER_PORT.toString(10)}`);
            urlObject.searchParams.set('udid', udid);
        }
        return urlObject;
    }

    protected static createInterfaceOption(name: string, url: string): HTMLOptionElement {
        const optionElement = document.createElement('option');
        optionElement.setAttribute(Attribute.URL, url);
        optionElement.setAttribute(Attribute.NAME, name);
        optionElement.innerText = `proxy over adb`;
        return optionElement;
    }

    public getDescriptorByUdid(udid: string): GoogDeviceDescriptor | undefined {
        return (
            super.getDescriptorByUdid(udid) ||
            this.descriptors.find((descriptor) => {
                return descriptor.frpLocalSerial === udid;
            })
        );
    }

    private static titleToClassName(title: string): string {
        return title.toLowerCase().replace(/\s/g, '_');
    }

    protected buildDeviceRow(tbody: Element, device: GoogDeviceDescriptor): void {
        let selectedInterfaceUrl = '';
        let selectedInterfaceName = '';
        const blockClass = 'desc-block';
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;
        const isActive = device.state === DeviceState.DEVICE;
        const isFrpConnected = !!device.frpLocalSerial;
        const canUseAdbActions = !device.isFrpRemote || isFrpConnected;
        const effectiveUdid = device.frpLocalSerial || device.udid;
        let hasPid = false;
        const servicesId = `device_services_${fullName}`;
        const row = html`<div class="device ${isActive ? 'active' : 'not-active'}">
            <div class="device-header">
                <div class="device-name">${device['ro.product.manufacturer']} ${device['ro.product.model']}</div>
                <div class="device-serial">${device.udid}</div>
                <div class="device-version">
                    <div class="release-version">${device['ro.build.version.release']}</div>
                    <div class="sdk-version">${device['ro.build.version.sdk']}</div>
                </div>
                <div class="device-state" title="State: ${device.state}"></div>
            </div>
            <div id="${servicesId}" class="services"></div>
        </div>`.content;
        const services = row.getElementById(servicesId);
        if (!services) {
            return;
        }

        if (device.isFrpRemote) {
            const frpButton = document.createElement('button');
            frpButton.className = 'action-button active';
            frpButton.setAttribute(Attribute.UDID, device.udid);
            frpButton.onclick = this.onActionButtonClick;
            if (isFrpConnected) {
                frpButton.title = `Disconnect frp tunnel ${device.frpLocalSerial}`;
                frpButton.innerText = 'Disconnect frp';
                frpButton.setAttribute(Attribute.COMMAND, ControlCenterCommand.DISCONNECT_FRP_DEVICE);
            } else {
                frpButton.title = `Connect through frp`;
                frpButton.innerText = 'Connect frp';
                frpButton.setAttribute(Attribute.COMMAND, ControlCenterCommand.CONNECT_FRP_DEVICE);
            }
            const frpBlock = document.createElement('div');
            frpBlock.classList.add(blockClass);
            frpBlock.appendChild(frpButton);
            if (isFrpConnected) {
                const span = document.createElement('span');
                span.className = 'frp-local-serial';
                span.innerText = device.frpLocalSerial || '';
                frpBlock.appendChild(span);
            }
            services.appendChild(frpBlock);
        }

        const adbDevice = { ...device, udid: effectiveUdid };
        if (canUseAdbActions) {
            DeviceTracker.tools.forEach((tool) => {
                const entry = tool.createEntryForDeviceList(adbDevice, blockClass, this.params);
                if (entry) {
                    if (Array.isArray(entry)) {
                        entry.forEach((item) => {
                            item && services.appendChild(item);
                        });
                    } else {
                        services.appendChild(entry);
                    }
                }
            });
        }

        const streamEntry = canUseAdbActions
            ? StreamClientScrcpy.createEntryForDeviceList(adbDevice, blockClass, fullName, this.params)
            : undefined;
        streamEntry && services.appendChild(streamEntry);

        DESC_COLUMNS.forEach((item) => {
            const { title } = item;
            const fieldName = item.field;
            let value: string;
            if (typeof item.field === 'string') {
                value = '' + device[item.field];
            } else {
                value = item.field(device);
            }
            const td = document.createElement('div');
            td.classList.add(DeviceTracker.titleToClassName(title), blockClass);
            services.appendChild(td);
            if (fieldName === 'pid') {
                hasPid = value !== '-1';
                const actionButton = document.createElement('button');
                actionButton.className = 'action-button kill-server-button';
                actionButton.setAttribute(Attribute.UDID, effectiveUdid);
                actionButton.setAttribute(Attribute.PID, value);
                let command: string;
                if (isActive && canUseAdbActions) {
                    actionButton.classList.add('active');
                    actionButton.onclick = this.onActionButtonClick;
                    if (hasPid) {
                        command = ControlCenterCommand.KILL_SERVER;
                        actionButton.title = 'Kill server';
                        actionButton.appendChild(SvgImage.create(SvgImage.Icon.CANCEL));
                    } else {
                        command = ControlCenterCommand.START_SERVER;
                        actionButton.title = 'Start server';
                        actionButton.appendChild(SvgImage.create(SvgImage.Icon.REFRESH));
                    }
                    actionButton.setAttribute(Attribute.COMMAND, command);
                } else {
                    const timestamp = device['last.update.timestamp'];
                    if (timestamp) {
                        const date = new Date(timestamp);
                        actionButton.title = `Last update on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
                    } else {
                        actionButton.title = `Not active`;
                    }
                    actionButton.appendChild(SvgImage.create(SvgImage.Icon.OFFLINE));
                }
                const span = document.createElement('span');
                span.innerText = value;
                actionButton.appendChild(span);
                td.appendChild(actionButton);
            } else if (fieldName === 'interfaces') {
                if (!canUseAdbActions) {
                    td.innerText = '-';
                    return;
                }
                const proxyInterfaceUrl = DeviceTracker.createUrl(this.params, effectiveUdid).toString();
                const proxyInterfaceName = 'proxy';
                const localStorageKey = DeviceTracker.getLocalStorageKey(fullName);
                const lastSelected = localStorage && localStorage.getItem(localStorageKey);
                const selectElement = document.createElement('select');
                selectElement.setAttribute(Attribute.UDID, effectiveUdid);
                selectElement.setAttribute(Attribute.FULL_NAME, fullName);
                selectElement.setAttribute(
                    'name',
                    encodeURIComponent(`${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`),
                );
                /// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
                device.interfaces.forEach((value) => {
                    const params = {
                        ...this.params,
                        secure: false,
                        hostname: value.ipv4,
                        port: SERVER_PORT,
                    };
                    const url = DeviceTracker.createUrl(params).toString();
                    const optionElement = DeviceTracker.createInterfaceOption(value.name, url);
                    optionElement.innerText = `${value.name}: ${value.ipv4}`;
                    selectElement.appendChild(optionElement);
                    if (lastSelected) {
                        if (lastSelected === value.name || !selectedInterfaceName) {
                            optionElement.selected = true;
                            selectedInterfaceUrl = url;
                            selectedInterfaceName = value.name;
                        }
                    } else if (device['wifi.interface'] === value.name) {
                        optionElement.selected = true;
                    }
                });
                /// #else
                selectedInterfaceUrl = proxyInterfaceUrl;
                selectedInterfaceName = proxyInterfaceName;
                td.classList.add('hidden');
                /// #endif
                if (isActive) {
                    const adbProxyOption = DeviceTracker.createInterfaceOption(proxyInterfaceName, proxyInterfaceUrl);
                    if (lastSelected === proxyInterfaceName || !selectedInterfaceName) {
                        adbProxyOption.selected = true;
                        selectedInterfaceUrl = proxyInterfaceUrl;
                        selectedInterfaceName = proxyInterfaceName;
                    }
                    selectElement.appendChild(adbProxyOption);
                    const actionButton = document.createElement('button');
                    actionButton.className = 'action-button update-interfaces-button active';
                    actionButton.title = `Update information`;
                    actionButton.appendChild(SvgImage.create(SvgImage.Icon.REFRESH));
                    actionButton.setAttribute(Attribute.UDID, effectiveUdid);
                    actionButton.setAttribute(Attribute.COMMAND, ControlCenterCommand.UPDATE_INTERFACES);
                    actionButton.onclick = this.onActionButtonClick;
                    td.appendChild(actionButton);
                }
                selectElement.onchange = this.onInterfaceSelected;
                td.appendChild(selectElement);
            } else {
                td.innerText = value;
            }
        });

        if (DeviceTracker.CREATE_DIRECT_LINKS) {
            const name = `${DeviceTracker.AttributePrefixPlayerFor}${fullName}`;
            StreamClientScrcpy.getPlayers().forEach((playerClass) => {
                const { playerCodeName, playerFullName } = playerClass;
                const playerTd = document.createElement('div');
                playerTd.classList.add(blockClass);
                playerTd.setAttribute('name', encodeURIComponent(name));
                playerTd.setAttribute(DeviceTracker.AttributePlayerFullName, encodeURIComponent(playerFullName));
                playerTd.setAttribute(DeviceTracker.AttributePlayerCodeName, encodeURIComponent(playerCodeName));
                services.appendChild(playerTd);
            });
        }

        tbody.appendChild(row);
        if (DeviceTracker.CREATE_DIRECT_LINKS && hasPid && selectedInterfaceUrl) {
            this.updateLink({
                url: selectedInterfaceUrl,
                name: selectedInterfaceName,
                fullName,
                udid: effectiveUdid,
                store: false,
            });
        }
    }

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceTracker.instancesByUrl.delete(this.url.toString());
        if (!DeviceTracker.instancesByUrl.size) {
            const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
            if (holder && holder.parentElement) {
                holder.parentElement.removeChild(holder);
            }
        }
    }
}
