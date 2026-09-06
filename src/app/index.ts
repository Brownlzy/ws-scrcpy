import '../style/app.css';
import { StreamClientScrcpy } from './googDevice/client/StreamClientScrcpy';
import { HostTracker } from './client/HostTracker';
import { Tool } from './client/Tool';

window.onload = async function (): Promise<void> {
    const hash = location.hash.replace(/^#!/, '');
    const parsedQuery = new URLSearchParams(hash);
    const pathParams = parsePathParams();
    const action = parsedQuery.get('action') || pathParams.get('action');
    const targetUdid = pathParams.get('targetUdid') || undefined;

    /// #if USE_BROADWAY
    const { BroadwayPlayer } = await import('./player/BroadwayPlayer');
    StreamClientScrcpy.registerPlayer(BroadwayPlayer);
    /// #endif

    /// #if USE_H264_CONVERTER
    const { MsePlayer } = await import('./player/MsePlayer');
    StreamClientScrcpy.registerPlayer(MsePlayer);
    /// #endif

    /// #if USE_TINY_H264
    const { TinyH264Player } = await import('./player/TinyH264Player');
    StreamClientScrcpy.registerPlayer(TinyH264Player);
    /// #endif

    /// #if USE_WEBCODECS
    const { WebCodecsPlayer } = await import('./player/WebCodecsPlayer');
    StreamClientScrcpy.registerPlayer(WebCodecsPlayer);
    /// #endif

    if (action === StreamClientScrcpy.ACTION && typeof parsedQuery.get('udid') === 'string') {
        StreamClientScrcpy.start(parsedQuery);
        return;
    }

    /// #if INCLUDE_APPL
    {
        const { DeviceTracker } = await import('./applDevice/client/DeviceTracker');

        /// #if USE_QVH_SERVER
        const { StreamClientQVHack } = await import('./applDevice/client/StreamClientQVHack');

        DeviceTracker.registerTool(StreamClientQVHack);

        /// #if USE_WEBCODECS
        const { WebCodecsPlayer } = await import('./player/WebCodecsPlayer');
        StreamClientQVHack.registerPlayer(WebCodecsPlayer);
        /// #endif

        /// #if USE_H264_CONVERTER
        const { MsePlayerForQVHack } = await import('./player/MsePlayerForQVHack');
        StreamClientQVHack.registerPlayer(MsePlayerForQVHack);
        /// #endif

        if (action === StreamClientQVHack.ACTION && typeof parsedQuery.get('udid') === 'string') {
            StreamClientQVHack.start(StreamClientQVHack.parseParameters(parsedQuery));
            return;
        }
        /// #endif

        /// #if USE_WDA_MJPEG_SERVER
        const { StreamClientMJPEG } = await import('./applDevice/client/StreamClientMJPEG');
        DeviceTracker.registerTool(StreamClientMJPEG);

        const { MjpegPlayer } = await import('./player/MjpegPlayer');
        StreamClientMJPEG.registerPlayer(MjpegPlayer);

        if (action === StreamClientMJPEG.ACTION && typeof parsedQuery.get('udid') === 'string') {
            StreamClientMJPEG.start(StreamClientMJPEG.parseParameters(parsedQuery));
            return;
        }
        /// #endif
    }
    /// #endif

    const tools: Tool[] = [];

    /// #if INCLUDE_ADB_SHELL
    const { ShellClient } = await import('./googDevice/client/ShellClient');
    if (action === ShellClient.ACTION && typeof parsedQuery.get('udid') === 'string') {
        ShellClient.start(ShellClient.parseParameters(parsedQuery));
        return;
    }
    tools.push(ShellClient);
    /// #endif

    /// #if INCLUDE_DEV_TOOLS
    const { DevtoolsClient } = await import('./googDevice/client/DevtoolsClient');
    if (action === DevtoolsClient.ACTION) {
        const params = parsedQuery.get('action') ? parsedQuery : pathParams;
        DevtoolsClient.start(DevtoolsClient.parseParameters(params));
        return;
    }
    tools.push(DevtoolsClient);
    /// #endif

    /// #if INCLUDE_FILE_LISTING
    const { FileListingClient } = await import('./googDevice/client/FileListingClient');
    if (action === FileListingClient.ACTION) {
        FileListingClient.start(FileListingClient.parseParameters(parsedQuery));
        return;
    }
    tools.push(FileListingClient);
    /// #endif

    if (tools.length) {
        const { DeviceTracker } = await import('./googDevice/client/DeviceTracker');
        tools.forEach((tool) => {
            DeviceTracker.registerTool(tool);
        });
    }
    if (targetUdid) {
        const { DeviceTracker } = await import('./googDevice/client/DeviceTracker');
        const secure = location.protocol === 'https:';
        const port = location.port ? parseInt(location.port, 10) : secure ? 443 : 80;
        DeviceTracker.start({
            type: 'android',
            secure,
            port,
            hostname: location.hostname,
            pathname: location.pathname,
            useProxy: false,
            targetUdid,
            autoConnect: true,
            disconnectOnClose: true,
        });
        return;
    }
    HostTracker.start();
};

function parsePathParams(): URLSearchParams {
    const params = new URLSearchParams();
    const parts = location.pathname
        .split('/')
        .map((part) => decodeURIComponent(part))
        .filter((part) => !!part);
    const deviceIndex = parts.indexOf('device');
    const deviceId = deviceIndex === -1 ? undefined : parts[deviceIndex + 1];
    if (deviceId) {
        params.set('targetUdid', deviceId);
    }
    return params;
}
