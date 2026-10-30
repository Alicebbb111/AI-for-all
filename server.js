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
const { Operations } = require('./engine/operations');
const { explain, explainWithAI } = require('./engine/copilot');
const { ContextService } = require('./engine/context/service');
const { ROUTES } = require('./engine/data');
engine.operations = new Operations(engine);
const contextService = new ContextService(ROUTES);
engine.operations.contextService = contextService;
const twinJobs = new (require('./engine/twin-service').TwinJobs)();

// Warm Start (opt-in ผ่าน WARM_START_MIN): เดินจำลองล่วงหน้าก่อนเปิดให้บริการ
// เพื่อให้หน้านำเสนอ/นายท่ามีข้อมูล KPI ย้อนหลังทันที — ไม่ตั้งค่า = สตาร์ตเย็นตามปกติ (tests ใช้พาธนี้)
if (process.env.WARM_START_MIN) {
  const mins = Math.max(1, Math.min(180, Number(process.env.WARM_START_MIN) || 0));
  const speed = engine.simSpeed; engine.simSpeed = 120;
  const ticks = Math.ceil((mins * 60) / 120);
  for (let i = 0; i < ticks; i++) engine.tick();
  engine.simSpeed = speed;
  engine.logEvent(`ระบบเริ่มด้วยข้อมูลจำลองย้อนหลัง ${mins} นาที (Warm Start)`, 'info');
}

function authorized(req, kind) {
  const key = process.env[kind === 'telemetry' ? 'TELEMETRY_TOKEN' : 'OPERATIONS_TOKEN'];
  if (key) return req.headers.authorization === `Bearer ${key}`;
  return process.env.NODE_ENV !== 'production' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

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
/** payload ต่อโหมด: operations เฉพาะสาย (simulation/live/replay) ขึ้นหน้าสุดของ JSON
 *  เพื่อให้ผู้อ่านแบบ chunked เห็นโหมดตั้งแต่ chunk แรก และตัด operations simulation ที่ซ้ำซ้อนออก */
function sseStatePayload(scope, mode, runId) {
  const snap = engine.snapshot(scope);
  const payload = { operations: engine.operations.snapshot(mode, runId) };
  for (const k of Object.keys(snap)) if (k !== 'operations') payload[k] = snap[k];
  return JSON.stringify(payload);
}
const sseClients = new Set();
setInterval(() => {
  if (!sseClients.size) return;
  let publicPayload, opsPayload;
  try { publicPayload = JSON.stringify(engine.snapshot('public')); } catch (err) { console.error('[sse public]', err); return; }
  try { opsPayload = JSON.stringify(engine.snapshot('ops')); } catch (err) { console.error('[sse ops]', err); return; }
  for (const c of sseClients) {
    let data = c.scope === 'public' ? publicPayload : opsPayload;
    if(c.mode!=='simulation') {
      try {data=sseStatePayload(c.scope,c.mode,c.runId);}
      catch {continue;}
    }
    try { c.res.write(`event: state\ndata: ${data}\n\n`); } catch { sseClients.delete(c); }
  }
}, 1000);

// ── เซิร์ฟเวอร์ ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (p.startsWith('/api/context/')) {
      const routeId=url.searchParams.get('routeId')||engine.routeId;
      try {
        if(p==='/api/context/weather'&&req.method==='GET')return sendJson(res,200,url.searchParams.get('refresh')==='0'?contextService.weather(routeId):await contextService.refreshWeather(routeId,{force:url.searchParams.get('force')==='1'}));
        if(p==='/api/context/events'&&req.method==='GET')return sendJson(res,200,url.searchParams.get('refresh')==='1'?await contextService.refreshEvents({force:url.searchParams.get('force')==='1'}):contextService.events());
        if(p==='/api/context/impacts'&&req.method==='GET')return sendJson(res,200,contextService.impacts(routeId,Number(url.searchParams.get('radiusM')||1000)));
        if(p==='/api/context/state'&&req.method==='GET')return sendJson(res,200,contextService.context(routeId));
        if(p==='/api/context/scenarios'&&req.method==='GET')return sendJson(res,200,{classification:'simulation_assumptions',calibrated:false,scenarios:Object.fromEntries(Object.entries(require('./engine/twin').SCENARIOS).filter(([,v])=>v.external))});
        if(p==='/api/context/events/manual'&&req.method==='POST'){
          if(!authorized(req,'operations'))return sendJson(res,401,{ok:false,error:'operations authorization required'});
          const events=require('./engine/context/manual').parseManualPayload(await readBody(req));
          return sendJson(res,200,{ok:true,results:events.map(event=>contextService.import(event))});
        }
        return sendJson(res,req.method==='GET'||req.method==='POST'?404:405,{ok:false,error:req.method==='GET'||req.method==='POST'?'unknown context endpoint':'GET or POST required'});
      }catch(err){return sendJson(res,400,{ok:false,error:err.message});}
    }
    if (p.startsWith('/api/telemetry/')) {
      if(req.method !== 'POST') return sendJson(res,405,{ok:false,error:'POST required'});
      if(!authorized(req,'telemetry'))return sendJson(res,401,{ok:false,error:'telemetry authorization required'});
      const kind=p==='/api/telemetry/passenger'?'passenger':p==='/api/telemetry/position'?'position':null;
      if(!kind)return sendJson(res,404,{ok:false,error:'unknown telemetry endpoint'});
      try { return sendJson(res,200,engine.operations.ingest(await readBody(req),kind)); }
      catch(err){return sendJson(res,400,{ok:false,error:err.message});}
    }
    if (p.startsWith('/api/operations/')) {
      if(p==='/api/operations/twin'&&req.method==='POST') {
        if(!authorized(req,'operations'))return sendJson(res,401,{ok:false,error:'operations authorization required'});
        try {
          const body=await readBody(req),ctx=worldMod.routeCtx();
          if(body.routeId&&body.routeId!==engine.routeId)throw new Error('experiment must use active route');
          if(body.holdingStopIds && (!Array.isArray(body.holdingStopIds)||body.holdingStopIds.some(id=>!engine.operations.allowedStops.includes(id))))throw new Error('only configured holding stops allowed');
          const result=await twinJobs.run({...body,routeId:engine.routeId,holdingStopIds:body.holdingStopIds||engine.operations.allowedStops});
          return sendJson(res,200,result);
        }catch(err){return sendJson(res,err.status||400,{ok:false,error:err.message});}
      }
      if(req.method!=='GET')return sendJson(res,405,{ok:false,error:'GET required'});
      if(p==='/api/operations/twin')return sendJson(res,200,twinJobs.latest);
      try {
        const ops=engine.operations.snapshot(url.searchParams.get('mode')||'simulation',url.searchParams.get('runId'));
        const name=p.split('/').at(-1);
        if(name==='copilot'){
          if(url.searchParams.get('ai')==='1')return sendJson(res,200,await explainWithAI(ops,ai));
          return sendJson(res,200,explain(ops));
        }
        if(!['headways','predictions','recommendations','state'].includes(name))return sendJson(res,404,{ok:false,error:'unknown operations endpoint'});
        return sendJson(res,200,name==='state'?ops:{mode:ops.mode,simulationRunId:ops.simulationRunId,data:ops[name],cameraStatus:ops.cameraStatus});
      }catch(err){return sendJson(res,400,{ok:false,error:err.message});}
    }
    if (p === '/healthz') return sendJson(res, 200, { ok: true, clock: engine.ai.snapshot(false).clock });

    if (p === '/api/state') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      return sendJson(res, 200, engine.snapshot(scope));
    }

    if (p === '/api/events') {
      const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'ops';
      const mode=url.searchParams.get('mode')||'simulation',runId=url.searchParams.get('runId');
      if(!['simulation','live','replay'].includes(mode)||(mode==='replay'&&!runId))return sendJson(res,400,{ok:false,error:'invalid SSE mode or missing replay runId'});
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 3000\n\n`);
      const client = { res, scope, mode, runId };
      // เขียน event เฉพาะสายก่อนลงทะเบียน broadcast — กัน broadcast tick ที่กำลังวนลูปอยู่
      // (Set iteration) แทรก event simulation มาก่อนหน้าสำหรับ client โหมด live/replay
      try { res.write(`event: state\ndata: ${sseStatePayload(scope, mode, runId)}\n\n`); } catch (err) { console.error('[sse init]', err && err.message); }
      sseClients.add(client);
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
      if(!authorized(req,'operations'))return sendJson(res,401,{ok:false,error:'operations authorization required'});
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
