const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

function relayMultiplayerConnection(clientWs, upstreamUrl) {
    const upstream = new WebSocket(upstreamUrl, ['binary']);
    let closed = false;

    function closeBoth() {
        if (closed) {
            return;
        }
        closed = true;
        try {
            clientWs.close();
        } catch (_) {}
        try {
            upstream.close();
        } catch (_) {}
    }

    upstream.on('open', () => {
        clientWs.on('message', (data, isBinary) => {
            if (upstream.readyState === WebSocket.OPEN) {
                upstream.send(data, { binary: isBinary });
            }
        });
        upstream.on('message', (data, isBinary) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data, { binary: isBinary });
            }
        });
    });

    upstream.on('error', (err) => {
        console.error('[easyrpg-mp] upstream error:', err.message);
        closeBoth();
    });
    clientWs.on('error', (err) => {
        console.error('[easyrpg-mp] client error:', err.message);
        closeBoth();
    });
    upstream.on('close', closeBoth);
    clientWs.on('close', closeBoth);
}

function setupMultiplayerProxy(server, upstreamUrl) {
    ['/connect', '/'].forEach((proxyPath) => {
        const mpWss = new WebSocket.Server({ server, path: proxyPath });
        mpWss.on('connection', (clientWs) => {
            relayMultiplayerConnection(clientWs, upstreamUrl);
        });
    });

    console.log(`easyrpg multiplayer proxy: /connect -> ${upstreamUrl}`);
}

function startEasyRpgServer({ binaryPath, bindAddress, enabled }) {
    if (!enabled) {
        console.log('easyrpg multiplayer auto-start disabled');
        return null;
    }

    if (!fs.existsSync(binaryPath)) {
        console.warn(`easyrpg multiplayer server not found at ${binaryPath}`);
        console.warn('clone and build EasyRPG-Player-Monoko (see readme) or set EASYRPG_MP_AUTO_START=false');
        return null;
    }

    let shuttingDown = false;
    let currentProc = null;
    const restartDelayMs = 5000;

    function launch() {
        if (shuttingDown) {
            return null;
        }

        currentProc = spawn(binaryPath, ['--bind-address', bindAddress], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        currentProc.stdout.on('data', (chunk) => {
            const line = chunk.toString().trim();
            if (line) {
                console.log(`[easyrpg-mp] ${line}`);
            }
        });
        currentProc.stderr.on('data', (chunk) => {
            const line = chunk.toString().trim();
            if (line) {
                console.error(`[easyrpg-mp] ${line}`);
            }
        });
        currentProc.on('exit', (code, signal) => {
            currentProc = null;
            if (shuttingDown) {
                return;
            }
            console.warn(`[easyrpg-mp] process exited (code=${code}, signal=${signal}), restarting in ${restartDelayMs / 1000}s`);
            setTimeout(launch, restartDelayMs);
        });

        console.log(`easyrpg multiplayer server started on ${bindAddress}`);
        return currentProc;
    }

    const shutdown = () => {
        shuttingDown = true;
        if (currentProc && !currentProc.killed) {
            currentProc.kill();
        }
    };
    process.on('exit', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return launch();
}

module.exports = {
    setupMultiplayerProxy,
    startEasyRpgServer
};
