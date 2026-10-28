'use strict';
/* OmniTransit v5 — aieval.js (ห้องทดสอบโมเดล AI: shadow / approve / rollback) */
(function () {
  const $ = (id) => document.getElementById(id);
  const PHASE_TH = { train: 'ฝึก (train)', tune: 'ปรับค่า (tune)', test: 'ทดสอบ (test)' };
  const RELEASE_TH = {
    shadow: ' Shadow Mode — AI ทดสอบเงียบ ยังไม่แสดงต่อสาธารณะ (หน้าจอแสดงค่าจากวิธีง่าย)',
    live: ' Live — อนุมัติใช้โมเดล AI แล้ว (รุ่นที่ระบุได้ ย้อนกลับได้ทุกเมื่อ)',
    rolled_back: '↩ ย้อนกลับแล้ว — ใช้วิธีง่าย (Baseline) เหมือนเดิม',
  };

  $('btn-shadow').addEventListener('click', () => setRelease('shadow'));
  $('btn-approve').addEventListener('click', () => setRelease('approve'));
  $('btn-rollback').addEventListener('click', () => setRelease('rollback'));
  document.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', async () => {
    await OT.post('/api/control', { action: 'phase', value: b.dataset.phase === 'auto' ? null : b.dataset.phase });
  }));

  async function setRelease(action) {
    const r = await OT.post('/api/model', { action });
    if (!r.ok) alert(r.error || 'ไม่สำเร็จ');
  }

  function renderGate(st) {
    const eta = st.ai.metrics.eta;
    const t = eta.maeByPhase.test || {};
    const hist = t.hist, ai = t.ai;
    let improve = null;
    if (hist > 0 && ai != null) improve = +(((hist - ai) / hist) * 100).toFixed(1);
    const intervalOk = st.modelRelease === 'live' ? true : (ai != null ? ai < 5 : false); // ช่วง AI ±~5 นาทีถือว่าใช้ตัดสินใจได้
    const maeOk = improve !== null && improve >= 10;
    const enoughSamples = (eta.samples.hist || 0) >= 20;
    const pass = maeOk && intervalOk && enoughSamples;
    const row = (label, ok, detail) => `
      <div class="gate">
        <span class="chip ${ok == null ? '' : ok ? 'pass' : 'fail'}"><span class="dot"></span>${ok == null ? 'รอข้อมูล' : ok ? 'ผ่าน' : 'ยังไม่ผ่าน'}</span>
        <div class="small"><b>${label}</b><br><span class="muted">${detail}</span></div>
      </div>`;
    $('gate-panel').innerHTML = `
      ${row('MAE ดีขึ้น ≥ 10% เทียบวิธีง่าย (เฟสทดสอบ)', maeOk === null ? null : maeOk,
        improve === null ? 'ยังไม่มีตัวอย่างในเฟสทดสอบ — ปล่อยเวลาจำลองเดินหน้าต่อ หรือกดเฟสทดสอบ' : `Baseline ${hist} นาที · AI ${ai} นาที  ดีขึ้น ${improve}%`)}
      ${row('ช่วงคาดการณ์ของ AI ไม่กว้างจนใช้ตัดสินใจไม่ได้', ai == null ? null : intervalOk,
        ai == null ? 'รอข้อมูล' : `MAE AI ${ai} นาที  ช่วงแสดงประมาณ ±${(ai * 1.4 + 0.7).toFixed(1)} นาทีรอบค่ากลาง`)}
      ${row('ตัวอย่างเพียงพอ (≥ 20 เหตุการณ์ที่วัดแล้ว)', enoughSamples, `วัดแล้ว ${eta.samples.hist} เหตุการณ์`)}
      <hr class="divider">
      <div class="flex">
        <span class="chip ${pass ? 'pass' : 'fail'}"><span class="dot"></span>${pass ? 'ผ่านเกณฑ์ครบ — พร้อมอนุมัติขึ้นใช้จริง' : 'ยังไม่ผ่านเกณฑ์ครบ — ระบบยังใช้วิธีง่ายต่อสาธารณะ'}</span>
      </div>`;
  }

  function renderMaeChart(st) {
    const m = st.ai.metrics.eta.maeByPhase;
    const groups = ['train', 'tune', 'test'].map((ph) => ({
      label: PHASE_TH[ph],
      values: [m[ph]?.hist ?? null, m[ph]?.ai ?? null],
    }));
    OTChart.groupedBar($('mae-chart'), {
      groups,
      series: [
        { name: 'วิธีง่าย (Baseline)', color: 'var(--series-2)' },
        { name: 'โมเดล AI', color: 'var(--series-1)' },
      ],
      unit: 'นาที',
      ariaLabel: 'MAE เวลาถึงแยกเฟสฝึก ปรับค่า ทดสอบ',
    });
  }

  function renderCrowd(st) {
    const c = st.ai.metrics.crowd;
    $('f1-value').textContent = c.macroF1.toFixed(2);
    $('f1-meter').style.width = Math.min(100, c.macroF1 * 100) + '%';
    $('f1-meter').style.background = c.macroF1 >= 0.85 ? 'var(--good)' : 'var(--warn)';
    $('serious-value').textContent = (c.seriousRate * 100).toFixed(2) + '%';
    $('serious-ci').innerHTML = `ขอบบน 95% CI: <b>${(c.seriousHi95 * 100).toFixed(2)}%</b> ${c.seriousHi95 < 0.03 ? '— ต่ำกว่าเกณฑ์ 3%' : '— ยังเกินเกณฑ์ 3%'} (ตัวอย่าง ${c.n} ครั้ง)`;
    $('unknown-value').textContent = (c.unknownRate * 100).toFixed(1) + '%';
    const L = [' มีที่นั่งบางส่วน', ' มีผู้ยืน', ' หนาแน่น'];
    $('confusion-box').innerHTML = `
      <table class="data">
        <thead><tr><th>ทำนาย \\ จริง</th>${L.map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${c.confusion.map((row, i) => `<tr><td><b>${L[i]}</b></td>${row.map((v, j) =>
          `<td class="conf-cell ${i === j ? 'conf-diag' : v > 0 ? 'conf-off' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  }

  function renderRelease(st) {
    $('release-value').innerHTML = `<span style="font-size:1.05rem;">${RELEASE_TH[st.modelRelease] || st.modelRelease}</span>`;
    $('phase-chip').textContent = 'เฟส: ' + (PHASE_TH[st.phase] || st.phase);
    $('samples-value').innerHTML = `${st.ai.metrics.eta.samples.hist || 0} <span style="font-size:1rem;">เหตุการณ์</span>`;
    $('release-log').innerHTML = (st.releaseHistory || []).slice().reverse().map((h) =>
      `<li><time>${h.tSim}</time><span><b>${OT.esc(h.action)}</b>  ${OT.esc(h.release)}<br><span class="muted small">${OT.esc(h.note || '')}</span></span></li>`).join('') ||
      '<li><span class="muted">ยังไม่มีการเปลี่ยนรุ่น — เริ่มจาก Shadow Mode</span></li>';
  }

  OT.onState((st) => {
    renderRelease(st);
    renderGate(st);
    renderMaeChart(st);
    renderCrowd(st);
  });
})();
