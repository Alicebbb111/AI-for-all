'use strict';
/**
 * OmniTransit v5 — engine/world.js
 * เวิลด์จำลองการเดินรถ 1 เส้นทาง: การเคลื่อนที่บนโพลีไลน์ถนนจริง, คิวผู้โดยสาร,
 * สมการสมดุล (คนบนรถหลังป้าย = ก่อนป้าย + ขึ้น − ลง), APC/ผู้สำรวจ, โมเดล ETA 2 แบบ,
 * การตรวจจับรถติดกัน (Bus Bunching), และตัวชี้วัด KPI แบบรายงานสด
 */
const data = require('./data');
const { BUS_MODELS, buildPath, pointAtS, demandMultiplier, trafficMultiplier, histSpeedKmh } = data;

const MIN = 60;
const GPS_STALE_SEC = 90;

// ── สถานะเส้นทางปัจจุบัน — สลับสายได้ (initRoute) แล้วทุกคลาสด้านล่างอ่านค่าใหม่ผ่านขอบเขตโมดูล ──
let ROUTE, STOPS, FLEET_PLAN, S, HEADWAY, ZONES, ZONE_LEN, GEO;
function initRoute(id) {
  const def = data.routeDef(id);
  ROUTE = def.ROUTE; STOPS = def.STOPS; FLEET_PLAN = def.FLEET_PLAN;
  S = buildPath(def.ROUTE_POINTS);
  HEADWAY = ROUTE.targetHeadwayMin * MIN;
  ZONES = Math.max(2, Math.round(S.totalLen / ZONE_LEN_M));
  ZONE_LEN = S.totalLen / ZONES;
  GEO = buildGeo();
  return { ROUTE, STOPS, FLEET_PLAN, S };
}

// ── โซนจราจร: แบ่งแกนเดินรถเป็นช่วงสั้นคงยาว (~150 ม.) — เป็นหน่วยของการเรียนรู้ความเร็ว
// แยกออกจากจำนวนจุดยอดของเรขาคณิต เพื่อให้ข้อมูลสดกระชับและเรียนรู้ได้ทัน
const ZONE_LEN_M = 150;
const zoneIndexAt = (pF) => {
  const x = Math.max(0, Math.min(S.totalLen, pF));
  return Math.max(0, Math.min(ZONES - 1, Math.floor(x / ZONE_LEN)));
};

// ── ค่าคงที่ของ 4 สมการหลัก (ดู README "4 สมการหลักของเอนจินพยากรณ์") ─────────
const DWELL_TAU0_SEC = 9;            // สมการ 2: เวลาชะลอเข้าป้าย + เปิด-ปิดประตู (วินาที)
const DWELL_ALIGHT_SEC = 1.4;        // สมการ 2: เบตา — วินาทีต่อคนลง
const CROWD_DWELL_PENALTY = 1.35;    // สมการ 2: คูณเวลาจอดเมื่อ N_hat/C_max เกิน 75%
const CROWD_DWELL_THRESHOLD = 0.75;
const SIGNAL_DELAY_SEC = 14;         // สมการ 2: รอไฟแดงเฉลี่ยที่แยกหลัก (stop.signal)
const SENSOR_SIGMA_PER_STOP = 1.5;   // สมการ 3: ความไม่แน่นอนเพิ่มต่อป้ายที่ใช้เซ็นเซอร์อย่างเดียว
const FORECAST_SIGMA_PER_STOP = 2.2; // สมการ 3: ความไม่แน่นอนเพิ่มต่อป้ายที่พยากรณ์ล่วงหน้า
const RAIN_DEMAND_FACTOR = 0.85;     // สมการ 1: ปัจจัยความต้องการเดินทางเมื่อฝนตก (ตามเอนจิน demand)
const RUSH_DEMAND_FACTOR = 1.5;      // สมการ 1: ปัจจัยชั่วโมงเร่งด่วนเสริม (ตามเอนจิน demand)

const CROWD = [
  { code: 'seats',    icon: '', label: 'มีที่นั่งบางส่วน',  color: '#0ca30c' },
  { code: 'standing', icon: '', label: 'มีผู้ยืน',          color: '#fab219' },
  { code: 'dense',    icon: '', label: 'หนาแน่น',           color: '#d03b3b' },
  { code: 'unknown',  icon: '', label: 'ไม่มีข้อมูลปัจจุบัน', color: '#898781' },
];

// ── RNG แบบมีเมล็ด (สองเวิลด์เจอ demand/เหตุการณ์ชุดเดียวกัน — เทียบกันได้ยุติธรรม) ──
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson1(lambda, rnd) {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L && k < 64);
  return k - 1;
}

function crowdingLevelOf(model, est) {
  // เกณฑ์จากสัดส่วนเบาะ/พื้นที่ยืนของรถรุ่นนั้นจริง ๆ — ไม่ใช้เปอร์เซ็นต์ตายตัว
  if (est < model.seats) return 0;
  if (est < model.seats + 0.65 * model.standing) return 1;
  return 2;
}
function crowdingInfo(model, est, source, fresh) {
  if (!fresh || source === 'none') return { ...CROWD[3], level: -1 };
  const lv = crowdingLevelOf(model, est);
  return { ...CROWD[lv], level: lv };
}
function fmtClock(simSec) {
  const t = ((simSec % 86400) + 86400) % 86400;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
/** เฟสการทดสอบโมเดลตามเวลาจำลองนับจากเปิดระบบ: ฝึก (0–30 น.)  ปรับค่า (30–60 น.)  ทดสอบ (60+ น.) */
function envPhase(tSec) {
  const elapsed = tSec - 7 * 3600;
  if (elapsed < 30 * MIN) return 'train';
  if (elapsed < 60 * MIN) return 'tune';
  return 'test';
}

// ── คิวผู้โดยสารรายป้ายรายทิศ (FIFO — คนรอนานขึ้นก่อน ไม่มีการจองที่) ──────────
class Queue {
  constructor() { this.waiting = []; }
  push(t) { this.waiting.push(t); }
  take(n, now) { return this.waiting.splice(0, n).map((t) => now - t); }
  get size() { return this.waiting.length; }
}

class Bus {
  constructor(plan, i, t0, loopLen) {
    this.id = plan.id; this.label = plan.label; this.driver = plan.driver;
    this.model = BUS_MODELS[plan.model];
    this.shiftStartSec = ROUTE.serviceStartSec + plan.offsetMin * MIN;
    this.shiftEndSec = this.shiftStartSec + 9 * 3600;
    this.personalFactor = 0.92 + 0.16 * mulberry32(hashStr('pf' + plan.id))();
    // กระจายรถรอบลูปสองทิศ — เปิดระบบแล้วเห็นรถวิ่งเต็มเส้นทางทันที
    const loopPos = (i * loopLen) / FLEET_PLAN.length;
    this.dir = loopPos < loopLen / 2 ? 1 : -1;
    this.pF = loopPos < loopLen / 2 ? loopPos : loopLen - loopPos; // พิกัดบนแกนเดินหน้า 0..L
    this.state = 'running';
    this.speedKmh = 0;
    this.onboardTrue = Math.floor(6 + mulberry32(hashStr('ob' + plan.id))() * 14);
    this.onboardEst = this.onboardTrue;
    this.countSource = 'apc';
    this.stopsSinceCount = 0;
    this.apcFault = false;
    this.manualHoldStops = 0;
    this.originDeclared = false;
    this.lastFixT = t0;
    this.gpsOutUntil = 0;
    this.brokenUntil = 0;
    this.dwellUntil = 0;
    this.tripNo = i + 1;
    this.legNo = 1;
    this.nextStopIdx = this.findNextStopIdx();
    this.lastSegIdx = this.segIndexAt();
    this.lastSegT = t0;
    this.lastArrival = null;
    // สมการ 3: ความไม่แน่นอนสะสม (± คน) + บันทึกสำหรับ Bayesian Dwell Cross-Check
    this.sigma = 0;
    this._arriveT = 0;      // เวลาถึงป้ายล่าสุด → actualDwellSec
    this._apcBoard = 0;     // ยอดขึ้นตาม APC ของป้ายล่าสุด → B_apc
    this.stats = { trips: 0, driveMin: 20 + i * 3, restMin: 40 + i * 2, layoverStartT: null };
  }
  /** ระยะที่เดินไปแล้วของทิศตนเอง (0..L) */
  get pos() { return this.dir === 1 ? this.pF : S.totalLen - this.pF; }
  get gpsStaleSec() { return this._nowT - this.lastFixT; }
  get gpsOk() { return this.gpsStaleSec <= GPS_STALE_SEC; }
  findNextStopIdx() {
    const order = this.dir === 1 ? STOPS : [...STOPS].reverse();
    for (const st of order) {
      if (this.distanceToStop(STOPS.indexOf(st)) > 2) return STOPS.indexOf(st);
    }
    return this.dir === 1 ? STOPS.length - 1 : 0;
  }
  distanceToStop(stopIdx) {
    const sStop = S.stopS[STOPS[stopIdx].id];
    return this.dir === 1 ? sStop - this.pF : this.pF - sStop;
  }
  segIndexAt() {
    return zoneIndexAt(this.pF);
  }
}

// ── เวิลด์ ───────────────────────────────────────────────────────────────────
class World {
  /** policy: 'baseline' (ตารางตายตัว) | 'ai' (OmniTransit — ปรับจังหวะปล่อยรถในกรอบที่อนุมัติ) */
  constructor(policy) {
    this.policy = policy;
    this.t = 7 * 3600; // เริ่ม 07:00 ช่วงเร่งด่วน
    this.buses = FLEET_PLAN.map((p, i) => {
      const b = new Bus(p, i, this.t, S.totalLen * 2);
      b._nowT = this.t;
      return b;
    });
    this.queues = new Map();
    for (const st of STOPS) for (const d of [1, -1]) this.queues.set(st.id + ':' + d, new Queue());
    for (const st of STOPS) for (const d of [1, -1]) {
      const q = this.queues.get(st.id + ':' + d);
      // เมล็ดเดียวกันทั้งสองเวิลด์ (ไม่ผสม policy) — ให้เงื่อนไขเริ่มต้นเท่ากัน
      const rnd = mulberry32(hashStr('warm' + st.id + d));
      const warm = Math.floor(st.baseRate * 3.0 * (0.4 + rnd() * 1.4));
      for (let k = 0; k < warm; k++) q.push(this.t - Math.floor(rnd() * 420));
    }
    // โมเดล AI: ความเร็ว EWMA รายโซนจราจร (~150 ม.) + เวลาจอดเฉลี่ย (เรียนรู้จากข้อมูลสด)
    this.aiSegSpeed = Array.from({ length: ZONES }, (_, i) => histSpeedKmh(this.t) * (0.92 + 0.16 * mulberry32(hashStr('seg' + i + policy))()));
    this.aiDwellSec = 18;
    this.pendingEta = new Map();
    this.etaSamples = { hist: [], ai: [] };
    this.propSamples = []; // สมการ 1+3: ความแม่นของการไหลสะสมรายป้าย (เทียบ N_hat กับยอดประมาณตอนถึงจริง)
    this.confusion = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.crowdEvents = { total: 0, serious: 0, unknown: 0 };
    this.waits = [];
    this.waitsByStop = {};
    this.passUps = [];
    this.boardedTotal = 0; this.passUpTotal = 0;
    this.depTimes = { '1': [], '-1': [] };
    this.tripsCompleted = 0; this.tripsDeparted = 0; this.paxServed = 0;
    this.recommendations = [];
    this.nextRecId = 1;
    this.recCooldown = {};
    this.terminalShift = { '1': 0, '-1': 0 };
    this.slowZone = null;
    this.incidents = [];
    this.headwaySeries = [];
  }

  step(dt, env) {
    this.lastEnv = env || this.lastEnv || {};
    this.t += dt;
    for (const b of this.buses) { b._nowT = this.t; this.stepBus(b, dt, env); }
  }

  trafficFactor(b, env) {
    let f = trafficMultiplier(this.t);
    if (env.rain) f *= 0.62;
    if (env.rush) f *= 0.78;
    if (this.slowZone && this.slowZone.untilT > this.t) {
      if (b.pos >= this.slowZone.fromS && b.pos <= this.slowZone.toS) f *= 0.45;
    }
    return f;
  }

  stepBus(b, dt, env) {
    if (b.state === 'out') return;
    if (b.state === 'broken') {
      if (this.t >= b.brokenUntil) {
        if (mulberry32(hashStr('fix' + b.id + Math.floor(b.brokenUntil)))() < 0.65) {
          b.state = 'running';
          this.pushIncident(`รถ ${b.id} ซ่อมเสร็จ กลับเข้าบริการ`, 'info');
        } else {
          b.state = 'out';
          this.pushIncident(`รถ ${b.id} ใช้งานไม่ได้ — แจ้งตรงว่าไม่มีรถสำรอง จำนวนเที่ยวลดตามจริง`, 'serious');
        }
      }
      b.speedKmh = 0;
      return;
    }
    if (b.gpsOutUntil <= this.t) b.lastFixT = this.t;

    if (b.state === 'running') {
      const v = b.model.baseKmh * this.trafficFactor(b, env) * b.personalFactor;
      b.speedKmh = Math.round(v * 10) / 10;
      b.pF += b.dir * (v * 1000 / 3600) * dt;
      b.stats.driveMin += dt / MIN;
      if (b.stats.driveMin >= ROUTE.maxDriveMin) {
        b.state = 'out';
        this.pushIncident(`รถ ${b.id} ครบชั่วโมงขับตามกฎหมาย (${ROUTE.maxDriveMin / 60} ชม.) — ถอนจากบริการตามกะ ห้ามต่อ`, 'serious');
        return;
      }
      const seg = b.segIndexAt();
      if (seg !== b.lastSegIdx) {
        const traverseSec = this.t - b.lastSegT;
        if (traverseSec > 3) this.learnSegment(b.lastSegIdx, traverseSec);
        b.lastSegIdx = seg; b.lastSegT = this.t;
      }
      if (b.distanceToStop(b.nextStopIdx) <= 0) this.arriveStop(b, env);
    } else if (b.state === 'dwell') {
      b.speedKmh = 0;
      if (this.t >= b.dwellUntil) this.departStop(b);
    } else if (b.state === 'terminal') {
      b.speedKmh = 0;
      this.tryRelease(b);
    }
  }

  learnSegment(segIdx, traverseSec) {
    const obs = Math.max(3, Math.min(45, (ZONE_LEN / 1000) / (traverseSec / 3600)));
    this.aiSegSpeed[segIdx] = this.aiSegSpeed[segIdx] * 0.7 + obs * 0.3;
  }

  // ── ถึงป้าย: นับขึ้น-ลง + สมการสมดุล + ความไม่แน่นอนสะสม (สมการ 3) ──────────
  arriveStop(b, env) {
    const stopIdx = b.nextStopIdx;
    const stop = STOPS[stopIdx];
    const q = this.queues.get(stop.id + ':' + b.dir);
    const waiting = q.size;
    const space = Math.max(0, b.model.legalMax - b.onboardTrue);
    const board = Math.min(waiting, space);
    const passUp = waiting - board;
    const alight = this.alightCount(b, stopIdx);
    const waits = q.take(board, this.t);
    const estAtArrival = b.onboardEst; // ยอดประมาณก่อนเปิดประตู — ใช้เทียบกับพยากรณ์ N_hat ล่วงหน้า

    // ประเมิน "ก่อนเปิดประตู" เพื่อวัดความแม่นของการบอกระดับความแน่น
    this.scoreCrowdPrediction(b);
    // ค่าจริงของจำลอง (ใช้ประเมินเท่านั้น — ไม่แสดงต่อสาธารณะ)
    b.onboardTrue = Math.max(0, b.onboardTrue - alight + board);
    // สมการสมดุลที่ระบบใช้: คนบนรถหลังป้าย = ก่อนป้าย + คนขึ้น − คนลง (จากการนับจริง/APC)
    const apc = this.applyApcCount(b, board, alight);
    b._arriveT = this.t;      // สมการ 3: เวลาถึงจริง (ใช้คำนวณ actualDwellSec ตอนออกจากป้าย)
    b._apcBoard = apc.board;  // สมการ 3: B_apc ของป้ายนี้
    b.sigma = Math.sqrt((b.sigma || 0) ** 2 + SENSOR_SIGMA_PER_STOP ** 2); // ทุกป้ายที่อ่านจากเซ็นเซอร์ ±1.5

    for (const w of waits) {
      this.waits.push({ t: this.t, waitSec: w });
      (this.waitsByStop[stop.id] ||= []).push(w);
      this.paxServed++;
    }
    this.boardedTotal += board;
    this.passUpTotal += passUp;
    if (passUp > 0) this.passUps.push({ t: this.t, n: passUp, stopId: stop.id });
    this.trimWindows();

    const isTerminus = (b.dir === 1 && stopIdx === STOPS.length - 1) || (b.dir === -1 && stopIdx === 0);
    this.finalizeEtaAt(stopIdx, b, estAtArrival);
    if (isTerminus) {
      // รีเซ็ตเป็น 0 ที่อู่ปลายทาง + ตรวจยอด (การนับผิดได้ — ต้องเดินตรวจ ไม่ถือว่า exact ground truth)
      const diff = Math.abs(b.onboardEst - b.onboardTrue);
      if (diff >= 3) this.pushIncident(`ตรวจยอดปลายสาย รถ ${b.id}: ประมาณ ${b.onboardEst} / ตรวจนับจริง ${b.onboardTrue} คน — ให้เดินตรวจเซ็นเซอร์ประตู`, 'warning');
      b.onboardTrue = 0; b.onboardEst = 0;
      b.sigma = 0; // สมการ 3: ตรวนับจริงที่อู่ = รีเซ็ตความไม่แน่นอนเป็นศูนย์
      b.countSource = 'none'; b.stopsSinceCount = 0;
      b.originDeclared = false;
      b.state = 'terminal';
      b.stats.trips++; this.tripsCompleted++;
      b.stats.layoverStartT = this.t;
      b.stats.restMin += ROUTE.minLayoverMin;
      b.tripNo++;
      b.dir *= -1;
      b.nextStopIdx = b.dir === 1 ? 1 : STOPS.length - 2;
      b.lastSegIdx = b.segIndexAt(); b.lastSegT = this.t;
    } else {
      const dwell = Math.min(100, 8 + board * 1.3 + alight * 0.9) * (env.rain ? 1.25 : 1);
      b.dwellUntil = this.t + dwell;
      b.state = 'dwell';
      b.lastArrival = { stopIdx, t: this.t, board, alight, passUp, waitingAfter: q.size, onboardAfterEst: Math.round(b.onboardEst) };
      b.nextStopIdx = this.nextStopAfter(stopIdx, b.dir);
    }
  }

  alightCount(b, stopIdx) {
    const progress = b.pos / S.totalLen;
    const base = progress < 0.15 ? 0.05 : progress < 0.5 ? 0.18 : progress < 0.8 ? 0.38 : 0.62;
    const rnd = mulberry32(hashStr('al' + b.id + stopIdx + Math.floor(this.t / 300)));
    return Math.max(0, Math.min(b.onboardTrue, Math.round(b.onboardTrue * base * (0.7 + 0.6 * rnd()))));
  }
  nextStopAfter(stopIdx, dir) {
    return Math.max(0, Math.min(STOPS.length - 1, stopIdx + dir));
  }

  // ── การนับของระบบ: APC มีความคลาดเคลื่อน / เซ็นเซอร์พัง / ผู้สำรวจบันทึกแทน ──
  // คืนยอดที่ APC นับได้ (มี noise) เพื่อใช้เป็น B_apc ใน Bayesian Dwell Cross-Check (สมการ 3)
  applyApcCount(b, boardTrue, alightTrue) {
    if (b.state === 'terminal') return { board: 0, alight: 0 };
    if (b.manualHoldStops > 0) { b.manualHoldStops--; return { board: 0, alight: 0 }; }
    if (!b.apcFault && b.countSource !== 'none') {
      const rnd = mulberry32(hashStr('apc' + b.id + Math.floor(this.t * 7)));
      const noise = (n) => Math.max(0, Math.round(n + (rnd() - 0.5) * 2 * Math.max(1, n * 0.08)) + (rnd() < 0.03 ? 1 : 0));
      const na = noise(alightTrue), nb = noise(boardTrue);
      b.onboardEst = Math.max(0, b.onboardEst - na + nb);
      b.countSource = 'apc'; b.stopsSinceCount = 0; b.originDeclared = false;
      return { board: nb, alight: na };
    }
    b.stopsSinceCount++;
    if (b.countSource === 'origin' && b.stopsSinceCount >= 3) b.countSource = 'none';
    return { board: 0, alight: 0 };
  }

  /** ระดับความแน่นที่แสดงต่อสาธารณะ — หมดอายุตามเวลา (GPS 90 วิ) และจำนวนป้ายที่ผ่านไป */
  publicCrowding(b) {
    const fresh = b.countSource !== 'none' && b.stopsSinceCount < 3 && b.gpsOk;
    const info = crowdingInfo(b.model, b.onboardEst, fresh ? b.countSource : 'none', fresh);
    info.onboardEst = fresh ? Math.round(b.onboardEst) : null;
    info.sourceLabel =
      b.countSource === 'manual' ? 'นับโดยผู้สำรวจ' :
      b.countSource === 'origin' ? 'สถานะเมื่อออกต้นทาง' :
      b.countSource === 'apc' ? 'นับสดที่ประตู (APC)' : null;
    info.countAgeStops = b.stopsSinceCount;
    return info;
  }

  departStop(b) {
    // สมการ 3: Bayesian Dwell Cross-Check — ตรวจยอดคนขึ้นซ้ำกับเวลาเปิดประตูจริง
    // B_implied = (actualDwellSec − tau_0) / alpha → B_corrected = 0.75·B_apc + 0.25·B_implied
    const actualDwellSec = Math.max(0, this.t - (b._arriveT || this.t));
    const bImplied = Math.max(0, (actualDwellSec - DWELL_TAU0_SEC) / (b.model.boardSec || 2.2));
    const bCorrected = Math.round(0.75 * (b._apcBoard || 0) + 0.25 * bImplied);
    const delta = bCorrected - (b._apcBoard || 0);
    if (delta !== 0) b.onboardEst = Math.max(0, b.onboardEst + delta);
    b.state = 'running';
    b.legNo++;
    this.predictNextStops(b);
  }

  // ── อู่ปลายสาย: baseline ปล่อยตามสล็อตตายตัว / ai คุมระยะห่างจริง + ปรับในกรอบ ──
  tryRelease(b) {
    const d = String(b.dir);
    const prevDep = this.depTimes[d];
    const lastDep = prevDep.length ? prevDep[prevDep.length - 1] : this.t - HEADWAY;
    const layoverReady = (b.stats.layoverStartT ?? this.t) + ROUTE.minLayoverMin * MIN;
    let target;
    if (this.policy === 'baseline') {
      // ตารางตายตัว: สล็อตถัดไปที่ไม่เร็วกว่าเวลาที่พร้อมจริง
      const earliest = Math.max(this.t, layoverReady);
      const n = Math.ceil((earliest - ROUTE.serviceStartSec) / HEADWAY);
      target = ROUTE.serviceStartSec + n * HEADWAY;
    } else {
      // จัดรอบด้วยระยะห่างจริง: ปล่อยคันถัดไปห่างจากคันก่อนหน้าตามรอบประกาศ
      // (เรียกจังหวะกลับให้สม่ำเสมอหลังเหตุรบกวน) + ปรับได้ในกรอบที่อนุมัติจากคำแนะนำ
      target = lastDep + HEADWAY + this.terminalShift[d];
    }
    // กันชนความปลอดภัยทั้งสองนโยบาย: ไม่ตัดเวลาพักขั้นต่ำ + ไม่ออกถี่กว่า 6 นาทีจากคันก่อนหน้า
    const releaseAt = Math.max(target, layoverReady, lastDep + 6 * MIN);
    if (this.t >= releaseAt) {
      b.state = 'running';
      b.stats.layoverStartT = null;
      prevDep.push(this.t);
      if (prevDep.length > 50) prevDep.splice(0, prevDep.length - 50);
      this.recordHeadway(d);
      this.tripsDeparted++;
      this.predictNextStops(b);
      if (this.policy === 'ai') this.terminalShift[d] = 0;
    }
  }

  recordHeadway(d) {
    const arr = this.depTimes[d].slice(-21);
    if (arr.length < 2) return;
    const gaps = [];
    for (let i = 1; i < arr.length; i++) gaps.push(arr[i] - arr[i - 1]);
    const mean = gaps.reduce((a, c) => a + c, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, c) => a + (c - mean) ** 2, 0) / gaps.length);
    this.headwaySeries.push({ t: this.t, gapMin: +((arr[arr.length - 1] - arr[arr.length - 2]) / MIN).toFixed(2), cv: +(sd / (mean || 1)).toFixed(3), dir: Number(d) });
    if (this.headwaySeries.length > 400) this.headwaySeries.splice(0, this.headwaySeries.length - 400);
  }

  // ── เวลาวิ่งบนลิงก์ถนน (สมการ 2 พจน์แรก): Sum_s(LinkLength / Speed_EMA) ──────
  runTimeSec(s0, s1) {
    let x = Math.max(0, Math.min(S.totalLen, s0));
    const end = Math.max(0, Math.min(S.totalLen, s1));
    let acc = 0, i = zoneIndexAt(x), guard = 0;
    while (x < end - 0.5 && guard++ < ZONES + 2) {
      const zEnd = Math.min(end, (i + 1) * ZONE_LEN);
      const part = zEnd - x;
      if (part > 0) acc += (part / 1000) / Math.max(4, this.aiSegSpeed[i]) * 3600;
      x += part; i += 1;
      if (i >= ZONES) break;
    }
    return acc;
  }

  /** สมการ 1+2+3: การไหลขึ้น-ลงสะสมรายป้ายล่วงหน้า k → m (Stop-by-Stop Predictive Load Propagation)
   * คืน steps รายป้ายตามทิศเดินรถ: n0 = คนขณะถึงป้าย (N_hat[j-1]), alight = A_hat, demand = D_hat,
   * board = B_hat (จำกัดความจุ C_max), passUp, n = N_hat หลังออกจากป้าย, dwell = เวลาจอดตามสมการ 2,
   * run = เวลาวิ่งถึงป้าย (รวมรอไฟแดงแยกหลัก), eta = เวลาสะสมถึงป้าย (วินาที), sig = ± สมการ 3 */
  propagateLoad(b, targetIdx) {
    const dir = b.dir;
    const terminusIdx = dir === 1 ? STOPS.length - 1 : 0;
    const speedKmh = Math.max(6, b.speedKmh || b.model.baseKmh * 0.8);
    // ช่องว่างเวลากับรถคันหน้า H[j] — คนรอสะสมแปรผันตรงตามหลัก Poisson Arrival
    const ahead = this.buses
      .filter((x) => x !== b && x.dir === dir && (x.state === 'running' || x.state === 'dwell'))
      .map((x) => ({ x, gap: dir === 1 ? x.pF - b.pF : b.pF - x.pF }))
      .filter((z) => z.gap > 5)
      .sort((p, q) => p.gap - q.gap)[0];
    const pairSpeed = ahead ? Math.max(6, (Math.max(4, ahead.x.speedKmh || 12) + speedKmh) / 2) : speedKmh;
    const Hsec = ahead ? Math.min(3 * HEADWAY, (ahead.gap / 1000) / pairSpeed * 3600) : HEADWAY;
    const rainF = this.lastEnv && this.lastEnv.rain ? RAIN_DEMAND_FACTOR : 1;
    const rushF = this.lastEnv && this.lastEnv.rush ? RUSH_DEMAND_FACTOR : 1;
    const dirShare = dir === 1 ? 0.60 : 0.40;

    const steps = [];
    let n = Math.max(0, Math.min(b.model.legalMax, Math.round(b.onboardEst)));
    let sig = Math.max(0, b.sigma || 0);
    let pos = Math.max(0, Math.min(S.totalLen, b.pF));
    let etaAcc = 0, dwellAcc = 0, runAcc = 0, boardAcc = 0, alightAcc = 0, passUpAcc = 0;
    let idx = b.nextStopIdx;
    let guard = 0;
    while (guard++ < STOPS.length + 1) {
      const st = STOPS[idx];
      const stopSpos = S.stopS[st.id];
      const runLeg = this.runTimeSec(pos, stopSpos) + (st.signal ? SIGNAL_DELAY_SEC : 0);
      etaAcc += runLeg; runAcc += runLeg;
      sig = Math.sqrt(sig * sig + FORECAST_SIGMA_PER_STOP * FORECAST_SIGMA_PER_STOP); // พยากรณ์ 1 ป้ายขึ้นไป ±2.2
      const n0 = n;
      // (1) คนลงที่ป้าย j: A_hat = N_hat[j-1] × alightingProb[j]
      const alight = Math.max(0, Math.min(n, Math.round(n * (st.alight ?? 0.12))));
      // (2) ความต้องการคนรอ: D_hat = λ[j](t_arrival) × rain × H[j] + คิวค้าง
      //     H[j] = ช่องไฟคงเหลือณป้าย j = H_front − ETA ของเราถึงป้าย j (เวลาที่คนสะสมจริง ๆ ตั้งแต่คันหน้าผ่านป้าย)
      //     คิวค้างนับเฉพาะเมื่อไม่มีคันหน้ามารับก่อน (มิฉะนั้นจะนับซ้ำกับพจน์ λ×H)
      const Hj = Math.max(45, Hsec - etaAcc);
      const lambdaPerMin = st.baseRate * dirShare * demandMultiplier(this.t + etaAcc) * rushF;
      const dHat = Math.max(0, Math.round(lambdaPerMin * (Hj / 60) * rainF + (ahead ? 0 : this.queues.get(st.id + ':' + dir).size)));
      // (3) คนขึ้นได้จริง: B_hat = min(D_hat, พื้นที่ว่างตาม C_max)
      const space = Math.max(0, b.model.legalMax - (n - alight));
      const board = Math.min(dHat, space);
      const passUp = Math.max(0, dHat - board);
      // (4) คนบนรถหลังออกจากป้าย: N_hat[j] = N_hat[j-1] − A_hat + B_hat
      n = Math.max(0, n - alight + board);
      // สมการ 2: DwellTime = (tau_0 + α·B_hat + β·A_hat) × crowdingPenalty(N_hat[j-1]/C_max > 0.75)
      const crowdPen = (n0 / b.model.legalMax) > CROWD_DWELL_THRESHOLD ? CROWD_DWELL_PENALTY : 1;
      const dwell = (DWELL_TAU0_SEC + b.model.boardSec * board + DWELL_ALIGHT_SEC * alight) * crowdPen;
      dwellAcc += dwell; etaAcc += dwell;
      boardAcc += board; alightAcc += alight; passUpAcc += passUp;
      steps.push({
        stopId: st.id, idx, n0, alight, demand: dHat, board, passUp, n,
        dwell: Math.round(dwell), run: Math.round(runLeg),
        eta: Math.round(Math.max(0, etaAcc - dwell)), // เวลา "ถึง" ป้าย (ก่อนจอด)
        sig: +sig.toFixed(1),
      });
      if (idx === targetIdx || idx === terminusIdx) break;
      const nx = idx + dir;
      if (nx < 0 || nx >= STOPS.length) break;
      idx = nx;
      pos = stopSpos;
    }
    return { steps, headwayMin: +(Hsec / 60).toFixed(1), hasAhead: !!ahead, boardAcc, alightAcc, passUpAcc, dwellAcc, runAcc };
  }

  // ── โมเดลพยากรณ์เวลาถึง ────────────────────────────────────────────────────
  predictSeconds(b, stopIdx, model) {
    const dist = Math.max(0, b.distanceToStop(stopIdx));
    if (model === 'hist') {
      // Baseline: ความเร็วเฉลี่ยย้อนหลังตามช่วงเวลา + เวลาจอดตายตัว 20 วินาที/ป้าย
      let sec = (dist / 1000) / histSpeedKmh(this.t) * 3600;
      let idx = b.nextStopIdx, steps = 0;
      while (idx !== stopIdx && steps++ < 16) { sec += 20; idx = this.nextStopAfter(idx, b.dir); }
      return sec;
    }
    // AI (สมการ 1+2 coupled): เวลาวิ่งรายโซน EWMA + เวลาจอดจากการไหลคนรายป้าย + รอไฟแดงแยกหลัก
    const pr = this.propagateLoad(b, stopIdx);
    const stepAt = pr.steps[pr.steps.length - 1];
    if (stepAt) return stepAt.eta;
    return (dist / 1000) / Math.max(4, histSpeedKmh(this.t)) * 3600;
  }

  predictNextStops(b) {
    let idx = b.nextStopIdx, steps = 0;
    while (steps++ < 3) {
      const pr = this.propagateLoad(b, idx);
      const at = pr.steps[pr.steps.length - 1];
      for (const model of ['hist', 'ai']) {
        const key = `${b.id}:${idx}:${b.legNo}:${model}`;
        if (!this.pendingEta.has(key)) {
          this.pendingEta.set(key, {
            busId: b.id, stopIdx: idx, t: this.t, eta: this.predictSeconds(b, idx, model), phase: envPhase(this.t),
            nHat: at ? at.n0 : null, sigHat: at ? at.sig : null, // สมการ 1+3: เก็บไว้เทียบความแม่นตอนรถถึงจริง
          });
        }
      }
      idx = this.nextStopAfter(idx, b.dir);
      if ((b.dir === 1 && idx >= STOPS.length - 1) || (b.dir === -1 && idx <= 0)) break;
    }
    if (this.pendingEta.size > 400) {
      const keys = [...this.pendingEta.keys()].slice(0, this.pendingEta.size - 400);
      for (const k of keys) this.pendingEta.delete(k);
    }
  }
  finalizeEtaAt(stopIdx, b, estAtArrival) {
    for (const model of ['hist', 'ai']) {
      for (const [k, v] of this.pendingEta) {
        if (v.busId === b.id && v.stopIdx === stopIdx && k.endsWith(':' + model)) {
          const err = this.t - (v.t + v.eta);
          this.etaSamples[model].push({ errSec: err, phase: v.phase, t: this.t });
          if (v.nHat != null) {
            // สมการ 1+3: ผิดพลาดของการไหลสะสมรายป้าย + สัดส่วนที่ค่าจริงอยู่ในกรอบ ± sigma
            this.propSamples.push({ err: Math.abs(estAtArrival - v.nHat), sig: v.sigHat, phase: v.phase, t: this.t });
            if (this.propSamples.length > 600) this.propSamples.shift();
          }
          this.pendingEta.delete(k);
          break;
        }
      }
    }
  }

  // ── สมการ 4: Daganzo's Two-Sided Headway Holding ───────────────────────────
  // พิจารณาทั้งช่องไฟคันหน้า (H_front) และคันหลัง (H_back) เทียบรอบเป้าหมาย (H_target):
  // rawHold = 0.5·(H_target − H_front) + 0.25·(H_back − H_front) → ปัดเป็นนาทีในกรอบ 0-5 นาที
  holdRecommendation(dir) {
    const bus = this.buses
      .filter((x) => x.state === 'terminal' && x.dir === dir)
      .sort((a, z) => (a.stats.layoverStartT ?? 0) - (z.stats.layoverStartT ?? 0))[0];
    if (!bus) return null;
    const spd = (x) => Math.max(6, x.speedKmh || 12);
    const onRoad = this.buses.filter((x) => (x.state === 'running' || x.state === 'dwell') && x.dir === dir);
    const gapTo = (front) => onRoad
      .map((x) => ({ x, gap: front ? (dir === 1 ? x.pF - bus.pF : bus.pF - x.pF) : (dir === 1 ? bus.pF - x.pF : x.pF - bus.pF) }))
      .filter((z) => z.gap > 5)
      .sort((p, q) => p.gap - q.gap)[0];
    const fa = gapTo(true), bk = gapTo(false);
    const gapMin = (z) => (z ? Math.min(3 * ROUTE.targetHeadwayMin, (z.gap / 1000) / Math.max(6, (spd(z.x) + spd(bus)) / 2) * 60) : 2 * ROUTE.targetHeadwayMin);
    const Ht = ROUTE.targetHeadwayMin;
    const Hf = gapMin(fa), Hb = gapMin(bk);
    const rawHoldMin = 0.5 * (Ht - Hf) + 0.25 * (Hb - Hf);
    return {
      busId: bus.id, dir,
      H_frontMin: +Hf.toFixed(1), H_backMin: +Hb.toFixed(1), H_targetMin: Ht,
      rawHoldMin: +rawHoldMin.toFixed(2),
      holdMin: Math.max(0, Math.min(5, Math.round(rawHoldMin))),
      frontBusId: fa ? fa.x.id : null, backBusId: bk ? bk.x.id : null,
      layoverRemainingMin: Math.max(0, Math.ceil(((bus.stats.layoverStartT ?? this.t) + ROUTE.minLayoverMin * MIN - this.t) / 60)),
    };
  }

  // ── ประเมินความแม่นของการบอกระดับความแน่น (Macro-F1 / ข้อผิดร้ายแรง / ไม่ทราบ) ──
  scoreCrowdPrediction(b) {
    const usable = b.countSource !== 'none' && b.stopsSinceCount < 3 && b.gpsOk;
    this.crowdEvents.total++;
    if (!usable) { this.crowdEvents.unknown++; return; }
    const pred = crowdingLevelOf(b.model, b.onboardEst);
    const actual = crowdingLevelOf(b.model, b.onboardTrue);
    this.confusion[pred][actual]++;
    if (pred < 2 && actual === 2) this.crowdEvents.serious++;
  }

  // ── ตรวจจับรถติดกัน (เตือน) + คำแนะนำจากช่องว่างการปล่อยรับที่ต้นสาย ────────
  detectBunching() {
    for (const dir of [1, -1]) {
      const onRoad = this.buses
        .filter((b) => (b.state === 'running' || b.state === 'dwell') && b.dir === dir)
        .sort((a, z) => z.pos - a.pos);
      for (let i = 0; i < onRoad.length - 1; i++) {
        const ahead = onRoad[i], behind = onRoad[i + 1];
        const gapM = ahead.pos - behind.pos;
        const speed = Math.max(4, (ahead.speedKmh + behind.speedKmh) / 2 || 10);
        const gapMin = (gapM / 1000) / speed * 60;
        if (gapMin < ROUTE.targetHeadwayMin * 0.5 && gapM < 1400) {
          const sig = `bunch:${ahead.id}:${behind.id}:${dir}`;
          if ((this.recCooldown[sig] || 0) > this.t) continue;
          this.recCooldown[sig] = this.t + 15 * MIN;
          this.pushIncident(`รถ ${ahead.id} กับ ${behind.id} วิ่งติดกัน (ห่าง ~${gapMin.toFixed(1)} นาที) ทิศ${dir === 1 ? 'ไป' : 'กลับ'}`, 'warning');
        }
      }
    }
    // สมการ 4: คำแนะนำผูกกับช่องไฟหน้า-หลังจริงของคันที่รออยู่ที่อู่ — เห็นผลตรง วัดได้ อยู่ในกรอบที่อนุมัติ
    if (this.policy === 'ai') this.checkTerminalGaps();
  }

  checkTerminalGaps() {
    for (const dir of [1, -1]) {
      const sig = `term:${dir}`;
      if ((this.recCooldown[sig] || 0) > this.t) continue;
      const rec = this.holdRecommendation(dir);
      if (!rec) continue;
      const dirName = dir === 1 ? 'ไป' : 'กลับ';
      if (rec.holdMin >= 1) {
        this.recCooldown[sig] = this.t + 10 * MIN;
        this.pushRecommendation({
          type: 'delay_next', shiftMin: rec.holdMin, dir, hold: rec,
          title: `หน่วงปล่อยรถ ${rec.busId} (ทิศ${dirName}) ${rec.holdMin} นาที — ปรับสมดุลช่องไฟหน้า-หลัง`,
          detail: `คันหน้า (${rec.frontBusId || 'ไม่มี'}) ห่าง ~${rec.H_frontMin} นาที คันหลัง (${rec.backBusId || 'ไม่มี'}) ห่าง ~${rec.H_backMin} นาที เทียบรอบเป้าหมาย ${rec.H_targetMin} นาที — สมการช่องไฟสองทิศให้ค่า ${rec.rawHoldMin} นาที ปัดเป็น ${rec.holdMin} นาที (เพดานกรอบ ${ROUTE.maxFrameMin} นาที)`,
          rule: `Daganzo two-sided holding: rawHold = 0.5·(H_target − H_front) + 0.25·(H_back − H_front) · ไม่ลดเวลาพักขั้นต่ำ ${ROUTE.minLayoverMin} นาที · ไม่ตัดเที่ยววิ่งขั้นต่ำ`,
        });
      } else if (rec.rawHoldMin <= -1) {
        const earlyMin = Math.min(2, Math.max(1, Math.round(-rec.rawHoldMin)));
        this.recCooldown[sig] = this.t + 10 * MIN;
        this.pushRecommendation({
          type: 'early_next', shiftMin: -earlyMin, dir, hold: rec,
          title: `ดึงเวลาปล่อยรถ ${rec.busId} (ทิศ${dirName}) เร็วขึ้น ${earlyMin} นาที`,
          detail: `คันหน้าห่าง ~${rec.H_frontMin} นาที (คันหลัง ~${rec.H_backMin} นาที) ช่องไฟกว้างกว่ารอบเป้าหมาย ${rec.H_targetMin} นาที — สมการช่องไฟสองทิศให้ค่าติดลบ ${rec.rawHoldMin} นาที เสนอปล่อยก่อนกำหนด โดยยังเว้นระยะห่างขั้นต่ำ 6 นาทีจากคันก่อนหน้า`,
          rule: `ปรับภายในกรอบที่อนุมัติ (±${ROUTE.maxFrameMin} นาที) · ไม่ออกก่อนระยะห่างขั้นต่ำ 6 นาที · ไม่ลดเวลาพักคนขับ`,
        });
      }
    }
  }
  pushRecommendation(r) {
    this.recommendations = this.recommendations.filter((x) => !(x.status === 'pending' && x.type === r.type && x.dir === r.dir));
    this.recommendations.push({ id: 'REC' + String(this.nextRecId++).padStart(4, '0'), t: this.t, status: 'pending', ...r });
    if (this.recommendations.length > 60) this.recommendations.splice(0, this.recommendations.length - 60);
  }

  pushIncident(msg, level) {
    this.incidents.push({ tSec: this.t, t: fmtClock(this.t), msg, level });
    if (this.incidents.length > 80) this.incidents.splice(0, this.incidents.length - 80);
  }

  trimWindows() {
    const cutoff = this.t - 3600;
    while (this.waits.length && this.waits[0].t < cutoff) this.waits.shift();
    while (this.passUps.length && this.passUps[0].t < cutoff) this.passUps.shift();
    for (const m of ['hist', 'ai']) {
      const arr = this.etaSamples[m];
      while (arr.length > 600) arr.shift();
    }
    for (const k in this.waitsByStop) {
      const a = this.waitsByStop[k];
      while (a.length > 300) a.shift();
    }
  }

  // ── ตัวชี้วัด ──────────────────────────────────────────────────────────────
  metrics() {
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const waitSecs = this.waits.map((w) => w.waitSec);
    const attempts = this.boardedTotal + this.passUpTotal;
    const gapsAll = [];
    for (const d of ['1', '-1']) {
      const arr = this.depTimes[d].slice(-21);
      for (let i = 1; i < arr.length; i++) gapsAll.push(arr[i] - arr[i - 1]);
    }
    const mG = mean(gapsAll) || 1;
    const cv = gapsAll.length > 3 ? Math.sqrt(mean(gapsAll.map((g) => (g - mG) ** 2))) / mG : null;
    const maeFor = (m, ph) => {
      const s = this.etaSamples[m].filter((x) => !ph || x.phase === ph);
      return s.length ? +(mean(s.map((x) => Math.abs(x.errSec))) / MIN).toFixed(2) : null;
    };
    let f1s = [];
    for (let c = 0; c < 3; c++) {
      const tp = this.confusion[c][c];
      const fp = this.confusion[c].reduce((a, x, j) => a + (j === c ? 0 : x), 0);
      const fn = this.confusion.reduce((a, row, j) => a + (j === c ? 0 : row[c]), 0);
      const prec = tp + fp ? tp / (tp + fp) : 0, rec = tp + fn ? tp / (tp + fn) : 0;
      f1s.push(prec + rec ? 2 * prec * rec / (prec + rec) : 0);
    }
    const macroF1 = mean(f1s);
    const seriousRate = this.crowdEvents.total ? this.crowdEvents.serious / this.crowdEvents.total : 0;
    const z = 1.96, n = Math.max(1, this.crowdEvents.total);
    const wilsonHi = (p, nn) => (p + z * z / (2 * nn) + z * Math.sqrt((p * (1 - p) + z * z / (4 * nn)) / nn)) / (1 + z * z / nn);
    const byStop = {};
    for (const st of STOPS) {
      const a = this.waitsByStop[st.id] || [];
      if (a.length) byStop[st.id] = { name: st.name, avgMin: +(mean(a) / MIN).toFixed(2), n: a.length };
    }
    return {
      clock: fmtClock(this.t),
      avgWaitMin: +(mean(waitSecs) / MIN).toFixed(2),
      p90WaitMin: +((pct(waitSecs, 0.9) || 0) / MIN).toFixed(2),
      passUpRate: attempts ? +(this.passUpTotal / attempts).toFixed(4) : 0,
      headwayCV: cv === null ? null : +cv.toFixed(3),
      targetHeadwayMin: ROUTE.targetHeadwayMin,
      tripsDeparted: this.tripsDeparted,
      tripsCompleted: this.tripsCompleted,
      paxServed: this.paxServed,
      passengersOnboardNow: this.buses.reduce((a, b) => a + b.onboardTrue, 0),
      windowN: { wait: waitSecs.length, attempts },
      byStop,
      eta: {
        maeMin: { hist: maeFor('hist'), ai: maeFor('ai') },
        maeByPhase: {
          train: { hist: maeFor('hist', 'train'), ai: maeFor('ai', 'train') },
          tune: { hist: maeFor('hist', 'tune'), ai: maeFor('ai', 'tune') },
          test: { hist: maeFor('hist', 'test'), ai: maeFor('ai', 'test') },
        },
        samples: { hist: this.etaSamples.hist.length, ai: this.etaSamples.ai.length },
      },
      prop: (() => {
        // สมการ 1+3: ความแม่นของการไหลสะสมรายป้าย — MAE (คน) + สัดส่วนที่อยู่ในกรอบ ± sigma
        const ps = this.propSamples;
        if (!ps.length) return { n: 0, mae: null, withinSigma: null };
        return {
          n: ps.length,
          mae: +(mean(ps.map((x) => x.err))).toFixed(2),
          withinSigma: +(ps.filter((x) => x.err <= (x.sig || 0)).length / ps.length).toFixed(3),
        };
      })(),
      crowd: {
        macroF1: +macroF1.toFixed(3),
        seriousRate: +seriousRate.toFixed(4),
        seriousHi95: +wilsonHi(seriousRate, n).toFixed(4),
        unknownRate: +(this.crowdEvents.unknown / Math.max(1, this.crowdEvents.total)).toFixed(4),
        n: this.crowdEvents.total,
        confusion: this.confusion,
      },
      headwayGaps: gapsAll.slice(-12).map((g) => +(g / MIN).toFixed(2)),
    };
  }

  // ── สแนปชอต ───────────────────────────────────────────────────────────────
  snapshot(includeOps) {
    const withProp = this.policy === 'ai'; // สมการ 1-3 ผูกกับเวิลด์ AI (baseline ใช้ตารางตายตัว)
    const buses = this.buses.map((b) => {
      const crowd = this.publicCrowding(b);
      const p = pointAtS(S, Math.max(0, Math.min(S.totalLen, b.pF)));
      const nextStop = STOPS[b.nextStopIdx];
      const etaSec = Math.round(this.predictSeconds(b, b.nextStopIdx, this.policy === 'ai' ? 'ai' : 'hist'));
      // สมการ 1-3: พยากรณ์ไหลสะสมรายป้ายถึงปลายทิศ (แสดงในหน้าผู้โดยสาร/วางแผนเดินทาง)
      const prop = withProp && (b.state === 'running' || b.state === 'dwell')
        ? this.propagateLoad(b, b.dir === 1 ? STOPS.length - 1 : 0).steps.map((s) => ({
          id: s.stopId, N: s.n0, n: s.n, sig: s.sig,
          pu: s.demand > 0 ? Math.round((s.passUp / s.demand) * 100) : 0,
          run: s.run, dwell: s.dwell, eta: s.eta,
        }))
        : null;
      return {
        id: b.id, label: b.label, driver: b.driver, model: b.model,
        dir: b.dir, lat: p.lat, lng: p.lng, bearing: Math.round(p.bearing),
        s: Math.round(b.pF),
        speedKmh: b.speedKmh, state: b.state,
        apcFault: !!b.apcFault,
        onboardEst: crowd.onboardEst, crowding: crowd,
        sigma: Math.round((b.sigma || 0) * 10) / 10, // สมการ 3: ± ความไม่แน่นอนสะสม (คน)
        prop,
        gpsStaleSec: Math.round(b.gpsStaleSec), gpsOk: b.gpsOk,
        lastFixSecAgo: Math.round(this.t - b.lastFixT),
        nextStopId: nextStop.id, nextStopName: nextStop.name, etaSec,
        tripNo: b.tripNo, driveMin: Math.round(b.stats.driveMin), restMin: Math.round(b.stats.restMin),
        layoverActive: b.state === 'terminal',
        layoverSec: b.state === 'terminal' && b.stats.layoverStartT ? Math.round(this.t - b.stats.layoverStartT) : null,
        lastArrival: b.lastArrival ? {
          stopId: STOPS[b.lastArrival.stopIdx].id, stopName: STOPS[b.lastArrival.stopIdx].name,
          board: b.lastArrival.board, alight: b.lastArrival.alight, passUp: b.lastArrival.passUp,
          waitingAfter: b.lastArrival.waitingAfter, onboardAfter: b.lastArrival.onboardAfterEst, t: b.lastArrival.t,
        } : null,
      };
    });
    const stops = STOPS.map((st) => ({
      id: st.id, name: st.name, survey: st.survey, surveyLabel: st.surveyLabel,
      wait1: this.queues.get(st.id + ':1').size,
      waitN1: this.queues.get(st.id + ':-1').size,
    }));
    const base = {
      policy: this.policy, clock: fmtClock(this.t), tSec: Math.round(this.t),
      buses, stops, incidents: this.incidents.slice(-12),
    };
    if (!includeOps) return base;
    return {
      ...base,
      metrics: this.metrics(),
      recommendations: this.recommendations.slice(-12).reverse(),
      departures: { '1': this.depTimes['1'].slice(-8), '-1': this.depTimes['-1'].slice(-8) },
      headwaySeries: this.headwaySeries.slice(-60),
      terminalShift: this.terminalShift,
      holdRec: this.policy === 'ai' ? { '1': this.holdRecommendation(1), '-1': this.holdRecommendation(-1) } : null,
    };
  }
}

// ── เรขาคณิตสถิต (โหลดครั้งเดียวที่หน้าเว็บ): เส้นทางเต็ม + โพลีไลน์รายโซนจราจร ──
function sliceZone(i) {
  const s0 = i * ZONE_LEN, s1 = Math.min(S.totalLen, (i + 1) * ZONE_LEN);
  const line = [];
  let prevS = null;
  for (const p of S.path) {
    if (prevS !== null && prevS < s0 && p.s > s0) line.push(pointAtS(S, s0));
    if (p.s >= s0 && p.s <= s1) line.push(p);
    if (prevS !== null && prevS < s1 && p.s > s1) line.push(pointAtS(S, s1));
    prevS = p.s;
  }
  while (line.length < 2) line.push(pointAtS(S, s0), pointAtS(S, s1)); // กันโซนสั้นเกินจุดยอด
  return line.map((p) => [+p.lat.toFixed(6), +p.lng.toFixed(6)]);
}
function buildGeo() {
  return {
    path: S.path.map((p) => [+p.lat.toFixed(6), +p.lng.toFixed(6)]),
    totalLenM: Math.round(S.totalLen),
    zoneLenM: Math.round(ZONE_LEN),
    zones: Array.from({ length: ZONES }, (_, i) => ({
      i,
      fromS: Math.round(i * ZONE_LEN),
      toS: Math.round(Math.min(S.totalLen, (i + 1) * ZONE_LEN)),
      line: sliceZone(i),
    })),
  };
}

initRoute('R1'); // เส้นทางเริ่มต้นตอนโหลดโมดูล

module.exports = { World, CROWD, fmtClock, envPhase, mulberry32, hashStr, initRoute, MIN, HEADWAY, GPS_STALE_SEC, ZONES, ZONE_LEN, zoneIndexAt,
  /** ค่าปัจจุบันของเส้นทางที่ใช้งานอยู่ (เปลี่ยนตาม initRoute — ห้าม destructure เก็บไว้) */
  routeCtx() { return { ROUTE, STOPS, FLEET_PLAN, S, HEADWAY, ZONES, ZONE_LEN, GEO }; },
};
