'use strict';
/* OmniTransit v5 — kpi.js (สรุปผลโครงการ: ตัวเลขใหญ่ โมเดล AI ความเป็นธรรม 7 กลุ่ม ร้องเรียน) */
(function () {
  const $ = (id) => document.getElementById(id);

  function deltaLine(c, target, lowerBetter = true) {
    if (c.deltaPct == null) return '<span class="delta flat">ยังสรุปไม่ได้ (ตัวอย่างน้อย)</span>';
    const good = lowerBetter ? c.deltaPct <= target : c.deltaPct <= target;
    const arrow = c.deltaPct < 0 ? 'ลดลง ' : c.deltaPct > 0 ? 'เพิ่มขึ้น ' : 'เท่าเดิม ';
    return `<span class="delta ${good ? 'good' : 'bad'}">${arrow}${Math.abs(c.deltaPct)}% เทียบก่อนทดลอง · เป้า ${target > 0 ? '+' : ''}${target}% ${good ? 'ผ่าน' : 'ยังไม่ผ่าน'}</span>`;
  }

  function renderKPI(st) {
    const c = st.comparison;
    $('overall-chip').innerHTML = c.pass
      ? `${OT.icon('check')} ผ่านเป้าหมายโครงการครบทุกตัว`
      : `${OT.icon('info')} ยังไม่ผ่านครบทุกเป้า — รายงานตามจริง`;
    $('overall-chip').className = 'chip ' + (c.pass ? 'pass' : 'warn');

    $('k-avgwait').innerHTML = `${c.avgWait.ai ?? '–'} <small>นาที</small>`;
    $('k-avgwait-d').innerHTML = deltaLine(c.avgWait, -10);
    $('k-p90').innerHTML = `${c.p90Wait.ai ?? '–'} <small>นาที</small>`;
    $('k-p90-d').innerHTML = deltaLine(c.p90Wait, 0);

    $('k-passup').innerHTML = `${((c.passUpRate.ai || 0) * 100).toFixed(1)}<small>%</small>`;
    $('k-passup-d').innerHTML = deltaLine(c.passUpRate, -15);

    $('k-cv').textContent = c.headwayCV.ai == null ? '–' : c.headwayCV.ai;
    $('k-cv-d').innerHTML = c.headwayCV.ai == null ? '<span class="delta flat">รอเที่ยวออกเพียงพอ</span>' : deltaLine(c.headwayCV, -10);

    $('k-secondary').innerHTML = `
      <span class="chip">${OT.icon('bus')} เที่ยวที่ออกบริการ: ก่อน ${c.tripsDeparted.baseline} / หลัง ${c.tripsDeparted.ai} — ระบบไม่มีกลไกตัดเที่ยว</span>
      <span class="chip">${OT.icon('users')} ผู้โดยสารรับ-ส่ง: ก่อน ${c.paxServed.baseline} / หลัง ${c.paxServed.ai} คน (demand ชุดเดียวกัน)</span>`;
  }

  function renderDumbbell(st) {
    const box = $('dumbbell-box');
    const byStopA = st.ai.metrics.byStop, byStopB = st.baseline.metrics.byStop;
    const ids = Object.keys(byStopB).filter((id) => byStopA[id]).slice(0, 9);
    if (!ids.length) { box.innerHTML = '<p class="muted small">ยังไม่มีข้อมูลเพียงพอ — รอเวลาจำลองเดินหน้าสักครู่</p>'; return; }
    const maxV = Math.max(...ids.flatMap((id) => [byStopB[id].avgMin, byStopA[id].avgMin])) * 1.15;
    box.innerHTML = ids.map((id) => {
      const b = byStopB[id].avgMin, a = byStopA[id].avgMin;
      const lo = Math.min(b, a), hi = Math.max(b, a);
      const P = (v) => (v / maxV) * 100;
      const good = a <= b;
      return `<div class="dumbbell-row">
        <span style="font-size:0.76rem;">${OT.esc(st.route.stopCoords.find((s) => s.id === id)?.name || id)}</span>
        <div class="dumbbell-track">
          <div class="dumbbell-line" style="left:${P(lo)}%; width:${Math.max(1.5, P(hi) - P(lo))}%;"></div>
          <div class="dumbbell-dot" style="left:calc(${P(b)}% - 6px); background:var(--warn-fill);" title="ก่อนทดลอง ${b} นาที"></div>
          <div class="dumbbell-dot" style="left:calc(${P(a)}% - 6px); background:var(--accent);" title="หลังทดลอง ${a} นาที"></div>
        </div>
        <span class="num small" style="color:${good ? 'var(--ok)' : 'var(--crit)'}; font-weight:600;">${b}  ${a}</span>
      </div>`;
    }).join('');
  }

  // ── โมเดล AI (กระชับ) ────────────────────────────────────────────────────
  const RELEASE_TH = {
    shadow: 'โหมดทดสอบเงียบ — หน้าจอสาธารณะยังใช้วิธีง่าย',
    live: 'อนุมัติใช้โมเดล AI แล้ว (ย้อนกลับได้ทุกเมื่อ)',
    rolled_back: 'ย้อนกลับแล้ว — ใช้วิธีง่ายเหมือนเดิม',
  };
  $('btn-shadow').addEventListener('click', () => OT.post('/api/model', { action: 'shadow' }).then((r) => { if (!r.ok) alert(r.error); }));
  $('btn-approve').addEventListener('click', () => OT.post('/api/model', { action: 'approve' }).then((r) => { if (!r.ok) alert(r.error); }));
  $('btn-rollback').addEventListener('click', () => OT.post('/api/model', { action: 'rollback' }).then((r) => { if (!r.ok) alert(r.error); }));

  function renderAI(st) {
    const eta = st.ai.metrics.eta;
    const t = eta.maeByPhase.test || {};
    const hist = t.hist, ai = t.ai;
    let improve = hist > 0 && ai != null ? +(((hist - ai) / hist) * 100).toFixed(1) : null;
    const maeOk = improve !== null && improve >= 10;
    const enough = (eta.samples.hist || 0) >= 20;
    const gate = maeOk && enough;
    const row = (label, ok, detail) => `
      <div class="gate">
        <span class="chip ${ok == null ? '' : ok ? 'pass' : 'fail'}"><span class="ico-dot"></span>${ok == null ? 'รอข้อมูล' : ok ? 'ผ่าน' : 'ยังไม่ผ่าน'}</span>
        <div class="small"><b>${label}</b><br><span class="muted">${detail}</span></div>
      </div>`;
    $('ai-gate').innerHTML = `
      ${row('MAE ดีขึ้นอย่างน้อย 10% (เฟสทดสอบ)', maeOk === null ? null : maeOk,
        improve === null ? 'ยังไม่มีตัวอย่างเฟสทดสอบ — ปล่อยเวลาจำลองเดินหน้าต่อ' : `วิธีง่าย ${hist} นาที · AI ${ai} นาที  ดีขึ้น ${improve}%`)}
      ${row('ตัวอย่างเพียงพอ (อย่างน้อย 20 เหตุการณ์)', enough, `วัดแล้ว ${eta.samples.hist} เหตุการณ์`)}
      <div class="gate"><span class="chip ${gate ? 'pass' : 'fail'}"><span class="ico-dot"></span>${gate ? 'พร้อมอนุมัติ' : 'ยังไม่ผ่านเกณฑ์'}</span>
      <div class="small"><b>สถานะปัจจุบัน</b><br><span class="muted">${OT.esc(RELEASE_TH[st.modelRelease] || st.modelRelease)}</span></div></div>`;
    const c = st.ai.metrics.crowd;
    $('f1-value').textContent = c.macroF1.toFixed(2);
    $('f1-meter').style.width = Math.min(100, c.macroF1 * 100) + '%';
    $('f1-meter').style.background = c.macroF1 >= 0.85 ? 'var(--ok-fill)' : 'var(--warn-fill)';
    $('serious-value').textContent = (c.seriousRate * 100).toFixed(2) + '%';
    $('serious-ci').innerHTML = `ขอบบน 95% CI ${(c.seriousHi95 * 100).toFixed(2)}% (ตัวอย่าง ${c.n})`;
    $('unknown-value').textContent = (c.unknownRate * 100).toFixed(1) + '%';
    // สมการที่ 1+3: ความแม่นของการไหลสะสมรายป้าย
    const pr = st.ai.metrics.prop || { n: 0, mae: null, withinSigma: null };
    $('prop-mae').innerHTML = pr.mae == null ? '–' : `${pr.mae} <small>คน</small>`;
    $('prop-mae-d').textContent = pr.n ? `จากการเทียบ ${pr.n} เหตุการณ์ (ยิ่งต่ำยิ่งแม่น)` : 'ยังไม่มีตัวอย่าง — รอรถถึงป้ายสักครู่';
    $('prop-sig').textContent = pr.withinSigma == null ? '–' : (pr.withinSigma * 100).toFixed(0) + '%';
    $('prop-n').textContent = pr.n || '–';
  }

  // ── 7 กลุ่ม ──────────────────────────────────────────────────────────────
  function renderFairness(st) {
    const m = st.ai.metrics, c = st.comparison;
    const passUpRate = ((m.passUpRate || 0) * 100).toFixed(1);
    const restBad = st.ai.buses.filter((b) => b.layoverActive && b.layoverSec != null && b.layoverSec < 359).length;
    const driveBad = st.ai.buses.filter((b) => b.driveMin > 480).length;
    const rows = [
      ['คนไม่มีสมาร์ทโฟน', 'ขึ้นได้ตามปกติ ไม่ต้องสมัครหรือจอง มีป้ายตัวใหญ่ เสียงประกาศ และตารางพิมพ์',
        `ป้ายประกาศและตารางพิมพ์ใช้ได้ตลอด${st.degraded ? ' — ตอนนี้ระบบสลับไปตารางให้อัตโนมัติแล้ว' : ' แม้ข้อมูลสดขาดช่วง'}`, true],
      ['คนกลางทาง', 'ไม่มีการกั๊กที่หรือจองที่นั่น แก้ด้วยรอบรถและกำลังบริการจริง',
        `อัตราขึ้นไม่ได้ 1 ชม.ล่าสุด <b>${passUpRate}%</b> · ป้ายวิกฤต S08 ถูกเน้นเป็นจุดสำรวจ`, (m.passUpRate || 0) < 0.12],
      ['ผู้สูงอายุ/คนพิการ', 'ตัวอักษรใหญ่ได้ 3 ระดับ สี+รูปทรง+ข้อความพร้อมกัน มีเสียงประกาศไทย',
        'ทุกหน้ารองรับการเข้าถึง · มีรถ EV พื้นต่ำ 3 คันในกองรถ (ระบุตามจริง)', true],
      ['นักเรียน/คนมีเวลานัด', 'ไม่รับประกันให้ทันเวลา แต่บอก "ช่วงคาดการณ์" ตามความจริง',
        `P90 เวลารอ ${c.p90Wait.ai ?? '–'} นาที (ก่อนทดลอง ${c.p90Wait.baseline ?? '–'})`, c.p90Wait.deltaPct == null || c.p90Wait.deltaPct <= 0],
      ['คนขับ/พนักงาน', 'ไม่ลงโทษจากคะแนน AI ไม่เพิ่มชั่วโมงเกินแผน เวลาพักถูกบังคับในระบบ',
        `ละเมิดเวลาพัก <b>${restBad}</b> คัน · ละเมิดชั่วโมงขับ <b>${driveBad}</b> คัน · แสดงรหัสผู้ขับเท่านั้น`, restBad === 0 && driveBad === 0],
      ['ผู้ประกอบการรายเล็ก', 'ไม่บังคับซื้ออุปกรณ์ผู้ขายเดียว ส่งข้อมูลได้ทั้งเซ็นเซอร์และผู้สำรวจ',
        'หน้าผู้สำรวจบันทึกด้วยมือแทนเซ็นเซอร์ได้ทุกคัน', true],
      ['ผู้โดยสารสายอื่น', 'ไม่ดึงรถจากเส้นทางอื่น นำร่องเฉพาะสายเดียวด้วยรถของสายตัวเอง',
        'กองรถ 10 คันลงทะเบียนกับสายนำร่อง 1 เท่านั้น', true],
    ];
    $('fairness-table').querySelector('tbody').innerHTML = rows.map(([g, rule, check, ok]) => `
      <tr><td><b>${g}</b></td><td class="small">${rule}</td><td class="small">${check}</td>
      <td><span class="tag ${ok ? 'run' : 'warn'}"><span class="ico-dot"></span>${ok ? 'ตรวจแล้วโอเค' : 'ต้องติดตาม'}</span></td></tr>`).join('');
  }

  // ── ร้องเรียน ────────────────────────────────────────────────────────────
  const CAT_TH = { service: 'รถไม่มาตามรอบ', crowding: 'ขึ้นรถไม่ได้', data: 'ข้อมูลไม่ตรงจริง', accessibility: 'การเข้าถึง', emergency: 'ฉุกเฉินความปลอดภัย', other: 'อื่น ๆ' };
  const STATUS_TH = { received: 'รับเรื่องแล้ว', acked: 'เจ้าหน้าที่รับทราบ', progress: 'กำลังดำเนินการ', resolved: 'แล้วเสร็จ' };
  $('cmp-submit').addEventListener('click', async () => {
    const body = { category: $('cmp-cat').value, channel: $('cmp-channel').value, message: $('cmp-msg').value.trim(), contact: $('cmp-contact').value.trim() };
    if (!body.message) { $('cmp-result').innerHTML = `<div class="banner warn">${OT.icon('info')}<div>กรุณาพิมพ์รายละเอียดก่อนส่ง</div></div>`; return; }
    const c = await OT.post('/api/complaints', body);
    $('cmp-msg').value = ''; $('cmp-contact').value = '';
    $('cmp-result').innerHTML = `
      <div class="banner ${c.emergency ? 'crit' : 'ok'}">${OT.icon(c.emergency ? 'alert' : 'check')}
      <div><b>รับเรื่องแล้ว เลขรับเรื่อง ${c.id}</b><br>
      ${c.emergency ? 'เหตุฉุกเฉิน: ส่งต่อหัวหน้าปฏิบัติการทันที (ภายใน 4 ชั่วโมง)' : 'เจ้าหน้าที่จะรับทราบภายใน 1 วันทำการ และแจ้งความคืบหน้าภายใน 7 วันทำการ'}
      <br><span class="small">บันทึกเลขนี้ไว้ตรวจสถานะได้ โดยไม่ต้องมีบัญชี</span></div></div>`;
  });

  function renderComplaints(st) {
    const list = st.complaints || [];
    $('cmp-list').innerHTML = list.length ? list.map((c) => {
      const cls = c.status === 'resolved' ? 'run' : c.emergency ? 'bad' : 'warn';
      // แถบ SLA จริง: สัดส่วนเวลาที่ผ่านไปจนถึงกำหนดรับทราบ (นาฬิกาจริง ไม่ใช่เวลาจำลอง)
      const created = new Date(c.createdAt).getTime(), ackT = new Date(c.ackDue).getTime();
      const now = Date.now();
      const pct = Math.max(2, Math.min(100, ((now - created) / Math.max(1, ackT - created)) * 100));
      const hrsLeft = Math.max(0, (ackT - now) / 3600e3);
      const slaLeft = c.status === 'received'
        ? (hrsLeft >= 48 ? `เหลือ ${(hrsLeft / 24).toFixed(1)} วัน` : `เหลือ ${hrsLeft.toFixed(1)} ชม.`)
        : 'รับทราบแล้วตามกำหนด';
      const slaColor = c.status !== 'received' ? 'var(--ok-fill)' : pct > 80 ? 'var(--crit-fill)' : pct > 45 ? 'var(--warn-fill)' : 'var(--ok-fill)';
      return `<div class="phase-row" style="margin-bottom:10px;">
        <div class="flex spread">
          <b>${c.id}</b>
          <span class="tag ${cls}"><span class="ico-dot"></span>${STATUS_TH[c.status] || c.status}${c.emergency ? ' · ฉุกเฉิน' : ''}</span>
        </div>
        <div class="small mt">${OT.esc(c.message).slice(0, 150)}${c.message.length > 150 ? '…' : ''}</div>
        <div class="small muted mt">หมวด ${CAT_TH[c.category] || c.category} · ${c.channel} · กำหนดรับทราบ ${new Date(c.ackDue).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</div>
        <div class="sla-bar" role="img" aria-label="SLA ${slaLeft}"><div style="width:${c.status === 'received' ? pct : 100}%; background:${slaColor};"></div></div>
        <div class="small muted" style="margin-top:3px;">SLA: ${slaLeft}</div>
        <div class="flex mt">
          <button class="btn small" data-cid="${c.id}" data-act="ack">รับทราบ</button>
          <button class="btn small" data-cid="${c.id}" data-act="progress">แจ้งคืบหน้า</button>
          <button class="btn small" data-cid="${c.id}" data-act="resolve">ปิดเรื่อง</button>
        </div>
      </div>`;
    }).join('') : '<p class="muted small">ยังไม่มีเรื่องร้องเรียน</p>';
    $('cmp-list').querySelectorAll('[data-cid]').forEach((b) => b.addEventListener('click', () => {
      OT.post('/api/complaints/update', { id: b.dataset.cid, action: b.dataset.act });
    }));
  }

  // ── เครื่องคำนวณจำนวนรถขั้นต่ำ ───────────────────────────────────────────
  function calc() {
    const cycle = parseFloat($('calc-cycle').value) || 76;
    const headway = Math.max(3, parseFloat($('calc-headway').value) || 8);
    const n = Math.ceil(cycle / headway);
    $('calc-result').innerHTML = `
      <span class="chip pass">${OT.icon('check')} ต้องมีรถขั้นต่ำ ${n} คัน</span>
      <span class="chip">ปัดขึ้น(${cycle} ÷ ${headway})</span>
      <span class="chip">ระยะห่างทฤษฎีที่ทำได้จริง ${(cycle / n).toFixed(1)} นาที</span>`;
  }
  $('calc-btn').addEventListener('click', calc);

  // ── รายงานสรุป (พิมพ์/PDF) ───────────────────────────────────────────────
  $('btn-report').addEventListener('click', () => {
    const st = OT.state;
    if (!st) return;
    const c = st.comparison, m = st.ai.metrics, mb = st.baseline.metrics;
    const sign = (v) => (v == null ? '–' : (v > 0 ? '+' : '') + v + '%');
    const judge = (delta, target) => delta == null ? 'ยังสรุปไม่ได้' : (delta <= target ? 'ผ่านเป้า' : 'ยังไม่ผ่าน (เป้า ' + target + '%)');
    const byStopRows = Object.keys(mb.byStop).filter((id) => m.byStop[id])
      .map((id) => `<tr><td>${OT.esc(st.route.stopCoords.find((s) => s.id === id)?.name || id)}</td><td class="r">${mb.byStop[id].avgMin}</td><td class="r">${m.byStop[id].avgMin}</td><td class="r">${(m.byStop[id].avgMin - mb.byStop[id].avgMin).toFixed(2)}</td></tr>`).join('');
    const fairnessRows = [...document.querySelectorAll('#fairness-table tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')];
      return `<tr><td>${cells[0]?.textContent || ''}</td><td>${cells[2]?.textContent || ''}</td><td>${cells[3]?.textContent || ''}</td></tr>`;
    }).join('');
    const testMae = m.eta.maeByPhase.test || {};
    const rep = document.createElement('div');
    rep.id = 'ot-report';
    rep.innerHTML = `
      <h1>รายงานสรุปผู้บริหาร — OmniTransit v5</h1>
      <div class="meta">สายนำร่อง 1: จตุจักร ↔ หัวลำโพง · เวลาจำลอง ${st.ai.clock} น. · พิมพ์ ${new Date().toLocaleString('th-TH')} · ระบบจำลองเพื่อการสาธิต</div>
      <h2>1) ผลเทียบเป้าหมายโครงการ</h2>
      <table>
        <tr><th>ตัวชี้วัด</th><th>ก่อนทดลอง</th><th>หลังทดลอง</th><th>เปลี่ยนแปลง</th><th>ผลเทียบเป้า</th></tr>
        <tr><td>เวลารอเฉลี่ย (นาที)</td><td class="r">${c.avgWait.baseline}</td><td class="r">${c.avgWait.ai}</td><td class="r">${sign(c.avgWait.deltaPct)}</td><td>${judge(c.avgWait.deltaPct, -10)}</td></tr>
        <tr><td>เวลารอ P90 (นาที)</td><td class="r">${c.p90Wait.baseline}</td><td class="r">${c.p90Wait.ai}</td><td class="r">${sign(c.p90Wait.deltaPct)}</td><td>${judge(c.p90Wait.deltaPct, 0)}</td></tr>
        <tr><td>อัตราขึ้นรถไม่ได้</td><td class="r">${(c.passUpRate.baseline * 100).toFixed(1)}%</td><td class="r">${(c.passUpRate.ai * 100).toFixed(1)}%</td><td class="r">${sign(c.passUpRate.deltaPct)}</td><td>${judge(c.passUpRate.deltaPct, -15)}</td></tr>
        <tr><td>ความสม่ำเสมอรอบรถ (CV)</td><td class="r">${c.headwayCV.baseline ?? '–'}</td><td class="r">${c.headwayCV.ai ?? '–'}</td><td class="r">${sign(c.headwayCV.deltaPct)}</td><td>ยิ่งต่ำยิ่งสม่ำเสมอ</td></tr>
      </table>
      <h2>2) เวลารอรายป้าย (นาที)</h2>
      <table><tr><th>ป้าย</th><th>ก่อนทดลอง</th><th>หลังทดลอง</th><th>ต่าง</th></tr>${byStopRows}</table>
      <h2>3) ความแม่นของระบบ</h2>
      <table>
        <tr><th>รายการ</th><th>วิธีง่าย</th><th>โมเดล AI</th><th>หมายเหตุ</th></tr>
        <tr><td>MAE เวลาถึง (นาที)</td><td class="r">${testMae.hist ?? '–'}</td><td class="r">${testMae.ai ?? '–'}</td><td>${st.modelRelease === 'live' ? 'AI อนุมัติแล้ว' : 'ยังไม่อนุมัติ (เกณฑ์ดีขึ้น 10%)'}</td></tr>
        <tr><td>MAE พยากรณ์คนบนรถล่วงหน้า (คน)</td><td colspan="2" class="r">${m.prop && m.prop.mae != null ? m.prop.mae + ' (± sigma ครอบคลุม ' + (m.prop.withinSigma * 100).toFixed(0) + '%)' : 'ยังสรุปไม่ได้'}</td><td>สมการไหลสะสมรายป้าย · ตัวอย่าง ${m.prop ? m.prop.n : 0} เหตุการณ์</td></tr>
        <tr><td>Macro-F1 ระดับความแน่น</td><td colspan="2" class="r">${m.crowd.macroF1}</td><td>ตัวอย่าง ${m.crowd.n} ครั้ง</td></tr>
        <tr><td>ข้อผิดร้ายแรง / ตอบไม่ทราบ</td><td colspan="2" class="r">${(m.crowd.seriousRate * 100).toFixed(2)}% / ${(m.crowd.unknownRate * 100).toFixed(1)}%</td><td>CI ขอบบน ${(m.crowd.seriousHi95 * 100).toFixed(2)}%</td></tr>
      </table>
      <h2>4) ผลกระทบ 7 กลุ่มผู้เกี่ยวข้อง</h2>
      <table><tr><th>กลุ่ม</th><th>ตรวจจากข้อมูลสด</th><th>สถานะ</th></tr>${fairnessRows}</table>
      <div class="note"><b>วิธีการ:</b> สองสภาพแวดล้อมจำลองวิ่งคู่กันด้วย demand ชุดเดียวกัน ต่างกันเฉพาะนโยบายจัดรอบ · <b>ข้อจำกัด:</b> ตัวอย่างน้อย = รายงานว่ายังสรุปไม่ได้ ห้ามประกาศความสำเร็จจากค่าเฉลี่ยเดียว</div>
      <div class="meta">แผนที่ © OpenStreetMap contributors · ไม่มีกล้อง/พิกัดผู้โดยสาร/ชื่อจริงคนขับ · OmniTransit v5 ศูนย์ dependency</div>`;
    document.body.appendChild(rep);
    document.body.classList.add('report-mode');
    const cleanup = () => { rep.remove(); document.body.classList.remove('report-mode'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 80);
  });

  OT.onState((st) => {
    renderKPI(st);
    renderDumbbell(st);
    renderAI(st);
    renderFairness(st);
    renderComplaints(st);
  });
  calc();
})();
