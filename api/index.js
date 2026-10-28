'use strict';
/**
 * OmniTransit v5 — Vercel Serverless API Handler
 */
const { Engine } = require('../engine/engine');
const ai = require('../engine/ai');
const worldMod = require('../engine/world');

// Global engine instance to preserve simulation state across serverless warm invocations
if (!globalThis.__omniEngine) {
  globalThis.__omniEngine = new Engine();
  globalThis.__omniLastTick = Date.now();
}

const engine = globalThis.__omniEngine;

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
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    if (p === '/healthz') {
      return sendJson(res, 200, { ok: true, clock: engine.ai ? engine.ai.snapshot(false).clock : '' });
    }

    if (p === '/api/state') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      return sendJson(res, 200, engine.snapshot(scope));
    }

    if (p === '/api/events') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`retry: 3000\n\n`);
      res.write(`event: state\ndata: ${JSON.stringify(engine.snapshot(scope))}\n\n`);
      // Keep open shortly for streaming in serverless environment
      const interval = setInterval(() => {
        try {
          engine.tick();
          res.write(`event: state\ndata: ${JSON.stringify(engine.snapshot(scope))}\n\n`);
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
