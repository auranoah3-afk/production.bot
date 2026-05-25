import http from 'node:http';

export function createHealthState({ startedAt = new Date() } = {}) {
  const state = {
    startedAt: startedAt.toISOString(),
    readyAt: null,
    lastHeartbeatAt: null,
    lastReconnectAt: null,
    lastDisconnectAt: null,
    lastErrorAt: null,
    status: 'starting',
    lastError: null
  };

  return {
    markReady() {
      state.readyAt = new Date().toISOString();
      state.status = 'online';
    },
    markHeartbeat() {
      state.lastHeartbeatAt = new Date().toISOString();
      if (state.status !== 'degraded') state.status = 'online';
    },
    markReconnect() {
      state.lastReconnectAt = new Date().toISOString();
      state.status = 'online';
    },
    markDisconnect(reason = null) {
      state.lastDisconnectAt = new Date().toISOString();
      state.status = 'degraded';
      if (reason) state.lastError = String(reason).slice(0, 500);
    },
    markError(error) {
      state.lastErrorAt = new Date().toISOString();
      state.lastError = error?.stack ?? error?.message ?? String(error ?? 'Unknown error');
    },
    snapshot(client = null) {
      const uptimeMs = Date.now() - Date.parse(state.startedAt);
      return {
        status: client?.isReady?.() ? state.status : state.status === 'starting' ? 'starting' : 'degraded',
        uptime: Math.max(0, Math.floor(uptimeMs / 1000)),
        uptimeMs: Math.max(0, uptimeMs),
        guilds: client?.guilds?.cache?.size ?? 0,
        readyAt: state.readyAt,
        startedAt: state.startedAt,
        lastHeartbeatAt: state.lastHeartbeatAt,
        lastReconnectAt: state.lastReconnectAt,
        lastDisconnectAt: state.lastDisconnectAt,
        lastErrorAt: state.lastErrorAt,
        lastError: state.lastError
      };
    }
  };
}

export function startHealthServer({ client, healthState, port, host = '127.0.0.1', logger = null } = {}) {
  const cleanPort = Number(port);
  if (!Number.isInteger(cleanPort) || cleanPort <= 0) return null;

  const server = http.createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(JSON.stringify(healthState.snapshot(client), null, 2));
  });

  server.listen(cleanPort, host, () => {
    logger?.info?.('health', `Health endpoint online at http://${host}:${cleanPort}/health`);
  });

  server.on('error', (error) => {
    logger?.error?.('health', 'Health endpoint failed', { error: error.stack ?? error.message });
  });

  return server;
}
