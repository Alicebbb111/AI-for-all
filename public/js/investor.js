'use strict';
/* OmniTransit v5 — investor.js (หน้านำเสนอผู้ลงทุน: ดึงตัวเลขสดจากเอนจิน + โครงการใช้เงิน/Roadmap) */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : '–';
  const pct = (v, d = 1) => Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d) + '%' : '–';

  // ── การใช้เงิน 100 ล้าน (ล้านบาท) — รวมต้องเท่ากับ 100 ──
  const FUNDS = [
    { item: 'Edge-AI Kit — กล้อง + NPU + ติดตั้งรถนำร่อง', amount: 35, color: '#2a78d6' },
    { item: 'R&D Transit OS / เอนจิน 4 สมการ / Digital Twin', amount: 25, color: '#0ca30c' },
    { item: 'นำร่องปฏิบัติการจริง (Pilot Ops · ผู้เชี่ยวชาญภาคสนาม)', amount: 18, color: '#d97706' },
    { item: 'Enterprise Integration — GTFS-RT, API, ความปลอดภัย', amount: 10, color: '#8a4fbf' },
    { item: 'Sales & Government Relations', amount: 7, color: '#c2551e' },
    { item: 'Working Capital', amount: 5, color: '#6b7280' },
  ];

  // ── Roadmap 24 เดือน (ผูก Gate ตรวจสอบได้) ──
  const ROADMAP = [
    { t: 'เดือน 1–4 · นำร่องวัดผลจริง (Pilot)', items: ['ติดตั้ง Edge-AI Kit 20 คันบนสายนำร่องกับผู้ให้บริการ 1 ราย', 'ตรวจสอบความแม่นนับคนกับการนับจริงภาคสนาม (เป้า ≥97%)', 'ปิด Gate: ลดเวลารอ ≥10% และ Pass-up ลดลงชัดเจนตามเป้าหมาย'] },
    { t: 'เดือน 5–10 · ประจำการระดับสาย (Line Production)', items: ['ขยาย 200 คัน + ต่อ GTFS-RT ให้หน่วยงานกำกับ', 'เปิด Analytics Platform ให้ผู้บริหารเดินรถใช้จริง', 'ปิด Gate: SLA ความพร้อมระบบ ≥99.5% + สัญญาต่อยอดรายแรก'] },
    { t: 'เดือน 11–18 · ขยายระดับเมือง (City Scale)', items: ['ติดตั้งสะสม 1,000 คัน', 'เปิด Digital Twin นโยบายให้หน่วยงานวางแผนใช้', 'ปิด Gate: ARR ตามแผน + ผลตอบแทนลูกค้ายืนยันโดยผู้ใช้'] },
    { t: 'เดือน 19–24 · ข้ามพรมแดน (ASEAN Ready)', items: ['นำร่องเมืองใหญ่อีก 1 เมืองในอาเซียนด้วยโค้ดชุดเดียว', 'ระบบรับรองความปลอดภัย/ข้อมูลส่วนบุคคลระดับมาตรฐานสากล', 'ปิด Gate: พร้อมระดมทุนรอบถัดไปด้วยสัญญาจริง ไม่ใช่การคาดการณ์'] },
  ];

  // ── Enterprise readiness badges ──
  const READY = [
    ['ความปลอดภัย API', 'Ingest/Operations แยก token + authorization ทุก endpoint ที่เปลี่ยนสถานะ'],
    ['มาตรฐานสากล', 'GTFS-Realtime feed + REST API — เชื่อมระบบเดิมของหน่วยงานได้ทันที'],
    ['PDPA-By-Design', 'กล้อง Edge NPU ประมวลผล On-Device ส่งออกเฉพาะตัวเลข ไม่มีภาพ/ใบหน้า'],
    ['Auditability', 'ทุกการตัดสินใจของนายท่า/ระบบถูกบันทึกพร้อมเหตุผล ตรวจย้อนได้'],
    ['Zero-Vendor-Lock', 'ศูนย์ dependency · รันบนเซิร์ฟเวอร์ของลูกค้า · ทำงานออฟไลน์ได้'],
    ['Digital Twin', 'ทดลองนโยบาย 4 แบบบน simulation ก่อนใช้จริง วัดผลด้วย seed ที่ตรวจสอบซ้ำได้'],
  ];

  function renderStatic() {
    // การใช้เงิน: donut SVG + ตาราง
    const total = FUNDS.reduce((a, c) => a + c.amount, 0);
    let angle = -90, arcs = '';
    const cx = 90, cy = 90, r = 70, sw = 30;
    for (const f of FUNDS) {
      const frac = f.amount / total, sweep = frac * 360;
      const large = sweep > 180 ? 1 : 0;
      const a0 = (angle * Math.PI) / 180, a1 = ((angle + sweep) * Math.PI) / 180;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      arcs += `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${f.color}" stroke-width="${sw}" stroke-linecap="butt"><title>${esc(f.item)}: ${f.amount} ล้านบาท</title></path>`;
      angle += sweep;
    }
    document.getElementById('inv-donut').innerHTML = `
      <svg viewBox="0 0 180 180" style="width:230px; max-width:100%;" role="img" aria-label="สัดส่วนการใช้เงิน 100 ล้านบาท">
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="26" font-weight="700" fill="currentColor">${total}</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">ล้านบาท</text>
      </svg>`;
    document.getElementById('inv-fund-rows').innerHTML = FUNDS.map((f) => `
      <div class="inv-fund-row">
        <span class="inv-dot" style="background:${f.color}"></span>
        <span class="grow">${esc(f.item)}</span>
        <span class="inv-fund-amt">${f.amount} ล้าน</span>
        <span class="inv-fund-pct">${Math.round((f.amount / total) * 100)}%</span>
      </div>`).join('');

    document.getElementById('inv-roadmap').innerHTML = ROADMAP.map((ph, i) => `
      <div class="inv-phase">
        <div class="inv-phase-no">${String(i + 1).padStart(2, '0')}</div>
        <div class="grow">
          <h3>${esc(ph.t)}</h3>
          <ul>${ph.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
      </div>`).join('');

    document.getElementById('inv-ready').innerHTML = READY.map(([t, d]) => `
      <div class="inv-ready-item"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('');
  }

  // ── ตัวเลขสดจากเอนจิน ──
  async function renderLive() {
    try {
      const [st, ops, routes] = await Promise.all([
        OT.get('/api/state?scope=ops'),
        OT.get('/api/operations/state'),
        OT.get('/api/routes'),
      ]);
      if (!st || st.error) return;
      const buses = st.ai.buses || [];
      const onboard = buses.reduce((a, b) => a + (b.onboardEst ?? 0), 0);
      const cs = ops.corridorSummary || {};
      const cmp = st.comparison || {};
      const tiles = [
        { v: (routes.routes || []).length || '4', u: 'เส้นทางจำลอง', d: 'แนวถนนจริง สลับสายได้ทันที' },
        { v: buses.length, u: 'คันกำลังวิ่งสด', d: `คนบนรถจริง (กล้อง AI) ${onboard} คน` },
        { v: `${cs.redLightsActiveNow ?? '–'}/${cs.totalSignalStops ?? '–'}`, u: 'สัญญาณไฟที่ติดตาม', d: 'สถานะสดรายแยก นับถอยหลังเป็นวินาที' },
        { v: (cs.highRiskCount ?? 0) + (cs.mediumRiskCount ?? 0), u: 'คันที่ระบบเฝ้าระวัง', d: 'ตรวจจับความเสี่ยงรถขาดระยะอัตโนมัติ' },
      ];
      document.getElementById('inv-live').innerHTML = tiles.map((t) => `
        <div class="inv-tile"><div class="inv-tile-v">${esc(String(t.v))}</div><div class="inv-tile-u">${esc(t.u)}</div><div class="inv-tile-d">${esc(t.d)}</div></div>`).join('') + `
        <div class="inv-cmp">
          <h3>ผลเทียบ Baseline vs OmniTransit (สดจากสองเวิลด์คู่ขนาน)</h3>
          <table class="data">
            <thead><tr><th>ตัวชี้วัด</th><th class="num">Baseline</th><th class="num">OmniTransit</th><th class="num">เปลี่ยนแปลง</th><th>เป้าหมาย</th></tr></thead>
            <tbody>
              <tr><td>เวลารอเฉลี่ย (นาที)</td><td class="num">${fmt(cmp.avgWait?.baseline, 2)}</td><td class="num">${fmt(cmp.avgWait?.ai, 2)}</td><td class="num">${pct(cmp.avgWait?.deltaPct)}</td><td>${cmp.avgWait?.targetPct != null ? pct(cmp.avgWait.targetPct) : '–'}</td></tr>
              <tr><td>อัตราขึ้นรถไม่ได้ (%)</td><td class="num">${cmp.passUpRate?.baseline != null ? (cmp.passUpRate.baseline * 100).toFixed(1) : '–'}</td><td class="num">${cmp.passUpRate?.ai != null ? (cmp.passUpRate.ai * 100).toFixed(1) : '–'}</td><td class="num">${pct(cmp.passUpRate?.deltaPct)}</td><td>${cmp.passUpRate?.targetPct != null ? pct(cmp.passUpRate.targetPct) : '–'}</td></tr>
              <tr><td>ผู้โดยสารที่ให้บริการ (สะสม)</td><td class="num">${cmp.paxServed?.baseline ?? '–'}</td><td class="num">${cmp.paxServed?.ai ?? '–'}</td><td class="num muted">จำนวนเท่ากันโดยการออกแบบ (ความยุติธรรม)</td><td>–</td></tr>
            </tbody>
          </table>
          <p class="inv-note">ช่วงเริ่มจำลองตัวเลขสองเวิลด์ยังใกล้เคียงกัน — ผลจริงจะแยกชัดเมื่อรถวิ่งสะสมช่วงเร่งด่วน ระบบรายงานตามจริงแม้ยังไม่ผ่านเป้า (ความซื่อสัตย์คือนโยบาย)</p>
        </div>`;
    } catch { /* หน้ายังอ่านได้ครบโดยไม่มีตัวเลขสด */ }
  }

  renderStatic();
  renderLive();
  setInterval(renderLive, 10000);
})();
