'use strict';
/* OmniTransit v5 — governance.js (Roadmap 16 สัปดาห์ + Kill Switch + งบ + Charter) */
(function () {
  const $ = (id) => document.getElementById(id);

  // ── งบประมาณ: แถวแบบแก้ค่าได้ {name, f:[ปัจจัย], mode:'mul'|'lump'} ─────────
  const BUDGET_ROWS = [
    { name: 'สำรวจภาคสนาม', note: 'ผู้สำรวจ × วัน × ค่าตอบแทน/วัน', f: [2, 40, 1500], mode: 'mul' },
    { name: 'ระบบข้อมูล หน้าจอนายท่า และเว็บพื้นฐาน', note: 'คน-เดือน × อัตรา', f: [3, 70000, 0], mode: 'mul2' },
    { name: 'ผู้ประสานงานโครงการ', note: 'เดือน × อัตรา', f: [4, 35000, 0], mode: 'mul2' },
    { name: 'เจ้าหน้าที่ให้ข้อมูลช่วงทดลอง', note: 'จุด × วัน × ชม. × ค่าตอบแทน/ชม.', f: [3, 30, 4, 150], mode: 'mul4' },
    { name: 'ตรวจข้อมูล/ประเมินผลโดยผู้ไม่ใช่ผู้พัฒนาหลัก', note: 'เหมาเพื่อวางกรอบ', f: [60000], mode: 'lump' },
    { name: 'ตรวจข้อกฎหมาย สัญญา และข้อมูลส่วนบุคคล', note: 'เหมาเพื่อวางกรอบ', f: [60000], mode: 'lump' },
    { name: 'โฮสติ้ง สื่อสาร และสำรองข้อมูล', note: 'เดือน × ค่าใช้จ่าย/เดือน', f: [4, 8000, 0], mode: 'mul2' },
    { name: 'ป้ายเอกสาร อบรม และช่วยการเข้าถึง', note: 'เหมาเพื่อวางกรอบ', f: [30000], mode: 'lump' },
    { name: 'อุปกรณ์ทดแทน/ติดตั้งเล็กน้อย', note: 'เหมาเพื่อวางกรอบ', f: [30000], mode: 'lump' },
  ];
  const FACTOR_LABEL = { mul: ['คน', 'วัน', 'บาท/วัน'], mul2: ['หน่วย', 'บาท/หน่วย', ''], mul4: ['จุด', 'วัน', 'ชม./วัน', 'บาท/ชม.'], lump: ['เหมา (บาท)'] };

  function buildBudget() {
    const tb = $('budget-table').querySelector('tbody');
    tb.innerHTML = BUDGET_ROWS.map((r, i) => `
      <tr>
        <td><b>${OT.esc(r.name)}</b><br><span class="muted small">${OT.esc(r.note)}</span></td>
        ${r.f.map((v, j) => `<td class="num"><input type="number" data-row="${i}" data-f="${j}" value="${v}" style="width:90px; text-align:right;"></td>`).join('')}
        <td class="num bold" id="row-amt-${i}">–</td>
      </tr>`).join('');
    tb.addEventListener('input', renderBudget);
    $('budget-cont').addEventListener('input', renderBudget);
    $('budget-days').addEventListener('input', renderBenefit);
  }
  function rowAmount(r) {
    if (r.mode === 'lump') return r.f[0];
    if (r.mode === 'mul') return r.f[0] * r.f[1] * r.f[2];
    if (r.mode === 'mul2') return r.f[0] * r.f[1];
    if (r.mode === 'mul4') return r.f[0] * r.f[1] * r.f[2] * r.f[3];
    return 0;
  }
  function renderBudget() {
    document.querySelectorAll('#budget-table [data-row]').forEach((inp) => {
      BUDGET_ROWS[+inp.dataset.row].f[+inp.dataset.f] = parseFloat(inp.value) || 0;
    });
    let sub = 0;
    BUDGET_ROWS.forEach((r, i) => {
      const amt = rowAmount(r);
      sub += amt;
      $('row-amt-' + i).textContent = amt.toLocaleString('th-TH');
    });
    const contPct = parseFloat($('budget-cont').value) || 0;
    const cont = Math.round(sub * contPct / 100);
    const total = sub + cont;
    $('budget-sub').textContent = sub.toLocaleString('th-TH');
    $('budget-cont-amt').textContent = cont.toLocaleString('th-TH');
    $('budget-total').textContent = total.toLocaleString('th-TH') + ' บาท';
    renderBudget._total = total;
    renderBenefit();
  }
  function renderBenefit(st) {
    const s = OT.state;
    const total = renderBudget._total || 0;
    const days = parseFloat($('budget-days').value) || 60;
    if (!s) return;
    const m = s.ai.metrics;
    const elapsedH = Math.max(0.2, (s.ai.tSec - 7 * 3600) / 3600);
    const paxPerHour = m.paxServed / elapsedH;
    const benefitTrips = Math.round(paxPerHour * 14 * days); // 14 ชม.บริการ/วัน (06:00–22:00)
    $('cost-per-trip').textContent = benefitTrips > 0 ? (total / benefitTrips).toFixed(2) + ' ฿' : '–';
    $('benefit-trips').textContent = `ผู้โดยสารจำลอง ~${Math.round(paxPerHour)} คน/ชม. × 14 ชม./วัน × ${days} วัน = ${benefitTrips.toLocaleString('th-TH')} เที่ยวคน`;
    const saved = (s.comparison.avgWait.baseline || 0) - (s.comparison.avgWait.ai || 0);
    $('saved-min').textContent = (saved * paxPerHour).toFixed(0);
  }

  // ── Roadmap ──────────────────────────────────────────────────────────────
  function renderRoadmap(st) {
    const rm = st.roadmap;
    let totalGates = 0, doneGates = 0;
    const html = rm.phases.map((ph, pi) => {
      const done = ph.gates.filter((_, gi) => rm.done[`${pi}:${gi}`]).length;
      totalGates += ph.gates.length; doneGates += done;
      return `<div class="phase-row">
        <div class="flex spread">
          <h3>${OT.esc(ph.title)}</h3>
          <span class="chip ${done === ph.gates.length ? 'pass' : ''}"><span class="dot"></span>${done}/${ph.gates.length} เงื่อนไข</span>
        </div>
        <div class="progress-thin" style="margin:6px 0 10px;"><div style="width:${(done / ph.gates.length) * 100}%;"></div></div>
        ${ph.gates.map((g, gi) => `
          <label class="gate"><input type="checkbox" data-p="${pi}" data-g="${gi}" ${rm.done[`${pi}:${gi}`] ? 'checked' : ''}><span>${OT.esc(g)}</span></label>`).join('')}
      </div>`;
    }).join('');
    $('roadmap').innerHTML = `<div class="flex spread mb-sm"><b>ความคืบหน้ารวม</b><span class="chip ${doneGates === totalGates ? 'pass' : ''}"><span class="dot"></span>${doneGates}/${totalGates} เกณฑ์ผ่านด่าน</span></div>` + html;
    $('roadmap').querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
      OT.post('/api/roadmap', { phaseIdx: +c.dataset.p, gateIdx: +c.dataset.g, done: c.checked });
    }));
  }

  function renderKill(st) {
    const on = st.killSwitch && st.killSwitch.on;
    $('kill-banner').hidden = false;
    $('kill-on').disabled = on;
    $('kill-off').disabled = !on;
    $('killswitch-state').innerHTML = on
      ? '<span class="chip fail"><span class="dot"></span>Kill Switch: เปิดอยู่</span>'
      : '<span class="chip pass"><span class="dot"></span>Kill Switch: ปกติ</span>';
    if (on && !$('kill-reason').value) $('kill-reason').value = st.killSwitch.reason || '';
  }
  $('kill-on').addEventListener('click', () => {
    const reason = $('kill-reason').value.trim() || 'พบเหตุที่ต้องหยุดตามเกณฑ์หยุดฉุกเฉิน';
    OT.post('/api/killswitch', { on: true, reason });
  });
  $('kill-off').addEventListener('click', () => OT.post('/api/killswitch', { on: false, reason: '' }));

  // ── Charter ──────────────────────────────────────────────────────────────
  const CHARTER_FIELDS = [
    ['owner', 'เจ้าภาพ/ผู้รับผิดชอบอนุมัติ'],
    ['operator', 'ผู้ประกอบการ/เส้นทาง/เอกสารอนุญาต'],
    ['surveyStops', 'จุดปล่อยรถและป้ายสำรวจ 3 จุด'],
    ['serviceScope', 'เวลาบริการ/เที่ยวขั้นต่ำ/กรอบปรับรอบที่ทำได้'],
    ['fleet', 'รถพร้อมจริง/คนขับ/เวลาพัก/รถสำรอง'],
    ['gpsRights', 'ผู้มีสิทธิให้ใช้ GPS และเงื่อนไขเผยแพร่'],
    ['budget', 'งบที่อนุมัติและสิ่งที่ไม่รวม'],
    ['incomeDeal', 'ข้อตกลงรายได้และภาระงาน'],
    ['nonSmart', 'ช่องทางผู้ไม่ใช้สมาร์ทโฟน/เวลาเจ้าหน้าที่'],
    ['pdpaController', 'ผู้ควบคุมข้อมูลส่วนบุคคลของโครงการ'],
    ['evaluator', 'ผู้ประเมิน/แผนสุ่ม/เกณฑ์ที่ยืนยันก่อนทดลอง'],
    ['emergency', 'ผู้รับเหตุฉุกเฉิน/ผู้สั่งหยุด/วิธีกลับแผนเดิม'],
    ['sustain', 'ผู้จ่ายและผู้ดูแลหลังนำร่อง'],
  ];
  function buildCharter(st) {
    const saved = st.charter || {};
    if (!$('charter-form').dataset.built) {
      $('charter-form').dataset.built = '1';
      $('charter-form').innerHTML = CHARTER_FIELDS.map(([key, label]) => `
        <div><label class="fld" for="ch-${key}">${OT.esc(label)}</label>
        <textarea id="ch-${key}" data-key="${key}" style="min-height:64px;">${OT.esc(saved[key] || '')}</textarea></div>`).join('');
    }
    $('charter-form').querySelectorAll('textarea').forEach((ta) => { if (saved[ta.dataset.key] && !ta.value) ta.value = saved[ta.dataset.key]; });
  }
  $('charter-save').addEventListener('click', async () => {
    const body = {};
    $('charter-form').querySelectorAll('textarea').forEach((ta) => { body[ta.dataset.key] = ta.value; });
    await OT.post('/api/charter', body);
    $('charter-save').textContent = ' บันทึกแล้ว';
    setTimeout(() => { $('charter-save').textContent = ' บันทึกลงระบบ'; }, 1600);
  });
  $('charter-download').addEventListener('click', () => {
    const s = OT.state;
    let md = '# แบบเริ่มโครงการหนึ่งหน้า — OmniTransit v5 (สายนำร่อง 1)\n\n';
    if (s && s.charter && s.charter.savedAt) md += `_บันทึกเมื่อ: ${new Date(s.charter.savedAt).toLocaleString('th-TH')}_\n\n`;
    for (const [key, label] of CHARTER_FIELDS) {
      const v = ($( 'ch-' + key) || {}).value || s?.charter?.[key] || '';
      md += `**${label}:** ${v || '................................'}\n\n`;
    }
    md += '---\n_สร้างจากระบบสาธิต OmniTransit v5 — ตัวเลขงบเป็นประมาณการ ต้องตรวจเอกสารจริงก่อนใช้_\n';
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'omnitransit-project-charter.md';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('charter-print').addEventListener('click', () => window.print());

  // ──  รายงานสรุปผู้บริหารฝั่งกำกับโครงการ (พิมพ์/Save as PDF) ────────────
  $('btn-report').addEventListener('click', () => {
    const st = OT.state;
    if (!st) return;
    const total = renderBudget._total || 0;
    const days = parseFloat($('budget-days').value) || 60;
    const s = OT.state;
    const elapsedH = Math.max(0.2, (s.ai.tSec - 7 * 3600) / 3600);
    const paxPerHour = s.ai.metrics.paxServed / elapsedH;
    const benefitTrips = Math.round(paxPerHour * 14 * days);
    let totalGates = 0, doneGates = 0;
    const roadmapRows = st.roadmap.phases.map((ph, pi) => {
      const done = ph.gates.filter((_, gi) => st.roadmap.done[`${pi}:${gi}`]).length;
      totalGates += ph.gates.length; doneGates += done;
      return `<tr><td>${OT.esc(ph.title)}</td><td class="r">${done}/${ph.gates.length}</td><td>${done === ph.gates.length ? '✓ ผ่านด่าน' : 'อยู่ระหว่างดำเนินการ'}</td></tr>`;
    }).join('');
    const budgetRows = BUDGET_ROWS.map((r, i) => `<tr><td>${OT.esc(r.name)}</td><td class="r">${rowAmount(r).toLocaleString('th-TH')}</td></tr>`).join('');
    const charterRows = CHARTER_FIELDS.map(([key, label]) => {
      const el = $('ch-' + key);
      return `<tr><td>${OT.esc(label)}</td><td>${OT.esc(el && el.value ? el.value : (st.charter && st.charter[key]) || '................................')}</td></tr>`;
    }).join('');
    const rep = document.createElement('div');
    rep.id = 'ot-report';
    rep.innerHTML = `
      <h1>รายงานกำกับโครงการ — OmniTransit v5</h1>
      <div class="meta">แผน 16 สัปดาห์ · งบประมาณ · Kill Switch · Charter | เวลาจำลอง ${st.ai.clock} น. · พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')} · ระบบจำลองเพื่อการสาธิต</div>

      <h2>1) สถานะเกณฑ์ผ่านด่าน (Stage Gates) 16 สัปดาห์</h2>
      <table><tr><th>ช่วง</th><th>เงื่อนไขผ่าน</th><th>สถานะ</th></tr>${roadmapRows}</table>
      <p><b>รวม: ${doneGates}/${totalGates} เกณฑ์</b> · Kill Switch: ${st.killSwitch && st.killSwitch.on ? ` เปิดอยู่ — ${OT.esc(st.killSwitch.reason)}` : 'ปกติ (ยังไม่เปิด)'}</p>

      <h2>2) งบประมาณ (ประมาณการ — ต้องสืบราคาจริงก่อนตั้งงบ)</h2>
      <table><tr><th>รายการ</th><th class="r">เป็นเงิน (บาท)</th></tr>${budgetRows}
      <tr><td><b>รวมทั้งสิ้น (รวมเผื่อ ${$('budget-cont').value}%)</b></td><td class="r"><b>${total.toLocaleString('th-TH')}</b></td></tr></table>
      <p><b>ต้นทุนต่อการเดินทางที่ได้รับประโยชน์:</b> ${benefitTrips > 0 ? (total / benefitTrips).toFixed(2) : '–'} บาท/เที่ยวคน
      (ผู้โดยสารจำลอง ~${Math.round(paxPerHour)} คน/ชม. × 14 ชม./วัน × ${days} วัน = ${benefitTrips.toLocaleString('th-TH')} เที่ยวคน) ·
      <b>เวลารอที่ประหยัดได้</b> (รายงานแยกจากเงิน): ${(((s.comparison.avgWait.baseline || 0) - (s.comparison.avgWait.ai || 0)) * paxPerHour).toFixed(0)} นาทีรอ/ชม.จำลอง — เวลาที่ผู้โดยสารประหยัดไม่ใช่เงินสด ต้องระบุผู้จ่ายต่อเนื่องให้ชัด</p>

      <h2>3) แบบเริ่มโครงการหนึ่งหน้า (1-Page Project Charter)</h2>
      <table><tr><th style="width:38%;">รายการ</th><th>ข้อมูล</th></tr>${charterRows}</table>

      <div class="note"><b>ที่มากรอบงบ:</b> พิมพ์เขียว OmniTransit v5 บทที่ 13 (รวม 846,400 บาท ก่อนปรับค่า) — ไม่รวมรถใหม่ ค่าเดินรถประจำเดิม เซ็นเซอร์ใหม่ งานโยธา เงินอุดหนุนค่าโดยสาร · <b>เกณฑ์หยุด:</b> หยุดคำแนะนำทันทีเมื่อฝ่าฝืนเงื่อนไขบริการ/อันตราย/กีดกันผู้โดยสาร/ข้อมูลรั่ว — การหยุดซอฟต์แวร์ไม่ใช่การหยุดรถทั้งสาย</div>
      <div class="meta">OmniTransit v5 — ศูนย์ dependency · "ผู้ควบคุมข้อมูลส่วนบุคคล" ≠ "เจ้าของข้อมูลส่วนบุคคล" — แยกบทบาทสองคำนี้ในเอกสารจริง</div>`;
    document.body.appendChild(rep);
    document.body.classList.add('report-mode');
    const cleanup = () => { rep.remove(); document.body.classList.remove('report-mode'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 80);
  });

  buildBudget();
  renderBudget();
  OT.onState((st) => {
    renderRoadmap(st);
    renderKill(st);
    buildCharter(st);
  });
})();
