'use strict';
/**
 * OmniTransit v5 — server.js
 * เซิร์ฟเวอร์ HTTP แบบไม่พึ่งพาแพ็กเกจภายนอกเลย (ศูนย์ dependency — ไม่ต้อง npm install)
 * ให้บริการ: หน้าเว็บสแตติก + REST API + Server-Sent Events สำหรับข้อมูลสด
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Engine } = require('./engine/engine');
const ai = require('./engine/ai');
const worldMod = require('./engine/world');

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

ai.loadDotEnv(ROOT); // อ่าน OPENAI_API_KEY / OPENAI_MODEL จาก .env (ถ้ามี)
const engine = new Engine();

// ── วงจรจำลอง: ทุก 1 วินาทีจริง = engine.simSpeed วินาทีจำลอง ─────────────────
setInterval(() => {
  try { engine.tick(); } catch (err) { console.error('[tick error]', err); }
}, 1000);

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) { reject(new Error('payload ใหญ่เกินไป')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON ไม่ถูกต้อง')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC, p));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 ไม่พบไฟล์: ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

// ── SSE: สตรีมสแนปชอตทุก 1 วินาที ────────────────────────────────────────────
const sseClients = new Set();
setInterval(() => {
  if (!sseClients.size) return;
  let publicPayload, opsPayload;
  try { publicPayload = JSON.stringify(engine.snapshot('public')); } catch (err) { console.error('[sse public]', err); return; }
  try { opsPayload = JSON.stringify(engine.snapshot('ops')); } catch (err) { console.error('[sse ops]', err); return; }
  for (const c of sseClients) {
    const data = c.scope === 'public' ? publicPayload : opsPayload;
    try { c.res.write(`event: state\ndata: ${data}\n\n`); } catch { sseClients.delete(c); }
  }
}, 1000);

// ── เซิร์ฟเวอร์ ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (p === '/healthz') return sendJson(res, 200, { ok: true, clock: engine.ai.snapshot(false).clock });

    if (p === '/api/state') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      return sendJson(res, 200, engine.snapshot(scope));
    }

    if (p === '/api/events') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 3000\n\n`);
      const client = { res, scope };
      sseClients.add(client);
      try { res.write(`event: state\ndata: ${JSON.stringify(engine.snapshot(scope))}\n\n`); } catch {}
      req.on('close', () => sseClients.delete(client));
      return;
    }

    if (p === '/api/gtfs-rt') return sendJson(res, 200, engine.gtfsFeed());

    if (p === '/api/route.geo.json') return sendJson(res, 200, worldMod.routeCtx().GEO);
    if (p === '/api/routes') return sendJson(res, 200, { routes: engine.routeList(), active: engine.routeId });

    if (p === '/api/timetable') return sendJson(res, 200, { route: ROUTE_META(), table: engine.getTimetable() });

    // ── Real AI Forecaster (OpenAI) ──────────────────────────────────────────
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
      let result = { ok: false, error: 'endpoint ไม่รู้จัก' };
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

    return serveStatic(res, p);
  } catch (err) {
    console.error('[api error]', err);
    return sendJson(res, 500, { ok: false, error: String(err.message || err) });
  }
});

function ROUTE_META() {
  return engine.routeMeta();
}

server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const lan = [];
  for (const list of Object.values(nets)) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OmniTransit v5 — รถมาตามรอบ รู้ข้อมูลจริง ขึ้นรถได้อย่างเป็นธรรม');
  console.log('  ────────────────────────────────────────────────────');
  console.log(`  หน้าผู้โดยสาร:        http://localhost:${PORT}/`);
  console.log(`  ป้ายประกาศ (Kiosk):   http://localhost:${PORT}/kiosk.html`);
  console.log(`  ผู้สำรวจ/APC:         http://localhost:${PORT}/spotter.html`);
  console.log(`  ศูนย์ควบคุมนายท่า:    http://localhost:${PORT}/dispatcher.html`);
  console.log(`  ทดสอบโมเดล AI:       http://localhost:${PORT}/aieval.html`);
  console.log(`  KPI/ความเป็นธรรม:     http://localhost:${PORT}/kpi.html`);
  console.log(`  กำกับโครงการ:         http://localhost:${PORT}/governance.html`);
  console.log(`  จำลองเหตุขัดข้อง:     http://localhost:${PORT}/sim.html`);
  if (lan.length) console.log(`  (LAN)  http://${lan[0]}:${PORT}/  — เปิดจากมือถือ/แท็บเล็ตในเครือข่ายเดียวกันได้`);
  console.log('  ────────────────────────────────────────────────────');
  console.log('  ศูนย์ dependency · ฟรี 100% · แผนที่ OpenStreetMap (ODbL)');
  console.log('═══════════════════════════════════════════════════════');
});
