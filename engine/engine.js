'use strict';
/**
 * OmniTransit v5 — engine/engine.js
 * ตัวควบคุมกลาง: รัน 2 เวิลด์คู่ขนาน (Baseline = "ก่อนทดลอง" / OmniTransit = "หลังทดลอง")
 * ด้วยความต้องการเดินทางชุดเดียวกัน (seeded) เพื่อเทียบ KPI อย่างยุติธรรม
 * พร้อม Chaos Engine, GTFS-Realtime Feed, Audit Log, ระบบร้องเรียน, Roadmap/Budget/Charter
 */
const worldMod = require('./world');
const { World, fmtClock, envPhase, mulberry32, hashStr, MIN } = worldMod;
const { BUS_MODELS, buildTimetable, pointAtS, histSpeedKmh, ROUTES } = require('./data');
const ai = require('./ai');

// ── สถานะเส้นทางปัจจุบัน (สลับสายได้ — initRouteData รีอินิททั้ง world และตารางเวลา) ──
let S, ROUTE, STOPS, TIMETABLE, ZONES, ZONE_LEN;
function initRouteData(id) {
  const ctx = worldMod.initRoute(id);
  S = ctx.S; ROUTE = ctx.ROUTE; STOPS = ctx.STOPS;
  ZONES = ctx.ZONES; ZONE_LEN = ctx.ZONE_LEN;
  TIMETABLE = buildTimetable(S, STOPS, ROUTE);
  return ctx;
}
initRouteData('R1');

class Engine {
  constructor({ seed = 'default', routeId = 'R1' } = {}) {
    this.seed = String(seed);
    initRouteData(routeId);
    this.routeId = routeId;
    this.resetSim();
    this.mode = 'normal';            // normal | stopped (Kill Switch)
    this.degraded = false;           // จำลองเซิร์ฟเวอร์หลักขัดข้อง
    this.simSpeed = 1;               // 1 วินาทีจริง = 1 วินาทีจำลอง (เรียลไทม์ — รถเคลื่อนที่สมจริง)
    this.rain = false; this.rush = false;
    this.autoApprove = false;
    this.phaseOverride = null;       // null = auto ตามเวลาจำลอง
    this.audit = [];
    this.spotterLog = [];
    this.apcLog = [];
    this.engineEvents = [];
    this.complaints = [];
    this.complaintSeq = 1;
    this.charter = null;
    this.roadmap = this.defaultRoadmap();
    this.killSwitch = { on: false, reason: '', tReal: null };
    this.modelRelease = 'shadow';    // shadow | live (อนุมัติแล้ว) | rolled_back
    this.releaseHistory = [];
    this.startedAtReal = new Date();
  }

  /** (Multi-route) สลับเส้นทาง: รีอินิทเวิลด์คู่ + ตารางเวลา — บันทึก/ร้องเรียน/แผนงานคงเดิม */
  switchRoute(id) {
    if (!ROUTES[id]) return { ok: false, error: 'ไม่รู้จักสายนี้: ' + id };
    if (id === this.routeId) return { ok: true, routeId: id, unchanged: true };
    initRouteData(id);
    this.routeId = id;
    this.resetSim();
    this.spotterLog = []; this.apcLog = []; this.engineEvents = [];
    this.logEvent(`สลับมาจำลองเส้นทาง: ${ROUTE.code} · ${ROUTE.name} (${ROUTE.corridor})`, 'info');
    return { ok: true, routeId: id, name: ROUTE.name };
  }
  routeMeta() {
    return { id: ROUTE.id, code: ROUTE.code, shortCode: ROUTE.shortCode, name: ROUTE.name, headwayMin: ROUTE.targetHeadwayMin, service: `${Math.floor(ROUTE.serviceStartSec / 3600)}:00–${Math.floor(ROUTE.serviceEndSec / 3600)}:00 น.` };
  }
  routeList() {
    return Object.values(ROUTES).map((r) => ({ id: r.ROUTE.id, code: r.ROUTE.code, shortCode: r.ROUTE.shortCode, name: r.ROUTE.name, corridor: r.ROUTE.corridor, color: r.ROUTE.color, stops: r.STOPS.length, headwayMin: r.ROUTE.targetHeadwayMin }));
  }
  resetSim() {
    this.baseline = new World('baseline', this.seed);
    this.ai = new World('ai', this.seed);
    if (this.operations) this.operations.reset();
    this.lastMinute = Math.floor(this.ai.t / MIN) - 1;
    this.nextSlowZoneT = this.ai.t + 6 * MIN;
    this.nextCapacityCheckT = this.ai.t + 5 * MIN;
    this.env = { rain: this.rain, rush: this.rush, mode: this.mode };
  }

  // ── Demand ชุดเดียวกันสำหรับทั้งสองเวิลด์ (วินาทีละเมล็ด ต่อนาที-ป้าย-ทิศ) ──
  generateDemand() {
    const target = Math.floor((this.ai.t + this.simSpeed) / MIN);
    while (this.lastMinute < target) {
      this.lastMinute++;
      const minute = this.lastMinute;
      for (const st of STOPS) {
        for (const dir of [1, -1]) {
          const rnd = mulberry32(hashStr(`${this.seed}:dm:${minute}:${st.id}:${dir}`));
          const dirShare = dir === 1 ? 0.60 : 0.40;
          let lambda = st.baseRate * dirShare * demandMult(minute * 60);
          if (this.rush) lambda *= 1.5;
          if (this.rain) lambda *= 0.85;
          lambda *= this.externalAssumptions?.demandFactor ?? 1;
          lambda *= this.demandScale ?? 1;
          const n = poisson(lambda, rnd);
          for (let k = 0; k < n; k++) {
            const tArr = minute * MIN + Math.floor(rnd() * MIN);
            const evt = { stopId: st.id, dir, t: tArr };
            if(this.onExogenous)this.onExogenous('arrival',evt);
            this.baseline.queues.get(st.id + ':' + dir).push(tArr);
            this.ai.queues.get(st.id + ':' + dir).push(tArr);
          }
        }
      }
    }
  }

  // ── จุดรถติดสุ่ม (เหมือนกันทั้งสองเวิลด์) ───────────────────────────────────
  maybeSlowZone() {
    if (this.ai.t < this.nextSlowZoneT) return;
    const rnd = mulberry32(hashStr(this.seed + 'slow' + Math.floor(this.ai.t)));
    const seg = Math.floor(rnd() * Math.max(1, ZONES - 2));
    const durMin = 5 + Math.floor(rnd() * 6);
    const zone = { fromS: seg * ZONE_LEN, toS: Math.min(S.totalLen, (seg + 2) * ZONE_LEN), untilT: this.ai.t + durMin * MIN };
    this.baseline.slowZone = zone; this.ai.slowZone = zone;
    if(this.onExogenous)this.onExogenous('traffic',zone);
    this.nextSlowZoneT = this.ai.t + (8 + Math.floor(rnd() * 7)) * MIN;
    this.logEvent(`เกิดจุดรถติดช่วง ${STOPS.reduce((best, st) => Math.abs(S.stopS[st.id] - zone.fromS) < Math.abs(S.stopS[best.id] - zone.fromS) ? st : best).name} (นาน ~${durMin} นาที)`, 'info');
  }

  // ── เช็คกำลังรถไม่พอ  ต้องเสนอเพิ่มรถ/คนขับ ไม่ใช่เกลี่ยคน ─────────────────
  capacityCheck() {
    if (this.ai.t < this.nextCapacityCheckT) return;
    this.nextCapacityCheckT = this.ai.t + 5 * MIN;
    const m = this.ai.metrics();
    if (m.windowN.attempts > 200 && m.passUpRate > 0.10) {
      const exists = this.ai.recommendations.some((r) => r.type === 'capacity_alert' && r.status === 'pending');
      if (!exists) {
        this.ai.pushRecommendation({
          type: 'capacity_alert', shiftMin: 0, dir: 1,
          title: 'กำลังบริการไม่พอต่อจำนวนผู้รอ (ระยะเร่งด่วน)',
          detail: `อัตราขึ้นรถไม่ได้ ${(m.passUpRate * 100).toFixed(1)}% จากตัวอย่าง ${m.windowN.attempts} ครั้ง — ระบบปรับจังหวะไม่ช่วยพอ ต้องเสนอเพิ่มรถ/คนขับ/งบตามขั้นตอน ไม่ใช่การเกลี่ยคน`,
          rule: 'ห้ามแก้ด้วยการตัดเที่ยวหรือให้รถข้ามคนรอ — ต้องเพิ่มกำลังบริการจริง',
        });
      }
    }
  }

  // ── วงจรหลัก ──────────────────────────────────────────────────────────────
  tick() {
    const dt = this.simSpeed; // วินาทีจำลองต่อการ tick หนึ่งครั้ง (1 วิจริง)
    this.env = { rain: this.rain, rush: this.rush, mode: this.mode, trafficScale:this.trafficScale ?? 1,contextSpeedFactor:this.externalAssumptions?.speedFactor??1,contextDwellFactor:this.externalAssumptions?.dwellFactor??1,contextDemandFactor:this.externalAssumptions?.demandFactor??1,contextScenario:this.externalAssumptions?.scenario||null };
    this.generateDemand();
    this.maybeSlowZone();
    const sub = Math.max(1, Math.ceil(dt / 5));
    for (let i = 0; i < sub; i++) {
      const d = dt / sub;
      this.baseline.step(d, this.env);
      this.ai.step(d, this.env);
    }
    this.baseline.detectBunching();
    this.ai.detectBunching();
    this.capacityCheck();
    this.processRecommendations();
  }

  processRecommendations() {
    for (const r of this.ai.recommendations) {
      if (r.status !== 'pending') continue;
      if (this.mode === 'stopped') { r.status = 'suppressed'; r.decidedNote = 'Kill Switch: ระงับคำแนะนำ AI กลับสู่แผนเดิม'; this.auditPush('ระบบ', 'ระงับคำแนะนำ ' + r.id, r.title); continue; }
      if (this.ai.t - r.t > 10 * MIN) { r.status = 'expired'; continue; }
      if (this.autoApprove && this.ai.t - r.t >= 30) {
        this.decide(r.id, 'approved', 'โหมดสาธิต: นายท่าอนุมัติอัตโนมัติ');
      }
    }
  }

  // ── คำตัดสินใจของนายท่า (อนุมัติ/ปฏิเสธ) พร้อม Audit Log ────────────────────
  decide(recId, decision, note) {
    if (String(recId).startsWith('OPS')) return this.operations ? this.operations.decide(recId, decision, note) : { ok: false, error: 'operations unavailable' };
    const r = this.ai.recommendations.find((x) => x.id === recId);
    if (!r || r.status !== 'pending') return { ok: false, error: 'ไม่พบคำแนะนำ หรือถูกตัดสินใจไปแล้ว' };
    r.status = decision === 'approved' ? 'approved' : 'rejected';
    r.decidedAt = this.ai.t; r.decidedNote = note || '';
    if (decision === 'approved') {
      if (r.type === 'capacity_alert') {
        this.auditPush('นายท่า', 'รับทราบ ' + r.id, 'บันทึกและส่งต่อขอกำลังบริการเพิ่มตามขั้นตอน');
      } else {
        const d = String(r.dir);
        const proposed = this.ai.terminalShift[d] + r.shiftMin * MIN;
        this.ai.terminalShift[d] = Math.max(-2 * MIN, Math.min(ROUTE.maxFrameMin * MIN, proposed));
        this.auditPush('นายท่า', 'อนุมัติ ' + r.id, `${r.title} — เลื่อน ${r.shiftMin > 0 ? '+' : ''}${r.shiftMin} นาที (สะสมในกรอบที่อนุมัติ)`);
      }
    } else {
      this.auditPush('นายท่า', 'ใช้แผนเดิม (ปฏิเสธ ' + r.id + ')', r.title);
    }
    return { ok: true };
  }

  auditPush(actor, action, detail) {
    this.audit.push({ tReal: new Date().toISOString(), tSim: fmtClock(this.ai.t), actor, action, detail });
    if (this.audit.length > 300) this.audit.splice(0, this.audit.length - 300);
  }
  logEvent(msg, level) {
    this.engineEvents.push({ tSim: fmtClock(this.ai.t), msg, level });
    if (this.engineEvents.length > 60) this.engineEvents.splice(0, this.engineEvents.length - 60);
  }

  // ── Chaos controls ────────────────────────────────────────────────────────
  control(body) {
    const a = body.action;
    switch (a) {
      case 'speed': this.simSpeed = [1, 2, 5, 10, 30, 60, 120].includes(body.value) ? body.value : this.simSpeed; break;
      case 'slowzone': {
        // Mission Control: บังคับสร้างจุดรถติดกลางสายทันที (สำหรับสาธิต/ทดสอบ)
        const seg = Math.floor(ZONES / 3);
        const zone = { fromS: seg * ZONE_LEN, toS: Math.min(S.totalLen, (seg + 3) * ZONE_LEN), untilT: this.ai.t + 8 * MIN };
        this.baseline.slowZone = zone; this.ai.slowZone = zone;
        if(this.onExogenous)this.onExogenous('traffic',zone);
        this.nextSlowZoneT = this.ai.t + 10 * MIN;
        this.logEvent(`จำลองรถติดหนักกลางสายช่วง ${STOPS.reduce((best, st) => Math.abs(S.stopS[st.id] - zone.fromS) < Math.abs(S.stopS[best.id] - zone.fromS) ? st : best).name} (นาน ~8 นาที)`, 'serious');
        break;
      }
      case 'route': return this.switchRoute(String(body.value || ''));
      case 'rain': this.rain = !!body.value; this.logEvent(this.rain ? ' จำลองฝนตกหนัก (ถนนลื่น วิ่งช้าลง จอดนานขึ้น)' : 'ฝนหยุด กลับสู่สภาพปกติ', 'warning'); break;
      case 'rush': this.rush = !!body.value; this.logEvent(this.rush ? ' จำลองชั่วโมงเร่งด่วนเสริม (คนเพิ่ม รถติดขึ้น)' : 'จบชั่วโมงเร่งด่วนเสริม', 'warning'); break;
      case 'gps_out': {
        const ids = body.busId === 'all' ? this.ai.buses.map((b) => b.id) : [body.busId];
        for (const id of ids) {
          const b1 = this.ai.buses.find((b) => b.id === id), b0 = this.baseline.buses.find((b) => b.id === id);
          if (b1) { b1.gpsOutUntil = this.ai.t + 300; } // 300 วิจำลอง > เกณฑ์ 90 วิ (ให้ทันสังเกตบนหน้าจอ)
          if (b0) b0.gpsOutUntil = this.baseline.t + 300;
        }
        this.logEvent(` จำลองสัญญาณ GPS ขาด: ${ids.join(', ')} (เกิน 90 วินาที  ระบบถอนเวลาสด สลับตาราง)`, 'serious');
        break;
      }
      case 'breakdown': {
        const ids = body.busId === 'all' ? [this.ai.buses.find((b) => b.state === 'running')?.id].filter(Boolean) : [body.busId];
        for (const id of ids) {
          const b1 = this.ai.buses.find((b) => b.id === id), b0 = this.baseline.buses.find((b) => b.id === id);
          if (b1 && b1.state === 'running') { b1.state = 'broken'; b1.brokenUntil = this.ai.t + 12 * MIN; }
          if (b0 && b0.state === 'running') { b0.state = 'broken'; b0.brokenUntil = this.baseline.t + 12 * MIN; }
        }
        this.logEvent(` จำลองรถเสียกลางทาง: ${ids.join(', ')} — แผนสำรอง: แจ้งเที่ยวที่กระทบ ไม่แสดงเวลาปลอม`, 'serious');
        break;
      }
      case 'apc_fault': {
        const b1 = this.ai.buses.find((b) => b.id === body.busId);
        if (b1) { b1.apcFault = !!body.value; if (!body.value) { b1.countSource = 'apc'; b1.stopsSinceCount = 0; } }
        this.logEvent(`กล้อง AI นับคนเหนือประตูรถ ${body.busId}: ${body.value ? 'ขัดข้อง (ผ่านหลายป้ายจะขึ้น "ไม่มีข้อมูลปัจจุบัน")' : 'กลับมาใช้ได้'}`, 'warning');
        break;
      }
      case 'server_down': {
        this.degraded = !!body.value;
        this.logEvent(this.degraded ? ' จำลองเซิร์ฟเวอร์หลักขัดข้อง — หน้าสาธารณะถอนข้อมูลสด แสดงตาราง + แจ้งเตือน' : 'ระบบกลับมาปกติ ข้อมูลสดกลับเข้าหน้าสาธารณะ', 'serious');
        this.auditPush('หัวหน้าปฏิบัติการ', a, this.degraded ? 'เปิดโหมดข้อมูลขาดช่วง' : 'ปิดโหมดข้อมูลขาดช่วง');
        break;
      }
      case 'auto_approve': this.autoApprove = !!body.value; this.auditPush('นายท่า', 'ตั้งโหมดอนุมัติ', this.autoApprove ? 'อนุมัติอัตโนมัติ (สาธิต)' : 'อนุมัติด้วยมือทุกรายการ'); break;
      case 'phase': this.phaseOverride = ['train', 'tune', 'test'].includes(body.value) ? body.value : null; break;
      case 'reset': this.resetSim(); this.logEvent('รีเซ็ตการจำลองเป็น 07:00 น.', 'info'); break;
      default: return { ok: false, error: 'action ไม่รู้จัก' };
    }
    return { ok: true };
  }

  // ── Spotter & APC ─────────────────────────────────────────────────────────
  spotter(body) {
    const b = this.ai.buses.find((x) => x.id === body.busId);
    if (!b) return { ok: false, error: 'ไม่พบรถ' };
    const board = Math.max(0, parseInt(body.board) || 0);
    const alight = Math.max(0, parseInt(body.alight) || 0);
    const passUp = Math.max(0, parseInt(body.passUp) || 0);
    const before = Math.round(b.onboardEst);
    b.onboardEst = Math.max(0, before - alight + board);
    b.sigma = 0; // สมการ 3: ผู้สำรวจนับจริง = รีเซ็ตความไม่แน่นอนสะสมเป็นศูนย์ทันที
    b.countSource = 'manual'; b.stopsSinceCount = 0; b.manualHoldStops = 3; b.apcFault = false;
    if (passUp > 0) this.ai.passUps.push({ t: this.ai.t, n: passUp, stopId: body.stopId || 'S00' });
    this.ai.passUpTotal += passUp;
    const rec = { t: fmtClock(this.ai.t), busId: b.id, stopId: body.stopId || '-', stopName: STOPS.find((s) => s.id === body.stopId)?.name || '-', board, alight, passUp, before, after: Math.round(b.onboardEst), by: 'ผู้สำรวจภาคสนาม' };
    this.spotterLog.unshift(rec);
    if (this.spotterLog.length > 60) this.spotterLog.pop();
    this.auditPush('ผู้สำรวจ', 'บันทึกนับคน รถ ' + b.id, `ขึ้น ${board} ลง ${alight} ขึ้นไม่ได้ ${passUp}  คนบนรถประมาณ ${Math.round(b.onboardEst)}`);
    return { ok: true, ...rec };
  }

  apcBeam(body) {
    const b = this.ai.buses.find((x) => x.id === body.busId);
    if (!b) return { ok: false, error: 'ไม่พบรถ' };
    const dir = body.direction === 'in' ? 1 : -1;
    b.onboardEst = Math.max(0, Math.min(b.model.legalMax + 5, b.onboardEst + dir));
    b.countSource = 'apc'; b.stopsSinceCount = 0;
    this.apcLog.unshift({ t: fmtClock(this.ai.t), busId: b.id, beam: dir === 1 ? 'IN (B_cam)' : 'OUT (A_cam)', onboardEst: Math.round(b.onboardEst) });
    if (this.apcLog.length > 40) this.apcLog.pop();
    return { ok: true, onboardEst: Math.round(b.onboardEst) };
  }

  declareOrigin(body) {
    const b = this.ai.buses.find((x) => x.id === body.busId);
    if (!b) return { ok: false, error: 'ไม่พบรถ' };
    b.countSource = 'origin'; b.stopsSinceCount = 0; b.originDeclared = true;
    this.auditPush('นายท่า', 'กดสถานะต้นทาง รถ ' + b.id, 'แสดงป้ายกำกับ "สถานะเมื่อออกต้นทาง"');
    return { ok: true };
  }

  // ── ร้องเรียน (ไม่ต้องสมัครสมาชิก) ────────────────────────────────────────
  addComplaint(body) {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const id = `OT-${ymd}-${String(this.complaintSeq++).padStart(3, '0')}`;
    const emergency = body.category === 'emergency';
    const ackDue = new Date(d.getTime() + (emergency ? 4 * 3600e3 : 86400e3 * 1));
    const progDue = new Date(d.getTime() + 7 * 86400e3);
    const c = {
      id, createdAt: d.toISOString(), category: body.category || 'service', emergency,
      message: String(body.message || '').slice(0, 2000), contact: String(body.contact || '').slice(0, 200),
      channel: body.channel === 'phone' ? 'โทรศัพท์ผ่านเจ้าหน้าที่' : 'เว็บ (ไม่ต้องมีบัญชี)',
      status: 'received', ackDue: ackDue.toISOString(), progressDue: progDue.toISOString(),
      history: [{ t: d.toISOString(), note: emergency ? 'เหตุฉุกเฉิน: ส่งต่อหัวหน้าปฏิบัติการทันที' : 'รับเรื่องแล้ว — ออกเลขรับเรื่องให้ผู้แจ้ง' }],
    };
    this.complaints.unshift(c);
    if (this.complaints.length > 200) this.complaints.pop();
    this.auditPush('ระบบร้องเรียน', 'รับเรื่อง ' + id, `หมวด ${c.category}${emergency ? ' (ฉุกเฉิน-ส่งต่อทันที)' : ''}`);
    return c;
  }
  updateComplaint(id, action) {
    const c = this.complaints.find((x) => x.id === id);
    if (!c) return { ok: false, error: 'ไม่พบเรื่อง' };
    if (action === 'ack') c.status = 'acked';
    else if (action === 'progress') c.status = 'progress';
    else if (action === 'resolve') c.status = 'resolved';
    else return { ok: false, error: 'action ไม่รู้จัก' };
    c.history.push({ t: new Date().toISOString(), note: { ack: 'เจ้าหน้าที่รับทราบเรียบร้อย', progress: 'แจ้งความคืบหน้าแก่ผู้แจ้ง', resolve: 'ดำเนินการแล้วเสร็จ — ปิดเรื่อง' }[action] });
    return { ok: true, complaint: c };
  }

  // ── Governance: Roadmap / Kill Switch / Charter ───────────────────────────
  defaultRoadmap() {
    return {
      phases: [
        { title: 'สัปดาห์ 1–2 · ตรวจเอกสารและขอบเขต', gates: ['ตรวจเอกสารเส้นทาง/ใบอนุญาต', 'ยืนยันรถ-กะ-ความจุ', 'รายการจุดจอดที่ใช้ได้', 'สิทธิใช้ข้อมูล GPS ชัดเจน', 'งบและผู้รับผิดชอบระบุตัวจริง'] },
        { title: 'สัปดาห์ 3–6 · เก็บสภาพก่อนทดลอง', gates: ['สุ่มนับคน/เวลารอครบป้ายเป้าหมาย', 'รับฟังผู้ใช้และพนักงาน', 'กำหนดขนาดตัวอย่างจากความแปรปรวนจริง'] },
        { title: 'สัปดาห์ 7–8 · ระบบทำงานเงียบ', gates: ['ระบบเสนอคำแนะนำโดยไม่ใช้จริง', 'ทดสอบข้อมูลขาดช่วง/ระบบล่มผ่าน', 'ขั้นตอนถอยกลับ (rollback) ทดลองได้จริง'] },
        { title: 'สัปดาห์ 9–14 · เปิดจัดรอบในขอบเขตที่อนุมัติ', gates: ['เปิดเฉพาะขอบเขตที่อนุมัติ', 'เปิดข้อมูลเฉพาะที่ผ่านเกณฑ์', 'ติดตามผลรายสัปดาห์ 7 กลุ่ม'] },
        { title: 'สัปดาห์ 15–16 · วิเคราะห์และตัดสินใจ', gates: ['รายงานก่อน–หลังแยกกลุ่ม', 'ต้นทุนจริงเทียบงบ', 'มติ ทำต่อ/แก้/ยุติ พร้อมเหตุผล'] },
      ],
      done: {},
    };
  }
  setGate(phaseIdx, gateIdx, done) {
    this.roadmap.done[`${phaseIdx}:${gateIdx}`] = !!done;
    return { ok: true };
  }
  setKillSwitch(on, reason) {
    if (on) for (const b of this.ai.buses) { b.operationHoldUntil = 0; b.operationReleaseAt = null; }
    this.killSwitch = { on: !!on, reason: String(reason || '').slice(0, 300), tReal: on ? new Date().toISOString() : null };
    if (on) {
      this.mode = 'stopped';
      this.logEvent(' KILL SWITCH: ระงับคำแนะนำ AI ทั้งหมด — กลับแผนเดิมที่อนุมัติไว้ (รถยังให้บริการตามปกติ)', 'serious');
      this.auditPush('หัวหน้าปฏิบัติการ', 'Kill Switch เปิด', reason || 'พบการฝ่าฝืนเงื่อนไขบริการ/ผลกระทบต่อสิทธิผู้โดยสาร');
    } else {
      this.mode = 'normal';
      this.logEvent('Kill Switch ปิด — ระบบกลับมาทำงานตามขอบเขตที่อนุมัติ', 'info');
      this.auditPush('หัวหน้าปฏิบัติการ', 'Kill Switch ปิด', 'กลับสู่การทำงานปกติ');
    }
    return { ok: true };
  }
  saveCharter(body) { this.charter = { ...body, savedAt: new Date().toISOString() }; return { ok: true }; }

  // ── โมเดล AI: shadow / approve / rollback ─────────────────────────────────
  setModelRelease(action, note) {
    if (action === 'approve') {
      const m = this.ai.metrics();
      const test = m.eta.maeByPhase.test;
      const gate = test.hist && test.ai && test.ai <= test.hist * 0.9;
      if (!gate) return { ok: false, error: 'ยังไม่ผ่านเกณฑ์: ต้องมีข้อมูลเฟสทดสอบและ MAE ดีขึ้น ≥ 10%' };
      this.modelRelease = 'live';
    } else if (action === 'rollback') this.modelRelease = 'rolled_back';
    else if (action === 'shadow') this.modelRelease = 'shadow';
    else return { ok: false, error: 'action ไม่รู้จัก' };
    this.releaseHistory.push({ tReal: new Date().toISOString(), tSim: fmtClock(this.ai.t), action, note: note || '', release: this.modelRelease });
    this.auditPush('ผู้ดูแลโมเดล', 'เปลี่ยนรุ่นโมเดล  ' + this.modelRelease, note || '');
    return { ok: true, release: this.modelRelease };
  }
  phaseNow() { return this.phaseOverride || envPhase(this.ai.t); }

  // ── GTFS Realtime (JSON preview ตามโครงสร้างมาตรฐาน) ──────────────────────
  gtfsFeed() {
    const w = this.ai;
    const entities = [];
    const occMap = { 0: 'MANY_SEATS_AVAILABLE', 1: 'STANDING_ROOM_ONLY', 2: 'CRUSHED_STANDING_ROOM_ONLY' };
    for (const b of w.buses) {
      if (b.state === 'out') continue;
      const crowd = w.publicCrowding(b);
      const ent = {
        id: `VP-${b.id}`,
        vehicle: {
          trip: { tripId: `R1-${b.dir === 1 ? 'out' : 'in'}-${b.tripNo}`, routeId: 'R1', directionId: b.dir === 1 ? 0 : 1 },
          position: { latitude: +pointAt(b).lat.toFixed(6), longitude: +pointAt(b).lng.toFixed(6), bearing: Math.round(pointAt(b).bearing) },
          currentStopSequence: STOPS.indexOf(STOPS.find((s) => s.id === STOPS[b.nextStopIdx].id)) + 1,
          stopId: STOPS[b.nextStopIdx].id,
          currentStatus: b.state === 'dwell' ? 'STOPPED_AT' : 'IN_TRANSIT_TO',
          timestamp: Math.round(w.t),
          vehicle: { id: b.id, label: `สาย 1 · ${b.label}` },
        },
      };
      if (crowd.level >= 0) { ent.vehicle.occupancyStatus = occMap[crowd.level]; ent.vehicle.occupancyPercentage = Math.round(100 * b.onboardEst / b.model.legalMax); }
      entities.push(ent);
      // TripUpdate: 3 ป้ายถัดไป (เฉพาะเมื่อ GPS ไม่ขาด)
      if (b.gpsOk && b.state !== 'terminal') {
        const stu = [];
        let idx = b.nextStopIdx, steps = 0;
        while (steps++ < 3) {
          const eta = this.ai.predictSeconds(b, idx, this.modelRelease === 'live' ? 'ai' : 'hist');
          stu.push({ stopId: STOPS[idx].id, arrival: { time: Math.round(w.t + eta), uncertainty: this.modelRelease === 'live' ? 90 : 300 } });
          const nx = idx + b.dir;
          if (nx < 0 || nx >= STOPS.length) break;
          idx = nx;
        }
        entities.push({ id: `TU-${b.id}`, tripUpdate: { trip: { tripId: `R1-${b.dir === 1 ? 'out' : 'in'}-${b.tripNo}`, routeId: 'R1', directionId: b.dir === 1 ? 0 : 1 }, timestamp: Math.round(w.t), stopTimeUpdate: stu } });
      }
    }
    // Alert: เหตุการณ์ล่าสุด 10 นาที
    const recent = w.incidents.filter((i) => w.t - i.tSec < 10 * MIN).slice(-4);
    for (const inc of recent) {
      entities.push({
        id: 'AL-' + Math.round(inc.tSec),
        alert: {
          informedEntity: [{ routeId: 'R1' }],
          activePeriod: [{ start: Math.round(inc.tSec - 300) }],
          cause: inc.level === 'serious' ? 'OTHER_CAUSE' : 'UNKNOWN_CAUSE',
          effect: inc.level === 'serious' ? 'SIGNIFICANT_DELAYS' : 'OTHER_EFFECT',
          headerText: { translation: [{ text: inc.msg, language: 'th' }, { text: 'OmniTransit service notice (demo)', language: 'en' }] },
        },
      });
    }
    if (this.degraded) {
      entities.push({
        id: 'AL-FEED',
        alert: {
          informedEntity: [{ routeId: 'R1' }],
          activePeriod: [{ start: Math.round(w.t) }],
          cause: 'OTHER_CAUSE', effect: 'NO_SERVICE',
          headerText: { translation: [{ text: 'ระบบข้อมูลสดขัดข้องชั่วคราว — โปรดใช้ตารางเดินรถมาตรฐาน', language: 'th' }, { text: 'Live feed temporarily unavailable — please use the printed timetable.', language: 'en' }] },
        },
      });
    }
    return {
      header: { gtfs_realtime_version: '2.0', incrementality: 'FULL_DATASET', timestamp: Math.round(w.t) },
      entity: entities,
    };
  }

  // ── เครื่องคำนวณจำนวนรถขั้นต่ำ + ผลเทียบ KPI ───────────────────────────────
  minFleetCalc() {
    const speeds = this.ai.buses.filter((b) => b.state !== 'out').map((b) => b.model.baseKmh);
    const avgKmh = speeds.reduce((a, c) => a + c, 0) / Math.max(1, speeds.length);
    const oneWayMin = (S.totalLen / 1000) / avgKmh * 60 * (this.rush || this.rain ? 1.4 : 1);
    const layoverMin = ROUTE.minLayoverMin;
    const cycleMin = oneWayMin * 2 + layoverMin * 2;
    const headway = ROUTE.targetHeadwayMin;
    const N = Math.ceil(cycleMin / headway);
    const available = this.ai.buses.filter((b) => b.state !== 'out').length;
    // ความจุรวมต่อชั่วโมงเทียบคนที่มาถึงชั่วโมงวิกฤต
    const tripsPerHour = 60 / headway;
    const avgLegalMax = this.ai.buses.reduce((a, b) => a + b.model.legalMax, 0) / this.ai.buses.length;
    const capacityPerHour = tripsPerHour * avgLegalMax;
    const m = this.ai.metrics();
    const peakArrivalsPerHour = Math.round((m.windowN.attempts / Math.max(1, (this.ai.t - 7 * 3600) / 3600)) * (this.rush ? 1 : 1.6));
    return {
      oneWayMin: +oneWayMin.toFixed(1), cycleMin: +cycleMin.toFixed(1), headway,
      minFleet: N, available, shortfall: Math.max(0, N - available),
      avgLegalMax: Math.round(avgLegalMax), capacityPerHour: Math.round(capacityPerHour),
      peakDemandPerHour: peakArrivalsPerHour,
      demandExceedsCapacity: peakArrivalsPerHour > capacityPerHour,
      formula: `ปัดขึ้น((${oneWayMin.toFixed(1)}×2 + ${layoverMin}×2) ÷ ${headway}) = ${N} คัน`,
    };
  }

  comparison() {
    const b = this.baseline.metrics(), a = this.ai.metrics();
    const pctDelta = (base, val) => (base && base > 0 ? +(((val - base) / base) * 100).toFixed(1) : null);
    const cmp = {
      avgWait: { baseline: b.avgWaitMin, ai: a.avgWaitMin, deltaPct: pctDelta(b.avgWaitMin, a.avgWaitMin), targetPct: -10 },
      p90Wait: { baseline: b.p90WaitMin, ai: a.p90WaitMin, deltaPct: pctDelta(b.p90WaitMin, a.p90WaitMin), targetPct: 0 },
      passUpRate: { baseline: b.passUpRate, ai: a.passUpRate, deltaPct: pctDelta(b.passUpRate, a.passUpRate), targetPct: -15 },
      headwayCV: { baseline: b.headwayCV, ai: a.headwayCV, deltaPct: pctDelta(b.headwayCV, a.headwayCV) },
      paxServed: { baseline: b.paxServed, ai: a.paxServed },
      tripsDeparted: { baseline: b.tripsDeparted, ai: a.tripsDeparted },
    };
    cmp.pass =
      (cmp.avgWait.deltaPct !== null && cmp.avgWait.deltaPct <= -10) &&
      (cmp.p90Wait.deltaPct === null || cmp.p90Wait.deltaPct <= 0) &&
      (cmp.passUpRate.deltaPct !== null && cmp.passUpRate.deltaPct <= -15);
    return cmp;
  }

  // ── สภาพจราจรรายโซน ~150 ม. (จากความเร็วจริงที่รถวิ่งผ่าน EWMA เทียบค่าย้อนหลัง) ──
  trafficLevels() {
    const hist = histSpeedKmh(this.ai.t);
    return this.ai.aiSegSpeed.map((kmh, i) => {
      const ratio = kmh / Math.max(1, hist);
      const level = ratio >= 1.08 ? 0 : ratio >= 0.72 ? 1 : 2; // 0 ไหลลื่น / 1 ปานกลาง / 2 ติดขัด
      return {
        i, kmh: Math.round(kmh * 10) / 10, ratio: Math.round(ratio * 100) / 100, level,
        fromS: Math.round(i * ZONE_LEN), toS: Math.round(Math.min(S.totalLen, (i + 1) * ZONE_LEN)),
      };
    });
  }

  // ── Real AI Forecaster: สร้างบริบทการเดินทางจริงเพื่อส่งให้ OpenAI ──────────
  aiCrowdContext({ busId, stopId, dir } = {}) {
    const w = this.ai;
    let bus = busId ? w.buses.find((b) => b.id === busId) : null;
    if (!bus && stopId && dir) {
      const stopS = S.stopS[stopId], d = Number(dir);
      bus = w.buses
        .filter((b) => b.dir === d && (b.state === 'running' || b.state === 'dwell') && b.gpsOk)
        .map((b) => ({ b, dist: d === 1 ? stopS - b.pF : b.pF - stopS }))
        .filter((x) => x.dist > 5)
        .sort((a, z) => a.dist - z.dist)[0]?.b;
    }
    if (!bus) bus = w.buses.find((b) => b.state === 'running') || w.buses[0];
    const d = bus.dir;
    const distToStop = (sid) => (d === 1 ? S.stopS[sid] - bus.pF : bus.pF - S.stopS[sid]);
    const target = (stopId && distToStop(stopId) > 5) ? STOPS.find((s) => s.id === stopId) : STOPS[bus.nextStopIdx];
    const targetIdx = STOPS.indexOf(target);
    const etaSec = w.predictSeconds(bus, targetIdx, 'ai');
    const ahead = w.buses
      .filter((b) => b !== bus && b.dir === d && (b.state === 'running' || b.state === 'dwell'))
      .map((b) => ({ b, gap: d === 1 ? b.pF - bus.pF : bus.pF - b.pF }))
      .filter((x) => x.gap > 0)
      .sort((a, z) => a.gap - z.gap)[0];
    const speedPair = ahead ? Math.max(4, (ahead.b.speedKmh + bus.speedKmh) / 2) : 15;
    const headwayMin = ahead ? +((ahead.gap / 1000) / speedPair * 60).toFixed(1) : null;
    const seg = bus.segIndexAt();
    const near = [w.aiSegSpeed[seg], w.aiSegSpeed[Math.min(w.aiSegSpeed.length - 1, seg + 1)], w.aiSegSpeed[Math.max(0, seg - 1)]].filter(Boolean);
    const avgSpeed = +(near.reduce((a, c) => a + c, 0) / near.length).toFixed(1);
    const histSpd = histSpeedKmh(w.t);
    const trafficLevel = avgSpeed >= histSpd * 1.08 ? 'ไหลลื่น' : avgSpeed >= histSpd * 0.72 ? 'ปานกลาง' : 'ติดขัด';
    const between = [];
    let idx = bus.nextStopIdx, guard = 0;
    while (guard++ < 4) {
      const st = STOPS[idx];
      between.push({ stop_id: st.id, stop_name: st.name, waiting_now: w.queues.get(st.id + ':' + d).size });
      if (idx === targetIdx) break;
      const nx = idx + d;
      if (nx < 0 || nx >= STOPS.length) break;
      idx = nx;
    }
    const last = bus.lastArrival;
    const pos = pointAtS(S, Math.max(0, Math.min(S.totalLen, bus.pF)));
    const hour = Math.floor(w.t / 3600) % 24;
    // ── สมการ 1-3: ผลลัพธ์ตัวเลขจากโมเดลเชิงกำหนดของเอนจิน (ส่งให้ OpenAI เป็นฐานคณิตศาสตร์) ──
    const propAll = w.propagateLoad(bus, d === 1 ? STOPS.length - 1 : 0);
    const tgtIdxInSteps = propAll.steps.findIndex((x) => x.idx === targetIdx);
    const tgtStep = tgtIdxInSteps >= 0 ? propAll.steps[tgtIdxInSteps] : null;
    const upto = tgtIdxInSteps >= 0 ? propAll.steps.slice(0, tgtIdxInSteps + 1) : [];
    const runMinToTarget = +(upto.reduce((a, c) => a + c.run, 0) / 60).toFixed(1);
    const dwellMinToTarget = +(upto.reduce((a, c) => a + c.dwell, 0) / 60).toFixed(1);
    const deterministicModel = {
      currentOnboard: Math.round(bus.onboardEst),
      uncertaintySigma: +((bus.sigma || 0)).toFixed(1),
      propagatedEstimateAtTargetStop: tgtStep
        ? { N_hat: tgtStep.n0, sigma: tgtStep.sig, expected_board: tgtStep.board, expected_alight: tgtStep.alight, pass_up_hat: tgtStep.passUp }
        : null,
      expectedIntermediateBoardings: upto.reduce((a, c) => a + c.board, 0),
      expectedIntermediateAlightings: upto.reduce((a, c) => a + c.alight, 0),
      headwayMin: propAll.headwayMin,
      coupledEtaMin: tgtStep ? +(tgtStep.eta / 60).toFixed(1) : null,
      etaBreakdownMin: tgtStep ? { run: runMinToTarget, dwell: dwellMinToTarget, dwell_stops: upto.length } : null,
      dwellParams: { tau0_sec: 9, alpha_sec_per_board: bus.model.boardSec, beta_sec_per_alight: 1.4, crowding_penalty_threshold: 0.75, penalty_factor: 1.35 },
      note: 'ตัวเลขจากสมการไหลสะสมรายป้าย/ETA คูณขวักไขว่/ความไม่แน่นอนสะสมของเอนจิน (สมการที่ 1-3) — ใช้เป็นฐานคณิตศาสตร์ ปรับได้เล็กน้อยตามจราจร-อากาศและต้องอ้างเหตุผลจากตัวเลขชุดนี้',
    };
    return {
      route: { id: ROUTE.id, code: ROUTE.code, name: ROUTE.name },
      bus: {
        id: bus.id, model: bus.model.id, model_name: bus.model.name,
        seats: bus.model.seats, standing_capacity: bus.model.standing,
        legal_max: bus.model.legalMax, wheelchair_bay: bus.model.wheelchair || 0,
        gps_ok: bus.gpsOk,
      },
      current: {
        lat: +pos.lat.toFixed(5), lng: +pos.lng.toFixed(5),
        speed_kmh: bus.speedKmh, onboard_estimate_now: Math.round(bus.onboardEst),
        next_stop: STOPS[bus.nextStopIdx].name,
      },
      target_stop: { id: target.id, name: target.name, distance_m: Math.round(Math.max(0, distToStop(target.id))), eta_minutes: +(etaSec / 60).toFixed(1) },
      headway_minutes_to_bus_ahead: headwayMin,
      traffic: { average_speed_kmh: avgSpeed, level: trafficLevel },
      conditions: {
        raining: !!this.rain,
        rush_hour: (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19) || !!this.rush,
        sim_clock: fmtClock(w.t),
      },
      recent_stop_flow: last ? {
        last_stop_name: STOPS[last.stopIdx].name, boarded: last.board, alighted: last.alight,
        pass_up: last.passUp, stops_since_last_count: bus.stopsSinceCount,
      } : { last_stop_name: null, boarded: null, alighted: null, pass_up: null, stops_since_last_count: bus.stopsSinceCount },
      stops_between_with_waiting: between,
      deterministic_model: deterministicModel,
      analysis_note: 'ข้อมูลจากเอนจินจำลองสด ให้เหตุผลอ้างเฉพาะตัวเลขในบริบทนี้ ห้ามสมมติข้อมูลอื่น',
    };
  }

  /** เอนจินคณิตศาสตร์ 4 สมการ (Hybrid fallback) — ใช้เมื่อไม่มี Key หรือเรียก OpenAI ไม่สำเร็จ
   *  คำนวณจาก deterministic_model ชุดเดียวกับที่ส่งให้ LLM แล้วสังเคราะห์คำอธิบายไทยจากตัวเลขจริง */
  localPredict(ctx, callResult) {
    const dm = ctx.deterministic_model || {};
    const bus = this.ai.buses.find((b) => b.id === ctx.bus.id);
    const model = bus ? bus.model : { seats: 30, standing: 30, legalMax: 60, name: ctx.bus.model_name };
    const prop = dm.propagatedEstimateAtTargetStop || {};
    const now = Math.max(0, Math.round(dm.currentOnboard ?? 0));
    const sigma = +(dm.uncertaintySigma ?? 0).toFixed(1);
    const pred = Math.max(0, Math.min(model.legalMax, Math.round(prop.N_hat ?? now)));
    const seated = Math.min(pred, model.seats);
    const standing = Math.max(0, pred - seated);
    const level = pred < model.seats ? 0 : pred < model.seats + 0.65 * model.standing ? 1 : 2;
    const board = Math.round(dm.expectedIntermediateBoardings ?? 0);
    const alight = Math.round(dm.expectedIntermediateAlightings ?? 0);
    const etaMin = dm.coupledEtaMin;
    const brk = dm.etaBreakdownMin;
    // ความเสี่ยงขึ้นไม่ได้: ถ้าคาดการณ์+คนขึ้นเกินความจุ = ล้นจริง, ไม่งั้นไล่ตาม load factor (0 ถึง 75% จุ, เต็มคัน = 50%)
    let risk;
    if ((prop.N_hat ?? now) + (prop.expected_board ?? 0) > model.legalMax) {
      risk = Math.min(100, 50 + Math.round((((prop.N_hat ?? now) + (prop.expected_board ?? 0) - model.legalMax) / model.legalMax) * 250));
    } else {
      risk = Math.max(0, Math.min(95, Math.round(((pred / model.legalMax) - 0.75) * 200)));
    }
    if (prop.pass_up_hat != null && prop.pass_up_hat > 0) risk = Math.max(risk, 40);
    // สังเคราะห์คำอธิบายจากตัวเลขจริงเท่านั้น
    const why = [];
    why.push(`คัน ${ctx.bus.id} ตอนนี้มีผู้โดยสารราว ${now}${sigma ? ' ± ' + sigma : ''} คน`);
    if (board || alight) why.push(`ระหว่างทางถึง${ctx.target_stop.name} คาดว่าจะมีคนลงราว ${alight} คน และคนขึ้นเพิ่มราว ${board} คน จากคนรอสะสมรายป้าย`);
    if (etaMin != null) why.push(`ใช้เวลาอีกประมาณ ${etaMin} นาที${brk ? ` (วิ่ง ~${brk.run} นาที + จอดรับ-ส่ง ${brk.dwell_stops} ป้าย ~${brk.dwell} นาที)` : ''}`);
    const hw = dm.headwayMin;
    if (hw != null) why.push(hw < 5 ? `ระยะห่างรถคันหน้าเพียง ${hw} นาที — คนรอบางส่วนอาจขึ้นคันหน้าไปก่อน` : `ระยะห่างรถคันหน้า ${hw} นาที ยังไม่เข้าเกณฑ์รถติดกัน`);
    why.push(`จราจรเฉลี่ย ~${ctx.traffic.average_speed_kmh} กม./ชม.${ctx.conditions.raining ? ' · ฝนตก (วิ่งช้า จอดนาน)' : ''}${ctx.conditions.rush_hour ? ' · ช่วงเร่งด่วน' : ''}`);
    why.push(`คาดว่าเมื่อถึงป้ายคุณจะมี ${pred} ± ${sigma} คน (นั่ง ${seated} · ยืน ${standing} จากความจุตามกฎหมาย ${model.legalMax} คน)`);
    const reasoning = why.join(' · ');
    return {
      ok: true,
      data: {
        bus_id: ctx.bus.id, model_name: ctx.bus.model_name, target_stop: ctx.target_stop.name,
        predicted_passengers: pred, seated_count: seated, standing_count: standing,
        crowding_level: level, pass_up_risk_percent: risk,
        deterministic: {
          propagated: prop.N_hat != null ? prop : null,
          coupled_eta_min: etaMin ?? null,
          headway_min: hw ?? null,
        },
        ai_reasoning_th: reasoning.slice(0, 400),
        ai_model: 'local-4eq',
        predictor: 'local',
        predictor_note: 'ประมวลผลด้วยเอนจินคณิตศาสตร์ 4 สมการ' + (callResult && callResult.error ? ` (เรียก OpenAI ไม่สำเร็จ: ${callResult.error})` : ' (ยังไม่ได้ใส่ OpenAI Key)'),
        context_clock: ctx.conditions.sim_clock,
      },
    };
  }

  /** เรียก OpenAI พยากรณ์ความแน่น — sanitize ผลลัพธ์ให้อยู่ในกรอบความจุรุ่นรถเสมอ */
  aiPredict({ busId, stopId, dir } = {}) {
    const ctx = this.aiCrowdContext({ busId, stopId, dir });
    const cacheKey = `crowd:${ctx.bus.id}:${ctx.target_stop.id}:${ctx.current.onboard_estimate_now}`;
    return ai.cached(cacheKey, async () => {
      const r = await ai.callOpenAI(ctx);
      if (!r.ok) return this.localPredict(ctx, r); // Hybrid: ไม่มี Key / API ล้ม → เอนจินคณิตศาสตร์ทันที
      const raw = r.raw || {};
      const bus = this.ai.buses.find((b) => b.id === ctx.bus.id);
      const model = bus ? bus.model : { seats: 30, standing: 30, legalMax: 60 };
      const clampInt = (v, lo, hi, fb) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
      };
      const predicted = clampInt(raw.predicted_passengers, 0, model.legalMax, ctx.current.onboard_estimate_now);
      let seated = clampInt(raw.seated_count, 0, model.seats, Math.min(predicted, model.seats));
      seated = Math.min(seated, predicted);
      const standing = Math.max(0, predicted - seated);
      let level = Number(raw.crowding_level);
      if (![0, 1, 2].includes(level)) {
        level = predicted < model.seats ? 0 : predicted < model.seats + 0.65 * model.standing ? 1 : 2;
      }
      const risk = clampInt(raw.pass_up_risk_percent, 0, 100, 0);
      const reasoning = String(raw.ai_reasoning_th || '').replace(/\s+/g, ' ').trim().slice(0, 320);
      return {
        ok: true,
        data: {
          bus_id: ctx.bus.id, model_name: ctx.bus.model_name, target_stop: ctx.target_stop.name,
          predicted_passengers: predicted, seated_count: seated, standing_count: standing,
          crowding_level: level, pass_up_risk_percent: risk,
          // สมการ 1-3: ฐานตัวเลขเชิงกำหนดที่ให้โมเดลใช้วิเคราะห์ (โปร่งใสเทียบกับคำตอบ AI)
          deterministic: {
            propagated: ctx.deterministic_model?.propagatedEstimateAtTargetStop || null,
            coupled_eta_min: ctx.deterministic_model?.coupledEtaMin ?? null,
            headway_min: ctx.deterministic_model?.headwayMin ?? null,
          },
          ai_reasoning_th: reasoning || 'ไม่มีคำอธิบายจากโมเดล',
          ai_model: ai.status().model, predictor: 'openai', context_clock: ctx.conditions.sim_clock,
        },
      };
    });
  }

  // ── สแนปชอตรวมสำหรับหน้าจอ ────────────────────────────────────────────────
  snapshot(scope) {
    const aiOps = this.ai.snapshot(true);
    const baseOps = this.baseline.snapshot(true);
    const publicMasked = scope === 'public' && this.degraded;
    const payload = {
      version: 'OmniTransit v5',
      routeId: this.routeId,
      mode: this.mode,
      degraded: this.degraded,
      simSpeed: this.simSpeed,
      rain: this.rain, rush: this.rush,
      autoApprove: this.autoApprove,
      modelRelease: this.modelRelease,
      phase: this.phaseNow(),
      killSwitch: this.killSwitch,
      route: {
        id: ROUTE.id, code: ROUTE.code, shortCode: ROUTE.shortCode, name: ROUTE.name,
        corridor: ROUTE.corridor, color: ROUTE.color,
        // เรขาคณิตเต็มของเส้นทาง (แนวถนนจริง) แยกไว้ที่ /api/route.geo.json โหลดครั้งเดียว — ไม่แนบทุก tick
        stopS: STOPS.reduce((acc, st) => ((acc[st.id] = Math.round(S.stopS[st.id])), acc), {}),
        totalLenM: Math.round(S.totalLen),
        traffic: this.trafficLevels(),
        stopCoords: STOPS.map((st) => ({ id: st.id, name: st.name, lat: S.stopPos[st.id].lat, lng: S.stopPos[st.id].lng, survey: st.survey, surveyLabel: st.surveyLabel })),
      },
      ai: publicMasked ? { policy: 'ai', clock: aiOps.clock, degradedFeed: true, buses: [], stops: aiOps.stops } : aiOps,
      baseline: baseOps,
      minFleet: this.minFleetCalc(),
      comparison: this.comparison(),
      events: this.engineEvents.slice(-12),
      audit: this.audit.slice(-40).reverse(),
      spotterLog: this.spotterLog.slice(-20),
      apcLog: this.apcLog.slice(-12),
      complaints: this.complaints.slice(-30),
      roadmap: this.roadmap,
      charter: this.charter,
      releaseHistory: this.releaseHistory.slice(-10),
      busModels: Object.values(BUS_MODELS),
      fleetPlan: worldMod.routeCtx().FLEET_PLAN,
      timetableMeta: { headwayMin: ROUTE.targetHeadwayMin, start: '06:00', end: '22:00' },
      operations: this.operations ? this.operations.snapshot('simulation') : null,
    };
    return payload;
  }
  getTimetable() { return TIMETABLE; }
}

function demandMult(simSec) {
  const h = (simSec / 3600) % 24;
  if (h >= 7 && h < 9) return 2.10;
  if (h >= 16 && h < 19) return 2.00;
  if (h >= 9 && h < 16) return 1.00;
  if (h >= 19 && h < 22) return 0.70;
  return 0.40;
}
function poisson(lambda, rnd) {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L && k < 64);
  return k - 1;
}
function pointAt(b) {
  return pointAtS(S, Math.max(0, Math.min(S.totalLen, b.pF)));
}

module.exports = { Engine };
