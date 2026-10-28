'use strict';
/**
 * OmniTransit v5 — engine/data.js
 * ข้อมูลตั้งต้นของเส้นทางนำร่อง: แนวถนนจริงในกรุงเทพฯ (พหลโยธิน  พญาไท  เพชรบุรี/ราชปรารภ  ราชดำริ/พระราม 1  พระราม 4  สี่พระยา–จรัสเมือง)
 * เรขาคณิตโพลีไลน์มาจากไฟล์ generated engine/route_geo.js (สร้างด้วย scripts/build_route.js จาก OSRM/OpenStreetMap)
 * พิกัดอ้างอิงระบบพิกัดสาธารณะ WGS84 เพื่อแสดงบนแผนที่ OpenStreetMap (ODbL) — ใช้เพื่อการสาธิต
 * หมายเหตุตามพิมพ์เขียว: เป็น "เส้นทางนำร่องจำลองบนแนวถนนจริง" ไม่ใช่การอ้างสิทธิเดินรถตามใบอนุญาตสายใด
 */

// ── เส้นทางนำร่อง (เรขาคณิตถนนจริงจาก engine/route_geo.js — ห้ามแก้มือ แก้ที่ scripts/build_route.js) ──
// จุดแต่ละจุด = [lat, lng, stopId|null] — ป้ายจอดฝังอยู่ในโพลีไลน์เพื่อให้รถวิ่งผ่านป้ายตรงจุดจริง
const ROUTE_POINTS = require('./route_geo').points;

// alight = สัดส่วนผู้โดยสารที่นิยมลงประจำป้าย (0-1) ตามลักษณะป้ายจริง — ป้ายหัวมุมใหญ่คนผลัดเปลี่ยนสูง
// signal = แยกหลักที่ต้องรอไฟแดงเฉลี่ย (ใช้ในสมการ ETA แบบ coupled)
const STOPS = [
  { id: 'S01', name: 'จตุจักร (BTS หมอชิต / MRT สวนจตุจักร)',        survey: 'origin',   surveyLabel: 'ต้นสาย',           baseRate: 1.35, alight: 0.55, signal: false },
  { id: 'S02', name: 'กรมการขนส่งทางบก (พหลโยธิน)', survey: null,       surveyLabel: null,               baseRate: 0.55, alight: 0.06, signal: false },
  { id: 'S03', name: 'สะพานควาย (BTS สะพานควาย)',                 survey: null,       surveyLabel: null,               baseRate: 0.85, alight: 0.12, signal: true },
  { id: 'S04', name: 'ซอยอารีย์ (BTS อารีย์)',                  survey: null,       surveyLabel: null,               baseRate: 0.60, alight: 0.08, signal: false },
  { id: 'S05', name: 'อนุสาวรีย์ชัยสมรภูมิ (เกาะพญาไท)',       survey: null,       surveyLabel: null,               baseRate: 1.15, alight: 0.28, signal: true },
  { id: 'S06', name: 'แยกราชวิถี (รพ.ราชวิถี / พญาไท)',           survey: null,       surveyLabel: null,               baseRate: 0.70, alight: 0.10, signal: true },
  { id: 'S07', name: 'แยกราชเทวี (BTS ราชเทวี)',                   survey: null,       surveyLabel: null,               baseRate: 0.90, alight: 0.12, signal: true },
  { id: 'S08', name: 'ประตูน้ำ – แยกราชประสงค์',        survey: 'critical', surveyLabel: 'กลางสายจุดวิกฤต',   baseRate: 1.80, alight: 0.30, signal: true },
  { id: 'S09', name: 'สยามสแควร์ / มาบุญครอง (MBK)',                      survey: null,       surveyLabel: null,               baseRate: 1.30, alight: 0.32, signal: true },
  { id: 'S10', name: 'สามย่าน – จุฬาลงกรณ์มหาวิทยาลัย',             survey: null,       surveyLabel: null,               baseRate: 1.00, alight: 0.22, signal: true },
  { id: 'S11', name: 'แยกสะพานเหลือง (ถ.พระราม 4)',       survey: null,       surveyLabel: null,               baseRate: 0.70, alight: 0.08, signal: true },
  { id: 'S12', name: 'แยกมหานคร – สี่พระยา (ถ.พระราม 4)',         survey: null,       surveyLabel: null,               baseRate: 0.50, alight: 0.06, signal: false },
  { id: 'S13', name: 'สถานีรถไฟกรุงเทพ (หัวลำโพง)',                  survey: 'terminus', surveyLabel: 'ปลายสาย',          baseRate: 0.65, alight: 0.45, signal: false },
];

// ── รถหลายรุ่น — ความจุที่อนุญาตต่างกันตามกฎหมาย ห้ามใช้สัดส่วนตายตัว ───────────
// สเปกที่นั่งอ้างอิงรุ่นจริงที่ใช้นำร่อง: ครีม-แดง 34 ที่นั่ง / แอร์ฟ้า 28 ที่นั่ง / EV พื้นต่ำ 31 ที่นั่ง + 1 จุดวีลแชร์
// boardSec (อัลฟา) = วินาทีต่อคนขึ้น — รถเก็บเงินสด 2.2 วิ/คน, EV ประตูกว้างพื้นเรียบ 1.6 วิ/คน
const BUS_MODELS = {
  nonac:   { id: 'nonac',   name: 'รถร้อน ครีม-แดง (11 ม.)',  seats: 34, standing: 46, legalMax: 80, baseKmh: 19, lowFloor: false, wheelchair: 0, crew: 2, boardSec: 2.2 },
  acblue:  { id: 'acblue',  name: 'รถแอร์ ฟ้า-ครีม (12 ม.)',  seats: 28, standing: 44, legalMax: 72, baseKmh: 21, lowFloor: false, wheelchair: 0, crew: 1, boardSec: 2.2 },
  ev:      { id: 'ev',      name: 'รถ EV พื้นต่ำ (10.5 ม.)',  seats: 31, standing: 27, legalMax: 58, baseKmh: 22, lowFloor: true,  wheelchair: 1, crew: 1, boardSec: 1.6 },
};

// กองรถนำร่อง 10 คัน — ลำดับออกต้นสายตามรอบ
const FLEET_PLAN = [
  { id: 'B01', model: 'acblue', label: '1-20318', driver: 'คข.01', offsetMin: 0  },
  { id: 'B02', model: 'nonac',  label: '8-41207', driver: 'คข.02', offsetMin: 8  },
  { id: 'B03', model: 'ev',     label: 'EV-0116', driver: 'คข.03', offsetMin: 16 },
  { id: 'B04', model: 'acblue', label: '1-20455', driver: 'คข.04', offsetMin: 24 },
  { id: 'B05', model: 'nonac',  label: '8-40912', driver: 'คข.05', offsetMin: 32 },
  { id: 'B06', model: 'ev',     label: 'EV-0142', driver: 'คข.06', offsetMin: 40 },
  { id: 'B07', model: 'acblue', label: '1-20501', driver: 'คข.07', offsetMin: 48 },
  { id: 'B08', model: 'nonac',  label: '8-41230', driver: 'คข.08', offsetMin: 56 },
  { id: 'B09', model: 'ev',     label: 'EV-0163', driver: 'คข.09', offsetMin: 64 },
  { id: 'B10', model: 'acblue', label: '1-20610', driver: 'คข.10', offsetMin: 72 },
];

const ROUTE = {
  id: 'R1',
  code: 'สายนำร่อง 1',
  shortCode: 'สาย 1 (นำร่อง)',
  name: 'จตุจักร ↔ หัวลำโพง',
  corridor: 'แนวถนนจริง: พหลโยธิน – พระราม 1 – พญาไท – ราชดำริ – จรัสเมือง',
  color: '#2a78d6',
  serviceStartSec: 6 * 3600,     // 06:00
  serviceEndSec: 22 * 3600,      // 22:00
  targetHeadwayMin: 8,           // รอบประกาศ
  minLayoverMin: 6,              // เวลาพักขั้นต่ำที่อู่ปลายทาง (ห้ามตัด)
  maxFrameMin: 5,                // กรอบปรับเวลาปล่อยรถที่อนุมัติไว้ ±5 นาที
  maxDriveMin: 480,              // ชั่วโมงทำงานขับรถสูงสุดต่อกะ (กฎหมายแรงงาน)
  minBreakMin: 60,               // เวลาพักรวมขั้นต่ำต่อกะ
};

// ── ตัวช่วยเรขาคณิต ───────────────────────────────────────────────────────────
function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** เตรียมเส้นทาง: ระยะสะสม (เมตร) + ตำแหน่งป้ายบนเส้นทาง */
function buildPath(points) {
  const path = [];
  let cum = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) cum += haversineM(points[i - 1], points[i]);
    path.push({ lat: points[i][0], lng: points[i][1], stopId: points[i][2] || null, s: cum });
  }
  const stopS = {}, stopPos = {};
  for (const p of path) if (p.stopId) { stopS[p.stopId] = p.s; stopPos[p.stopId] = { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }; }
  return { path, totalLen: cum, stopS, stopPos };
}

/** ตำแหน่ง lat/lng จากระยะสะสม s บนเส้นทาง (ทิศไป = s เพิ่ม) */
function pointAtS(pathData, s) {
  const { path, totalLen } = pathData;
  const x = Math.max(0, Math.min(totalLen, s));
  let lo = 0, hi = path.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (path[mid].s <= x) lo = mid; else hi = mid - 1; }
  const a = path[lo], b = path[Math.min(lo + 1, path.length - 1)];
  const seg = b.s - a.s || 1, f = (x - a.s) / seg;
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
    bearing: bearingDeg([a.lat, a.lng], [b.lat, b.lng]),
  };
}

function bearingDeg(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
  const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** อัตราความต้องการเดินทางตามเวลาของวัน (ตัวคูณ) — เร่งด่วน 07–09 และ 16–19 */
function demandMultiplier(simSec) {
  const h = (simSec / 3600) % 24;
  if (h >= 7 && h < 9) return 2.10;      // เร่งด่วนเช้า
  if (h >= 16 && h < 19) return 2.00;    // เร่งด่วนเย็น
  if (h >= 9 && h < 16) return 1.00;     // กลางวัน
  if (h >= 19 && h < 22) return 0.70;    // ค่ำ
  return 0.40;                           // ก่อนเปิด/หลังปิด
}

/** ปัจจัยการจราจรตามเวลา (คูณกับความเร็วอิสระ) */
function trafficMultiplier(simSec) {
  const h = (simSec / 3600) % 24;
  if (h >= 7 && h < 9.5) return 0.55;
  if (h >= 16 && h < 19.5) return 0.58;
  if (h >= 12 && h < 14) return 0.80;
  if (h >= 6 && h < 22) return 0.85;
  return 1.0;
}

/** ความเร็วเฉลี่ยย้อนหลัง 30 วันตามช่วงเวลา — ตัวตั้งต้นของ Baseline (ข้อมูลจำลองประวัติ) */
function histSpeedKmh(simSec) {
  const h = (simSec / 3600) % 24;
  if (h >= 7 && h < 9.5) return 15.0;
  if (h >= 16 && h < 19.5) return 14.5;
  if (h >= 6 && h < 22) return 19.0;
  return 26.0;
}

/** ตารางเดินรถมาตรฐาน (static timetable) — ใช้เมื่อข้อมูลสดขาดช่วง และสำหรับป้ายสิ่งพิมพ์ */
function buildTimetable(pathData, stops, route) {
  const headway = (route || ROUTE).targetHeadwayMin;
  stops = stops || STOPS;
  const avgKmh = 18;
  const tables = { fwd: {}, rev: {} };
  for (const st of stops) {
    const offsetFwdMin = (pathData.stopS[st.id] / 1000 / avgKmh) * 60;
    const totalMin = (pathData.totalLen / 1000 / avgKmh) * 60;
    const offsetRevMin = totalMin - offsetFwdMin;
    const rowsF = [], rowsR = [];
    for (let m = ROUTE.serviceStartSec / 60; m <= ROUTE.serviceEndSec / 60; m += headway) {
      rowsF.push(offsetFwdMin + m);
      rowsR.push(offsetRevMin + m);
    }
    tables.fwd[st.id] = rowsF;
    tables.rev[st.id] = rowsR;
  }
  return tables;
}

module.exports = { ROUTE_POINTS, STOPS, BUS_MODELS, FLEET_PLAN, ROUTE, buildPath, pointAtS, bearingDeg, demandMultiplier, trafficMultiplier, histSpeedKmh, buildTimetable, haversineM };

// ═══════════════════════════════════════════════════════════════════════════
// ทะเบียนหลายสาย (Multi-Route Registry) — สลับสายได้จากหน้าเว็บ ทุกสายอยู่บนแนวถนนจริง
// หมายเหตุ: เป็น "เส้นทางจำลองบนแนวถนนจริง" — ระบุแนวถนนหลัก ไม่อ้างสิทธิเดินรถตามใบอนุญาตสายใด
// พิกัด = WGS84 จุดสำคัญบนถนนแนวนั้น (แยก/สถานีขนส่ง) เรียงตามลำดับการวิ่ง
// ═══════════════════════════════════════════════════════════════════════════

/** กองรถมาตรฐานต่อสาย — ผสมรถ 3 รุ่นเหมือนสายนำร่อง 1 */
function mkFleet(n, startNo) {
  const models = ['acblue', 'nonac', 'ev'];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'B' + String(startNo + i).padStart(2, '0'),
      model: models[i % 3], label: `${1 + (i % 8)}-${20000 + i * 137}`,
      driver: 'คข.' + String((startNo + i) % 99).padStart(2, '0'),
      offsetMin: i * 8,
    });
  }
  return out;
}

/** โปรไฟล์ความต้องการเริ่มต้นต่อป้าย (baseRate = คนรอเข้ามา/นาทีโดยสัดส่วน, alight = สัดส่วนคนลงประจำป้าย) */
function mkStops(pts) {
  // pts: [id, name, lat, lng, signal, baseRate, alight, survey?, surveyLabel?]
  return pts.map((p) => ({
    id: p[0], name: p[1], signal: !!p[4], baseRate: p[5], alight: p[6],
    survey: p[7] || null, surveyLabel: p[8] || null,
  }));
}

const ROUTE_META_BASE = {
  serviceStartSec: 6 * 3600, serviceEndSec: 22 * 3600,
  minLayoverMin: 6, maxFrameMin: 5, maxDriveMin: 480, minBreakMin: 60,
};

const ROUTES = {
  // ── สายนำร่อง 1 (หลัก — มีข้อมูลความต้องการจริงที่จูนมา) ──
  R1: {
    ROUTE: { ...ROUTE_META_BASE, ...ROUTE },
    STOPS, FLEET_PLAN, ROUTE_POINTS,
  },

  // ── สาย 2: แนวถนนสุขุมวิทตลอดแนว (สาย 2 / 25 / 40 / 48 / 501 / 508 / 511 วิ่งแนวนี้) ──
  R2: {
    ROUTE: {
      ...ROUTE_META_BASE,
      id: 'R2', code: 'สายจำลอง 2 (สุขุมวิท)', shortCode: 'สาย 2 (สุขุมวิท)',
      name: 'อนุสาวรีย์ชัยสมรภูมิ ↔ บางนา',
      corridor: 'แนวถนนจริง: ถนนสุขุมวิทตลอดแนว (เพลินจิต – อโศก – ทองหล่อ – เอกมัย – อ่อนนุช – บางนา)',
      color: '#c2551e', targetHeadwayMin: 7,
    },
    STOPS: mkStops([
      ['R2S01', 'อนุสาวรีย์ชัยสมรภูมิ (ต้นสุขุมวิท)', 13.76990, 100.53750, true, 1.30, 0.50, 'origin', 'ต้นสาย'],
      ['R2S02', 'แยกเพลินจิต – ชิดลม', 13.74490, 100.54540, true, 1.10, 0.10, null, null],
      ['R2S03', 'นานา – ซอยสุขุมวิท 3', 13.74070, 100.55430, false, 0.90, 0.08, null, null],
      ['R2S04', 'อโศก – ทางแยกสุขุมวิท (BTS อโศก)', 13.73670, 100.56070, true, 1.75, 0.18, 'critical', 'กลางสายจุดวิกฤต'],
      ['R2S05', 'พร้อมพงษ์ (BTS พร้อมพงษ์)', 13.73160, 100.56540, false, 0.95, 0.14, null, null],
      ['R2S06', 'ทองหล่อ – ซอยสุขุมวิท 55 (BTS ทองหล่อ)', 13.72540, 100.57100, true, 1.20, 0.20, null, null],
      ['R2S07', 'เอกมัย (BTS เอกมัย)', 13.72480, 100.58490, true, 1.05, 0.30, null, null],
      ['R2S08', 'อ่อนนุช (BTS อ่อนนุช)', 13.69970, 100.60060, true, 1.40, 0.34, null, null],
      ['R2S09', 'บางจาก (BTS บางจาก)', 13.68300, 100.61100, false, 0.75, 0.12, null, null],
      ['R2S10', 'อุดมสุข (BTS อุดมสุข)', 13.66600, 100.62000, false, 0.65, 0.10, null, null],
      ['R2S11', 'ตลาดบางนา (ปลายสุขุมวิท)', 13.64650, 100.63440, false, 0.70, 0.48, 'terminus', 'ปลายสาย'],
    ]),
    FLEET_PLAN: mkFleet(10, 11),
    ROUTE_POINTS: [
      [13.76990, 100.53750, 'R2S01'], [13.75800, 100.54120], [13.74490, 100.54540, 'R2S02'],
      [13.74280, 100.54980], [13.74070, 100.55430, 'R2S03'], [13.73850, 100.55760],
      [13.73670, 100.56070, 'R2S04'], [13.73160, 100.56540, 'R2S05'], [13.72540, 100.57100, 'R2S06'],
      [13.72510, 100.57780], [13.72480, 100.58490, 'R2S07'], [13.71300, 100.59300],
      [13.69970, 100.60060, 'R2S08'], [13.68300, 100.61100, 'R2S09'], [13.66600, 100.62000, 'R2S10'],
      [13.65600, 100.62700], [13.64650, 100.63440, 'R2S11'],
    ],
  },

  // ── สาย 3: แนวลาดพร้าว – รัชดาภิเษก (สาย 27 / 96 / 145 / 504 วิ่งแนวนี้) ──
  R3: {
    ROUTE: {
      ...ROUTE_META_BASE,
      id: 'R3', code: 'สายจำลอง 3 (ลาดพร้าว)', shortCode: 'สาย 3 (ลาดพร้าว)',
      name: 'จตุจักร ↔ วังหิน (รัชดาภิเษก)',
      corridor: 'แนวถนนจริง: ถนนลาดพร้าว – รัชดาภิเษก (จตุจักร – ห้าแยกลาดพร้าว – เวชธานี – สุทธิสาร – วังหิน)',
      color: '#1e8f68', targetHeadwayMin: 9,
    },
    STOPS: mkStops([
      ['R3S01', 'จตุจักร (MRT สวนจตุจักร)', 13.80000, 100.55000, true, 1.25, 0.52, 'origin', 'ต้นสาย'],
      ['R3S02', 'แยกลาดพร้าว (พหลโยธิน)', 13.80500, 100.55900, true, 1.00, 0.10, null, null],
      ['R3S03', 'โรงพยาบาลเวชธานี', 13.80450, 100.56850, false, 0.80, 0.14, null, null],
      ['R3S04', 'ห้าแยกลาดพร้าว (รัชดาภิเษก)', 13.80600, 100.57500, true, 1.70, 0.22, 'critical', 'กลางสายจุดวิกฤต'],
      ['R3S05', 'สุทธิสาร (MRT สุทธิสาร)', 13.80000, 100.58560, false, 0.85, 0.16, null, null],
      ['R3S06', 'ลาดพร้าว 43 (เทศบาลวัดธาตุทอง)', 13.78900, 100.58400, false, 0.70, 0.12, null, null],
      ['R3S07', 'วังหินบูรพาภิรมย์ (แยกรัชดา–เพชรุทธ์)', 13.77700, 100.58210, true, 1.15, 0.46, 'terminus', 'ปลายสาย'],
    ]),
    FLEET_PLAN: mkFleet(8, 21),
    ROUTE_POINTS: [
      [13.80000, 100.55000, 'R3S01'], [13.80320, 100.55480], [13.80500, 100.55900, 'R3S02'],
      [13.80480, 100.56400], [13.80450, 100.56850, 'R3S03'], [13.80560, 100.57200],
      [13.80600, 100.57500, 'R3S04'], [13.80400, 100.58000], [13.80000, 100.58560, 'R3S05'],
      [13.79400, 100.58500], [13.78900, 100.58400, 'R3S06'], [13.78300, 100.58300],
      [13.77700, 100.58210, 'R3S07'],
    ],
  },

  // ── สาย 4: แนวพระราม 4 – สาทร (สาย 46 / 47 / 62 / 74 / 109 วิ่งแนวนี้) ──
  R4: {
    ROUTE: {
      ...ROUTE_META_BASE,
      id: 'R4', code: 'สายจำลอง 4 (พระราม 4)', shortCode: 'สาย 4 (พระราม 4)',
      name: 'อนุสาวรีย์ชัยสมรภูมิ ↔ แยกเจริญกรุง',
      corridor: 'แนวถนนจริง: พญาไท – แยกปทุมวัน – ถนนพระราม 4 – งามวงศ์วัล (สาทร) – บางคอแหลม',
      color: '#8a4fbf', targetHeadwayMin: 10,
    },
    STOPS: mkStops([
      ['R4S01', 'อนุสาวรีย์ชัยสมรภูมิ (เกาะพญาไท)', 13.76990, 100.53750, true, 1.20, 0.50, 'origin', 'ต้นสาย'],
      ['R4S02', 'แยกปทุมวัน (พระราม 1 × พระราม 4)', 13.73940, 100.53550, true, 1.45, 0.14, null, null],
      ['R4S03', 'สวนลุมพินี (MRT ลุมพินี)', 13.73000, 100.54470, false, 1.10, 0.18, null, null],
      ['R4S04', 'คลองเตย (MRT ศูนย์ประชุมแห่งชาติ)', 13.72100, 100.55600, true, 1.30, 0.26, null, null],
      ['R4S05', 'แยกงามวงศ์วัล (สาทรเหนือ)', 13.71600, 100.53000, true, 1.55, 0.22, 'critical', 'กลางสายจุดวิกฤต'],
      ['R4S06', 'วัดจันทร์ศิริ – บางคอแหลม', 13.71400, 100.52200, false, 0.60, 0.10, null, null],
      ['R4S07', 'แยกเจริญกรุง (บางคอแหลม)', 13.71260, 100.51400, false, 0.65, 0.44, 'terminus', 'ปลายสาย'],
    ]),
    FLEET_PLAN: mkFleet(8, 31),
    ROUTE_POINTS: [
      [13.76990, 100.53750, 'R4S01'], [13.75500, 100.53650], [13.73940, 100.53550, 'R4S02'],
      [13.73500, 100.53900], [13.73000, 100.54470, 'R4S03'], [13.72500, 100.55000],
      [13.72100, 100.55600, 'R4S04'], [13.71850, 100.54300], [13.71600, 100.53000, 'R4S05'],
      [13.71400, 100.52200, 'R4S06'], [13.71260, 100.51400, 'R4S07'],
    ],
  },
};

/** ประกอบข้อมูลสายให้สมบูรณ์ (คำนวณ stopS ผ่าน buildPath ทำใน world.js เอง) */
function routeDef(id) {
  return ROUTES[id] || ROUTES.R1;
}

module.exports.ROUTES = ROUTES;
module.exports.routeDef = routeDef;
