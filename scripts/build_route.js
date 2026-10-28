'use strict';
/**
 * OmniTransit v5 — scripts/build_route.js
 * สร้างเรขาคณิตเส้นทางบน "แนวถนนจริง" ด้วย OSRM (Open Source Routing Machine — เซิร์ฟเวอร์สาธารณะ
 * ใช้ข้อมูล OpenStreetMap ODbL ฟรี ไม่ต้องมี Key) — เส้นทางที่ได้เป็นถนนเดียวกับที่แอปแผนที่ทั่วไปใช้
 *
 * ขั้นตอน:
 *  1) แต่ละป้าย ลองขยับตำแหน่งบนตาราง ±50–70 ม. รอบพิกัดตั้งต้น แล้วเลือกจุดที่ทำให้
 *     "ช่วงเข้า + ช่วงออก" สั้นที่สุด — กันป้ายไปเกาะทางคู่ขนานลอย/ทางวิ่งขากลับ/สะพานลอย จนเส้นทางต้องวนยูทร์น
 *  2) ขอเส้นทางขับรถ (โปรไฟล์รถยนต์ ตัดทางพิเศษ) ระหว่างป้ายแต่ละคู่ → geometry ถนนจริงระดับจุดยอด
 *  3) ประกอบเป็นโพลีไลน์เดียว ป้ายทุกป้ายฝังเป็นจุดบนเส้นพอดี (พิกัดสแนปลงถนนจริง)
 *
 * การใช้งาน:  node scripts/build_route.js   (ต้องต่ออินเทอร์เน็ต รันครั้งเดียวต่อการแก้ป้าย/เพิ่มป้าย)
 * ผลลัพธ์:   engine/route_geo.js (ไฟล์ generated — ห้ามแก้มือ)
 */

const fs = require('fs');
const path = require('path');

// ── ป้ายต้นทาง-ปลายทางของแต่ละช่วง (พิกัด = จุดบนถนนจริงที่จูนแล้ว — สคริปต์จะยืนยัน/จูนต่อให้อีกที) ──
const STOPS = [
  { id: 'S01', name: 'จตุจักร (BTS หมอชิต / MRT สวนจตุจักร)',          lat: 13.79880, lng: 100.54635 },
  { id: 'S02', name: 'กรมการขนส่งทางบก (พหลโยธิน)',   lat: 13.79300, lng: 100.54685 },
  { id: 'S03', name: 'สะพานควาย (BTS สะพานควาย)',                   lat: 13.78790, lng: 100.54255 },
  { id: 'S04', name: 'ซอยอารีย์ (BTS อารีย์)',                    lat: 13.78160, lng: 100.54160 },
  { id: 'S05', name: 'อนุสาวรีย์ชัยสมรภูมิ (เกาะพญาไท)',         lat: 13.77050, lng: 100.53910 },
  { id: 'S06', name: 'แยกราชวิถี (รพ.ราชวิถี / พญาไท)',             lat: 13.76430, lng: 100.53495 },
  { id: 'S07', name: 'แยกราชเทวี (BTS ราชเทวี)',                     lat: 13.75700, lng: 100.53390 },
  { id: 'S08', name: 'ประตูน้ำ – แยกราชประสงค์',          lat: 13.75210, lng: 100.53540 },
  { id: 'S09', name: 'สยามสแควร์ / มาบุญครอง (MBK)',                        lat: 13.74620, lng: 100.53555 },
  { id: 'S10', name: 'สามย่าน – จุฬาลงกรณ์มหาวิทยาลัย', lat: 13.74000, lng: 100.53340 },
  { id: 'S11', name: 'แยกสะพานเหลือง (ถ.พระราม 4)',         lat: 13.73130, lng: 100.52695 },
  { id: 'S12', name: 'แยกมหานคร – สี่พระยา (ถ.พระราม 4)',           lat: 13.73180, lng: 100.51930 },
  { id: 'S13', name: 'สถานีรถไฟกรุงเทพ (หัวลำโพง)',                    lat: 13.73100, lng: 100.51840 },
];

// ── จุดบังคับแนวถนน (via) — เฉพาะจุดที่ตรวจสอบแล้วว่าอยู่บนถนนหลักเป้าหมาย ──
const VIAS = {
  'S07-S08': [{ lat: 13.7528, lng: 100.5340 }], // ถนนเพชรบุรี → ประตูน้ำ
  'S08-S09': [{ lat: 13.7467, lng: 100.5363 }], // แยกราชประสงค์ (ราชดำริ × พระราม 1) → สยาม
  'S10-S11': [{ lat: 13.7370, lng: 100.5306 }], // แยกสามย่าน (พญาไท × พระราม 4)
};
const viaFor = (k) => VIAS[`${STOPS[k].id}-${STOPS[k + 1].id}`] || [];

const HOSTS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];
const POLITE_MS = 220;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fetchRoute(waypoints) {
  const coordStr = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  for (const host of HOSTS) {
    // ช่วงสั้นใจกลางเมืองบนถนนพื้นธรรมดาอยู่แล้ว — ไม่ขอ exclude (เซิร์ฟเวอร์สาธารณะไม่รองรับ)
    const url = `${host}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&annotations=false`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.code === 'Ok' && j.routes?.length && j.waypoints?.length) return j;
    } catch { /* ลองโฮสต์ถัดไป */ }
    await sleep(80);
  }
  throw new Error(`เรียก OSRM ไม่สำเร็จ: ${coordStr.slice(0, 60)}…`);
}

/** มิเตอร์วนย้อน: รวมระยะที่เส้นทางถอยหลังบนแกนตรง a→b — ตัดวงจรวนย้อน (เข้าวงแหวนซ้ำ/ยูทร์นกลับ) */
function backtrackM(coords, a, b) {
  const ux = b.lng - a.lng, uy = b.lat - a.lat;
  const len2 = ux * ux + uy * uy || 1e-12;
  let prevT = null, back = 0;
  for (let i = 0; i < coords.length; i += 2) {
    const t = ((coords[i][1] - a.lat) * uy + (coords[i][0] - a.lng) * ux) / len2;
    if (prevT !== null && t < prevT) back += (prevT - t) * Math.sqrt(len2) * 111320;
    prevT = t;
  }
  return back;
}

// แคชผลลัพธ์ตามลำดับพิกัด — การจูนป้ายเรียกซ้ำหลายครั้ง ไม่ต้องเปลืองเซิร์ฟเวอร์
const cache = new Map();
async function routeOf(a, via, b) {
  const key = [a, ...via, b].map((w) => w.lat.toFixed(5) + ',' + w.lng.toFixed(5)).join('|');
  if (cache.has(key)) return cache.get(key);
  const j = await fetchRoute([a, ...via, b]);
  cache.set(key, j);
  await sleep(POLITE_MS);
  return j;
}
const distOf = async (a, via, b) => (await routeOf(a, via, b)).routes[0].distance;

/** ตำแหน่งป้ายผู้สมัคร 25 จุดรอบพิกัดตั้งต้น (±90 ม. × ±145 ม.) — ครอบคลุมเกาะกลาง/ทางคู่ขนานทั้งสองฝั่ง */
function* candidates(p) {
  for (const dLat of [-0.0008, -0.0004, 0, 0.0004, 0.0008])
    for (const dLng of [-0.0013, -0.00065, 0, 0.00065, 0.0013])
      yield { lat: +(p.lat + dLat).toFixed(6), lng: +(p.lng + dLng).toFixed(6) };
}

async function legScore(a, via, b) {
  const j = await routeOf(a, via, b);
  const back = backtrackM(j.routes[0].geometry.coordinates, a, b);
  return j.routes[0].distance + 2 * back; // โทษวนย้อนหนัก 2 เท่าของระยะที่ถอย
}

async function tunePass(prevChosen) {
  const chosen = [];
  for (let k = 0; k < STOPS.length; k++) {
    const st = STOPS[k];
    const viaIn = k > 0 ? viaFor(k - 1) : [];
    const viaOut = k < STOPS.length - 1 ? viaFor(k) : [];
    const prev = k > 0 ? chosen[k - 1].pt : null;
    const next = k < STOPS.length - 1 ? STOPS[k + 1] : null;
    let best = null;
    for (const c of candidates(st)) {
      let score = 0, ok = true;
      try {
        if (prev) score += await legScore(prev, viaIn, c);
        if (next) score += await legScore(c, viaOut, next);
      } catch { ok = false; }
      if (!ok) continue;
      const drift = haversineM(st, c);
      if (!best || score < best.score - 25 || (Math.abs(score - best.score) <= 25 && drift < best.drift)) {
        best = { pt: c, score, drift };
      }
    }
    if (!best) throw new Error(`จูนป้าย ${st.id} ไม่สำเร็จ`);
    chosen.push({ ...st, pt: best.pt });
    const pass = prevChosen ? ' (รอบ 2)' : '';
    if (!prevChosen || haversineM(prevChosen[k].pt, best.pt) > 1) {
      console.log(`${st.id} ${st.name}${pass}: → ${best.pt.lat.toFixed(5)},${best.pt.lng.toFixed(5)} (คะแนน ${(best.score / 1000).toFixed(2)} กม.)`);
    }
  }
  return chosen;
}

async function main() {
  // ── 1) จูนตำแหน่งป้าย 2 รอบ (รอบ 2 เก็บรายละเอียดจุดที่อยู่ระหว่างป้ายเพื่อนบ้านจูนไปแล้ว) ──
  const pass1 = await tunePass(null);
  const chosen = await tunePass(pass1);
  // ตรวจว่าจูนรอบ 2 ขยับต่อหรือไม่ — ถ้าขยับเยอะแจ้งเตือนให้รันอีกครั้ง
  let stillMoving = 0;
  for (let k = 0; k < STOPS.length; k++) if (haversineM(pass1[k].pt, chosen[k].pt) > 1) stillMoving++;
  if (stillMoving > 3) console.log(`  ⚠ รอบ 2 ยังขยับ ${stillMoving} ป้าย — ลองรันสคริปต์ซ้ำอีกครั้งเพื่อให้เสถียร`);

  // ── 2) เส้นทางจริงระหว่างป้าย (ถ้ายังอ้อมเกิน 1.8× ลองเติม via กึ่งกลาง) ──
  const legs = [];
  for (let k = 0; k < STOPS.length - 1; k++) {
    const a = chosen[k].pt, b = chosen[k + 1].pt;
    const via = viaFor(k);
    const straight = haversineM(a, b);
    let j = await routeOf(a, via, b);
    let dist = j.routes[0].distance;
    if (dist / straight > 1.8) {
      const mid = { lat: +((a.lat + b.lat) / 2).toFixed(6), lng: +((a.lng + b.lng) / 2).toFixed(6) };
      try {
        const j2 = await routeOf(a, [...via, mid], b);
        if (j2.routes[0].distance < dist) { j = j2; dist = j2.routes[0].distance; console.log(`  (${chosen[k].id}→${chosen[k + 1].id}: เติม via กึ่งกลาง)`);
        }
      } catch { /* ใช้เส้นทางเดิม */ }
    }
    const snapA = haversineM(a, { lat: j.waypoints[0].location[1], lng: j.waypoints[0].location[0] });
    const snapB = haversineM(b, { lat: j.waypoints[j.waypoints.length - 1].location[1], lng: j.waypoints[j.waypoints.length - 1].location[0] });
    const flag = dist / straight > 1.8 ? '  ⚠ อ้อมเกิน' : '';
    console.log(`${chosen[k].id}→${chosen[k + 1].id}: ${(dist / 1000).toFixed(2)} กม. · ${j.routes[0].geometry.coordinates.length} จุด · สแนป ${snapA.toFixed(0)}/${snapB.toFixed(0)} ม.${flag}`);
    legs.push({ from: chosen[k].id, to: chosen[k + 1].id, coords: j.routes[0].geometry.coordinates });
  }

  // ── 3) ประกอบโพลีไลน์เดียว: หัวช่วงถัดไปซ้อนท้ายช่วงก่อน (จุดป้ายเดียวกัน) ──
  const raw = [];
  legs.forEach((leg, k) => {
    leg.coords.forEach((c, i) => {
      if (k > 0 && i === 0) return; // ตัดจุดซ้ำกับท้ายช่วงก่อน
      const edge = i === 0 || i === leg.coords.length - 1;
      raw.push({
        lat: +c[1].toFixed(6), lng: +c[0].toFixed(6),
        stopId: edge ? (i === 0 ? leg.from : leg.to) : null,
      });
    });
  });

  // ตัดจุดชิดกัน (< 0.5 ม.) โดยรักษาจุดป้ายไว้เสมอ
  const points = [];
  for (const p of raw) {
    const prev = points[points.length - 1];
    if (prev && p.stopId && !prev.stopId && haversineM(prev, p) < 0.5) points.pop();
    else if (prev && !p.stopId && haversineM(prev, p) < 0.5) continue;
    points.push(p);
  }
  for (const st of STOPS) if (!points.some((p) => p.stopId === st.id)) throw new Error(`ป้าย ${st.id} หายจากเส้นทาง`);

  let totalM = 0;
  for (let i = 1; i < points.length; i++) totalM += haversineM(points[i - 1], points[i]);

  // เขียนออกเป็นแถว [lat, lng, stopId|null] — ฟอร์แมตเดียวกับ ROUTE_POINTS ที่ engine/data.js ใช้
  const rows = points.map((p) => [p.lat, p.lng, p.stopId]);
  const out = {
    meta: {
      generator: 'scripts/build_route.js',
      source: 'OSRM (โปรไฟล์รถยนต์) บนข้อมูล OpenStreetMap — เรขาคณิตแนวถนนจริงระดับจุดยอด',
      license: 'OpenStreetMap contributors (ODbL) · routing © OSRM project',
      points: rows.length,
      totalLenM: Math.round(totalM),
      stops: STOPS.length,
      stopCoords: STOPS.reduce((acc, st) => {
        const p = points.find((x) => x.stopId === st.id);
        acc[st.id] = { name: st.name, lat: p.lat, lng: p.lng };
        return acc;
      }, {}),
    },
    points: rows,
  };

  const file = path.join(__dirname, '..', 'engine', 'route_geo.js');
  const banner = `'use strict';
/**
 * OmniTransit v5 — engine/route_geo.js  (ไฟล์ GENERATED — ห้ามแก้ไขด้วยมือ)
 * สร้างโดย scripts/build_route.js เมื่อ ${new Date().toISOString()}
 * เรขาคณิตเส้นทางบนแนวถนนจริงของกรุงเทพฯ จาก OSRM/OpenStreetMap:
 * ${out.meta.stops} ป้าย · ${out.meta.points} จุดยอด · ${out.meta.totalLenM} ม.
 * แก้ป้าย/เพิ่มป้าย → แก้รายการใน scripts/build_route.js แล้วรัน "node scripts/build_route.js"
 */
module.exports = `;
  fs.writeFileSync(file, banner + JSON.stringify(out, null, 1) + ';\n', 'utf8');
  console.log(`\nเขียน ${file}\nรวม ${points.length} จุด · ${(totalM / 1000).toFixed(2)} กม.`);
}

main().catch((err) => { console.error('[build_route]', err.message); process.exit(1); });
