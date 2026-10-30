'use strict';
/**
 * OmniTransit v5 — Vercel Serverless API Handler
 */
const { Engine } = require('../engine/engine');
const ai = require('../engine/ai');
const worldMod = require('../engine/world');
const { Operations } = require('../engine/operations');
const { explain } = require('../engine/copilot');
const { ContextService } = require('../engine/context/service');
const { ROUTES } = require('../engine/data');

// Global engine instance to preserve simulation state across serverless warm invocations
if (!globalThis.__omniEngine) {
  const eng = new Engine();
  eng.operations = new Operations(eng);
  const ctxService = new ContextService(ROUTES);
  eng.operations.contextService = ctxService;
  globalThis.__omniEngine = eng;
  globalThis.__omniContextService = ctxService;
  globalThis.__omniTwinJobs = new (require('../engine/twin-service').TwinJobs)();
  globalThis.__omniLastTick = Date.now();
}

const engine = globalThis.__omniEngine;
const contextService = globalThis.__omniContextService;
const twinJobs = globalThis.__omniTwinJobs;

function authorized(req, kind) {
  const key = process.env[kind === 'telemetry' ? 'TELEMETRY_TOKEN' : 'OPERATIONS_TOKEN'];
  if (key) return req.headers.authorization === `Bearer ${key}`;
  // In demo or non-token environment, allow operations and telemetry
  return true;
}

function tickSimulation() {
  const now = Date.now();
  const last = globalThis.__omniLastTick || now;
  const elapsedSec = Math.min(60, Math.max(1, Math.floor((now - last) / 1000)));
  for (let i = 0; i < elapsedSec; i++) {
    try { engine.tick(); } catch (err) { console.error('[sim tick error]', err); }
  }
  globalThis.__omniLastTick = now;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // Advance simulation time dynamically
  tickSimulation();

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  // Enable CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  try {
    // ── External Context Intelligence APIs ──────────────────────────────────
    if (p.startsWith('/api/context/')) {
      const routeId = url.searchParams.get('routeId') || engine.routeId;
      try {
        if (p === '/api/context/weather' && req.method === 'GET') {
          return sendJson(res, 200, url.searchParams.get('refresh') === '0' ? contextService.weather(routeId) : await contextService.refreshWeather(routeId, { force: url.searchParams.get('force') === '1' }));
        }
        if (p === '/api/context/events' && req.method === 'GET') {
          return sendJson(res, 200, url.searchParams.get('refresh') === '1' ? await contextService.refreshEvents({ force: url.searchParams.get('force') === '1' }) : contextService.events());
        }
        if (p === '/api/context/impacts' && req.method === 'GET') {
          return sendJson(res, 200, contextService.impacts(routeId, Number(url.searchParams.get('radiusM') || 1000)));
        }
        if (p === '/api/context/state' && req.method === 'GET') {
          return sendJson(res, 200, contextService.context(routeId));
        }
        if (p === '/api/context/scenarios' && req.method === 'GET') {
          return sendJson(res, 200, { classification: 'simulation_assumptions', calibrated: false, scenarios: Object.fromEntries(Object.entries(require('../engine/twin').SCENARIOS).filter(([, v]) => v.external)) });
        }
        if (p === '/api/context/events/manual' && req.method === 'POST') {
          if (!authorized(req, 'operations')) return sendJson(res, 401, { ok: false, error: 'operations authorization required' });
          const events = require('../engine/context/manual').parseManualPayload(await readBody(req));
          return sendJson(res, 200, { ok: true, results: events.map((event) => contextService.import(event)) });
        }
        return sendJson(res, req.method === 'GET' || req.method === 'POST' ? 404 : 405, { ok: false, error: req.method === 'GET' || req.method === 'POST' ? 'unknown context endpoint' : 'GET or POST required' });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    // ── Telemetry APIs ──────────────────────────────────────────────────────
    if (p.startsWith('/api/telemetry/')) {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST required' });
      if (!authorized(req, 'telemetry')) return sendJson(res, 401, { ok: false, error: 'telemetry authorization required' });
      const kind = p === '/api/telemetry/passenger' ? 'passenger' : p === '/api/telemetry/position' ? 'position' : null;
      if (!kind) return sendJson(res, 404, { ok: false, error: 'unknown telemetry endpoint' });
      try {
        return sendJson(res, 200, engine.operations.ingest(await readBody(req), kind));
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    // ── Operations & Digital Twin APIs ──────────────────────────────────────
    if (p.startsWith('/api/operations/')) {
      if (p === '/api/operations/twin' && req.method === 'POST') {
        if (!authorized(req, 'operations')) return sendJson(res, 401, { ok: false, error: 'operations authorization required' });
        try {
          const body = await readBody(req);
          if (body.routeId && body.routeId !== engine.routeId) throw new Error('experiment must use active route');
          if (body.holdingStopIds && (!Array.isArray(body.holdingStopIds) || body.holdingStopIds.some((id) => !engine.operations.allowedStops.includes(id)))) {
            throw new Error('only configured holding stops allowed');
          }
          const result = await twinJobs.run({ ...body, routeId: engine.routeId, holdingStopIds: body.holdingStopIds || engine.operations.allowedStops });
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, err.status || 400, { ok: false, error: err.message });
        }
      }
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET required' });
      if (p === '/api/operations/twin') return sendJson(res, 200, twinJobs.latest);
      try {
        const ops = engine.operations.snapshot(url.searchParams.get('mode') || 'simulation', url.searchParams.get('runId'));
        const name = p.split('/').at(-1);
        if (name === 'copilot') return sendJson(res, 200, explain(ops));
        if (!['headways', 'predictions', 'recommendations', 'state'].includes(name)) {
          return sendJson(res, 404, { ok: false, error: 'unknown operations endpoint' });
        }
        return sendJson(res, 200, name === 'state' ? ops : { mode: ops.mode, simulationRunId: ops.simulationRunId, data: ops[name], cameraStatus: ops.cameraStatus });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    // ── Standard Core APIs ──────────────────────────────────────────────────
    if (p === '/healthz') {
      return sendJson(res, 200, { ok: true, clock: engine.ai ? engine.ai.snapshot(false).clock : '' });
    }

    if (p === '/api/state') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      return sendJson(res, 200, engine.snapshot(scope));
    }

    if (p === '/api/events') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      const mode = url.searchParams.get('mode') || 'simulation';
      const runId = url.searchParams.get('runId');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`retry: 3000\n\n`);
      const payload = { ...engine.snapshot(scope), operations: engine.operations.snapshot(mode, runId) };
      res.write(`event: state\ndata: ${JSON.stringify(payload)}\n\n`);
      const interval = setInterval(() => {
        try {
          engine.tick();
          res.write(`event: state\ndata: ${JSON.stringify({ ...engine.snapshot(scope), operations: engine.operations.snapshot(mode, runId) })}\n\n`);
        } catch {
          clearInterval(interval);
        }
      }, 1000);
      req.on('close', () => clearInterval(interval));
      return;
    }

    if (p === '/api/gtfs-rt') return sendJson(res, 200, engine.gtfsFeed());
    if (p === '/api/route.geo.json') return sendJson(res, 200, worldMod.routeCtx().GEO);
    if (p === '/api/routes') return sendJson(res, 200, { routes: engine.routeList(), active: engine.routeId });
    if (p === '/api/timetable') return sendJson(res, 200, { route: engine.routeMeta(), table: engine.getTimetable() });

    if (p === '/api/ai/status') return sendJson(res, 200, ai.status());
    if (p === '/api/ai/predict-crowd') {
      const result = await engine.aiPredict({
        busId: url.searchParams.get('busId') || undefined,
        stopId: url.searchParams.get('stopId') || undefined,
        dir: url.searchParams.get('dir') || undefined,
      });
      return sendJson(res, result.ok === false ? 400 : 200, result);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      let result = { ok: false, error: 'unknown endpoint' };
      switch (p) {
        case '/api/control': result = engine.control(body); break;
        case '/api/spotter': result = engine.spotter(body); break;
        case '/api/apc': result = engine.apcBeam(body); break;
        case '/api/origin': result = engine.declareOrigin(body); break;
        case '/api/dispatch': result = engine.decide(body.recId, body.decision, body.note); break;
        case '/api/complaints': result = engine.addComplaint(body); break;
        case '/api/complaints/update': result = engine.updateComplaint(body.id, body.action); break;
        case '/api/roadmap': result = engine.setGate(body.phaseIdx, body.gateIdx, body.done); break;
        case '/api/killswitch': result = engine.setKillSwitch(body.on, body.reason); break;
        case '/api/charter': result = engine.saveCharter(body); break;
        case '/api/model': result = engine.setModelRelease(body.action, body.note); break;
        case '/api/ai/config': result = ai.setConfig(body); break;
      }
      return sendJson(res, result.ok === false ? 400 : 200, result);
    }

    return sendJson(res, 404, { ok: false, error: 'Endpoint not found: ' + p });
  } catch (err) {
    console.error('[serverless error]', err);
    return sendJson(res, 500, { ok: false, error: String(err.message || err) });
  }
};
