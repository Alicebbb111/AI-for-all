'use strict';
/**
 * OmniTransit v5 — engine/ai.js
 * ตัวเชื่อม OpenAI API จริง (Real AI Crowding & ETA Forecaster)
 * - ศูนย์ dependency: ใช้โมดูล https ในตัวของ Node.js เท่านั้น
 * - อ่าน OPENAI_API_KEY / OPENAI_MODEL จากไฟล์ .env (ถ้ามี) หรือรับจากหน้าตั้งค่าแบบ runtime
 * - ตอบกลับเป็น Structured JSON: predicted_passengers, seated_count, standing_count,
 *   crowding_level, pass_up_risk_percent, ai_reasoning_th
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const state = { apiKey: null, model: 'gpt-4o-mini', source: 'none' };
const cache = new Map(); // key → { at, data } — กันเปลืองโทเคน (TTL 45 วินาที)
const CACHE_TTL_MS = 45_000;

/** อ่าน .env แบบเรียบง่าย (ไม่ override ค่าที่ตั้งไว้แล้วใน environment) */
function loadDotEnv(dir) {
  try {
    const p = path.join(dir, '.env');
    if (!fs.existsSync(p)) return false;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
      state.apiKey = process.env.OPENAI_API_KEY.trim();
      state.source = 'env';
    }
    if (process.env.OPENAI_MODEL && ['gpt-4o-mini', 'gpt-4o'].includes(process.env.OPENAI_MODEL)) {
      state.model = process.env.OPENAI_MODEL;
    }
    return true;
  } catch (e) {
    console.error('[ai] อ่าน .env ไม่สำเร็จ:', e.message);
    return false;
  }
}

function status() {
  return { configured: !!state.apiKey, model: state.model, source: state.source };
}

/** ตั้งค่า runtime (จากหน้าตั้งค่า) — apiKey เป็นค่าว่าง = ลบ Key ออก */
function setConfig({ apiKey, model } = {}) {
  if (typeof apiKey === 'string') {
    const k = apiKey.trim();
    state.apiKey = k || null;
    state.source = k ? 'runtime' : 'none';
  }
  if (model && ['gpt-4o-mini', 'gpt-4o'].includes(model)) state.model = model;
  cache.clear(); // เปลี่ยน Key/รุ่น → เคลียร์แคชให้ผลใหม่ใช้การตั้งค่าล่าสุด
  return { ok: true, ...status() };
}

const SYSTEM_PROMPT = [
  'คุณคือนักวิเคราะห์ผู้โดยสารรถโดยสารประจำทางของกรุงเทพฯ ที่เชี่ยวชาญการพยากรณ์ความแน่นของรถเมล์',
  'รับข้อมูลบริบทการเดินทางจริง (JSON) แล้ววิเคราะห์ว่าเมื่อรถคันนี้ไปถึง "ป้ายเป้าหมาย" จะมีคนบนรถประมาณกี่คน',
  'โดยพิจารณาจาก: จำนวนคนบนรถปัจจุบัน, คนรอสะสมที่ป้ายเป้าหมายและป้ายระหว่างทาง, สถิติคนขึ้น-ลงที่ป้ายก่อนหน้า,',
  'ระยะห่างกับรถคันหน้า (headway), สภาพจราจร, สภาพอากาศ และช่วงเวลาของวัน',
  'เกณฑ์ระดับความแน่นของรถรุ่นนี้: ระดับ 0 = จำนวนคนน้อยกว่าจำนวนเบาะนั่ง, ระดับ 1 = เกินเบาะนั่งแต่พื้นที่ยืนยังสบาย (ต่ำกว่า 65% ของพื้นที่ยืน), ระดับ 2 = แน่นเกินนั้นจนใกล้ความจุสูงสุด',
  'ในบริบทมีกล่อง deterministic_model: ตัวเลขจากสมการไหลสะสมรายป้าย/ETA คูณขวักไขว่/ความไม่แน่นอนสะสมของเอนจิน',
  '(currentOnboard, propagatedEstimateAtTargetStop.N_hat ± sigma, expectedIntermediateBoardings/Alightings, headwayMin, coupledEtaMin)',
  'ให้ใช้เป็นฐานคณิตศาสตร์หลัก ปรับเพียงเล็กน้อยตามสภาพจราจร-ฝน-ช่วงเวลา และอ้างเหตุผลจากตัวเลขชุดนี้เสมอ ห้ามแต่งตัวเลขที่ขัดกับมัน',
  'ตอบกลับเป็น JSON อย่างเดียว ตามรูปแบบ:',
  '{"predicted_passengers": <จำนวนเต็ม 0 ถึง legalMax>, "seated_count": <จำนวนเต็ม 0 ถึง seats, ต้องไม่เกิน predicted_passengers>, "standing_count": <predicted_passengers - seated_count>, "crowding_level": <0|1|2>, "pass_up_risk_percent": <จำนวนเต็ม 0-100 โอกาสที่คนรอที่ป้ายเป้าหมายจะขึ้นไม่ได้>, "ai_reasoning_th": "<คำอธิบายสั้น 1-2 ประโยค เป็นภาษาไทยธรรมชาติ อ้างเหตุผลจากข้อมูลที่ได้เท่านั้น ห้ามแต่งตัวเลขเพิ่ม>"}',
].join('\n');

/** เรียก Chat Completions ด้วย https ในตัว — resolve เสมอ (ไม่เคย reject) */
function callOpenAI(contextPayload) {
  return new Promise((resolve) => {
    if (!state.apiKey) {
      return resolve({
        ok: false, needsKey: true,
        error: 'ยังไม่ได้ระบุ OpenAI API Key — เปิดปุ่ม "ตั้งค่า/จำลอง" มุมขวาบน วาง Key แล้วบันทึก (หรือใส่ในไฟล์ .env ตาม .env.example แล้วรีสตาร์ต)',
      });
    }
    const body = JSON.stringify({
      model: state.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(contextPayload) },
      ],
    });
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      timeout: 25_000,
      headers: {
        'Authorization': `Bearer ${state.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          if (res.statusCode === 401) return resolve({ ok: false, error: 'API Key ไม่ถูกต้อง (401) — ตรวจสอบ Key แล้วบันทึกใหม่' });
          if (res.statusCode === 429) return resolve({ ok: false, error: 'โควตาหรืออัตราเรียกใช้เกินกำหนด (429) — ลองใหม่ภายหลัง' });
          if (res.statusCode !== 200) return resolve({ ok: false, error: `OpenAI ตอบกลับรหัส ${res.statusCode}` });
          const parsed = JSON.parse(data);
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          const out = JSON.parse(content);
          if (typeof out !== 'object' || out === null) throw new Error('not an object');
          resolve({ ok: true, raw: out });
        } catch {
          resolve({ ok: false, error: 'ตอบกลับจาก OpenAI ไม่อยู่ในรูปแบบ Structured JSON ที่กำหนด — ลองอีกครั้ง' });
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ ok: false, error: 'เชื่อมต่อ OpenAI ไม่สำเร็จ: ' + e.message }));
    req.write(body);
    req.end();
  });
}

/** แคชผลลัพธ์ราย (รถ+ป้าย) กันยิงถี่เกิน — TTL 45 วินาที รูปร่างตอบกลับสม่ำเสมอ {ok, data, cached} */
function cached(key, producer) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return Promise.resolve({ ok: true, data: hit.data, cached: true });
  return Promise.resolve().then(producer).then((r) => {
    if (r.ok) {
      cache.set(key, { at: now, data: r.data });
      if (cache.size > 40) cache.delete(cache.keys().next().value);
    }
    return r;
  });
}

/** เรียก Chat แบบ generic (สำหรับโมดูลอื่น เช่น นักวิเคราะห์สถานการณ์) — resolve เสมอ {ok, text} */
function chat(systemPrompt, userContent, { temperature = 0.3 } = {}) {
  return new Promise((resolve) => {
    if (!state.apiKey) return resolve({ ok: false, needsKey: true, error: 'ยังไม่ได้ระบุ OpenAI API Key' });
    const body = JSON.stringify({
      model: state.model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      timeout: 25_000,
      headers: {
        'Authorization': `Bearer ${state.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          if (res.statusCode === 401) return resolve({ ok: false, error: 'API Key ไม่ถูกต้อง (401)' });
          if (res.statusCode === 429) return resolve({ ok: false, error: 'โควตา/อัตราเรียกเกินกำหนด (429)' });
          if (res.statusCode !== 200) return resolve({ ok: false, error: `OpenAI ตอบกลับรหัส ${res.statusCode}` });
          const parsed = JSON.parse(data);
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          resolve({ ok: true, text: String(content || '').trim() });
        } catch { resolve({ ok: false, error: 'ตอบกลับไม่อยู่ในรูปแบบที่กำหนด' }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ ok: false, error: 'เชื่อมต่อไม่สำเร็จ: ' + e.message }));
    req.write(body);
    req.end();
  });
}

module.exports = { loadDotEnv, status, setConfig, callOpenAI, chat, cached };
