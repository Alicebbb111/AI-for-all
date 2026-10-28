'use strict';
/* OmniTransit v5 — kiosk.js (ป้ายประจำจุดจอด: ตัวใหญ่ + เสียงประกาศไทย + ตารางพิมพ์) */
(function () {
  const params = new URLSearchParams(location.search);
  let stopId = params.get('stop') || localStorage.getItem('ot-stop') || 'S08';
  // (Multi-route) ถ้าป้ายที่จำไว้ไม่อยู่ในสายที่กำลังจำลอง → ใช้ป้ายสำคัญแรกของสายนั้นแทน
  OT.onState((st) => {
    const ids = new Set((st.route?.stopCoords || []).map((s) => s.id));
    if (!ids.has(stopId)) {
      const pref = (st.route?.stopCoords || []).find((s) => s.survey === 'critical') || st.route?.stopCoords?.[0];
      if (pref) stopId = pref.id;
    }
  });
  let timetable = null;

  fetch('/api/timetable').then((r) => r.json()).then((t) => { timetable = t; renderPrintTable(); }).catch(() => {});

  function stopMeta(st, id) { return st.route.stopCoords.find((s) => s.id === id); }

  function etaFor(st, bus) {
    if (bus.state === 'terminal' || bus.state === 'out') return null;
    const stopS = st.route.stopS[stopId];
    const dist = bus.dir === 1 ? stopS - bus.s : bus.s - stopS;
    if (dist <= 5) return null;
    const kmh = Math.max(6, bus.speedKmh || 15);
    let eta = (dist / 1000) / kmh * 3600;
    let between = 0;
    for (const sc of st.route.stopCoords) {
      const sStop = st.route.stopS[sc.id];
      const d = bus.dir === 1 ? sStop - bus.s : bus.s - sStop;
      if (d > 5 && ((bus.dir === 1 && sStop < stopS) || (bus.dir === -1 && sStop > stopS))) between++;
    }
    eta += between * 25;
    return { low: Math.max(0, Math.round(eta - (eta * 0.18 + 45))), high: Math.round(eta + (eta * 0.32 + 90)) };
  }

  function dirBox(st, dir) {
    const wrap = document.getElementById(dir === 1 ? 'kiosk-fwd' : 'kiosk-rev');
    const degraded = st.degraded || st.ai.degradedFeed;
    if (degraded) {
      wrap.innerHTML = `<div class="banner warn"><span class="ico" aria-hidden="true">หมายเหตุ:</span><div><strong>ข้อมูลรถขาดช่วง</strong><br>กรุณาใช้ตารางเดินรถด้านล่าง/ด้านหลังป้าย และสอบถามเจ้าหน้าที่</div></div>`;
      return;
    }
    const list = st.ai.buses
      .map((b) => ({ b, eta: etaFor(st, b) }))
      .filter((x) => x.eta && x.b.dir === dir)
      .sort((a, z) => a.eta.low - z.eta.low)
      .slice(0, 3);
    if (!list.length) {
      wrap.innerHTML = `<p style="font-size:1.5rem; margin:14px 0;">รอเที่ยวถัดไป — โปรดดูตารางเดินรถ</p>`;
      return;
    }
    wrap.innerHTML = list.map(({ b, eta }, i) => {
      const crowd = b.crowding || { level: -1, icon: '', label: 'ไม่มีข้อมูลปัจจุบัน' };
      const first = i === 0;
      return `
        <div style="padding:${first ? '18px 0' : '14px 0'}; border-bottom:1px solid var(--grid);">
          <div class="kiosk-eta" style="${first ? '' : 'font-size:1.9rem; color:var(--ink-2);'}">${OT.etaRange(st.ai.tSec, eta.low, eta.high)}</div>
          <div class="flex" style="margin-top:8px; gap:12px;">
            ${OT.crowdBadge(crowd, first)}
            <span style="font-size:1.1rem; font-weight:700;">คัน ${OT.esc(b.id)}${crowd.sourceLabel ? `<span class="chip" style="margin-left:8px;">หมายเหตุ: ${OT.esc(crowd.sourceLabel)}</span>` : ''}</span>
          </div>
          ${first ? `<div class="muted" style="margin-top:6px; font-size:1rem;">ในอีกประมาณ ${Math.max(1, Math.round(eta.low / 60))}–${Math.max(2, Math.round(eta.high / 60))} นาที · ไม่รับประกันที่นั่ง</div>` : ''}
        </div>`;
    }).join('');
  }

  function render(st) {
    const meta = stopMeta(st, stopId);
    if (!meta) return;
    document.getElementById('kiosk-stop-name').textContent = meta.name;
    const sv = document.getElementById('kiosk-survey');
    sv.hidden = !meta.survey;
    if (meta.survey) sv.textContent = ` ป้ายสำรวจหลัก · ${meta.surveyLabel}`;
    document.getElementById('kiosk-clock').textContent = st.ai.clock;
    const alertArea = document.getElementById('kiosk-alert');
    let al = '';
    if (st.degraded) al += `<div class="banner crit"><span class="ico" aria-hidden="true"></span><div><strong>ข้อมูลรถขาดช่วง</strong> — ระบบถอนเวลาสดออกแล้ว โปรดใช้ตารางเดินรถ (แสดงด้านล่างเมื่อสั่งพิมพ์) ไม่แสดงเวลาปลอม</div></div>`;
    const last = (st.ai.incidents || []).filter((i) => i.level !== 'info').slice(-1)[0];
    if (last) al += `<div class="banner warn"><span class="ico" aria-hidden="true"></span><div>${last.t} น. — ${OT.esc(last.msg)}</div></div>`;
    alertArea.innerHTML = al;
    dirBox(st, 1);
    dirBox(st, -1);
    const sel = document.getElementById('kiosk-stop-select');
    if (!sel.options.length) {
      sel.innerHTML = st.route.stopCoords.map((s) => `<option value="${s.id}">${s.survey ? ' ' : ''}${OT.esc(s.name)}</option>`).join('');
      sel.value = stopId;
      sel.addEventListener('change', () => {
        stopId = sel.value;
        localStorage.setItem('ot-stop', stopId);
        history.replaceState(null, '', `?stop=${stopId}`);
        renderPrintTable();
      });
    } else sel.value = stopId;
  }

  // ── เสียงประกาศ ──────────────────────────────────────────────────────────
  document.getElementById('kiosk-speak').addEventListener('click', () => {
    const st = OT.state;
    if (!st) return;
    const meta = stopMeta(st, stopId);
    if (st.degraded) { OT.speak(`ข้อมูลรถขาดช่วง กรุณาใช้ตารางเดินรถประจำป้าย และสอบถามเจ้าหน้าที่`); return; }
    const next = st.ai.buses
      .map((b) => ({ b, eta: etaFor(st, b) }))
      .filter((x) => x.eta && x.b.dir === 1)
      .sort((a, z) => a.eta.low - z.eta.low)[0];
    if (!next) { OT.speak(`รถสายหนึ่ง ขาไป ยังไม่มีข้อมูลในช่วงนี้ กรุณาดูตารางเดินรถ`); return; }
    const crowd = next.b.crowding || { level: -1, label: 'ไม่มีข้อมูลปัจจุบัน' };
    const loMin = Math.max(1, Math.round(next.eta.low / 60)), hiMin = Math.max(2, Math.round(next.eta.high / 60));
    OT.speak(`รถสายหนึ่ง ขาไป คาดว่าจะถึงป้าย${meta.name} ในอีก ${loMin} ถึง ${hiMin} นาที สถานะความแน่นปัจจุบัน ${crowd.label} ยังไม่รับประกันที่นั่ง`);
  });

  // ── ตารางสำหรับพิมพ์ติดป้าย ──────────────────────────────────────────────
  function renderPrintTable() {
    const host = document.getElementById('kiosk-print-table');
    if (!timetable || !host) return;
    const mk = (dirKey, title) => {
      const rows = timetable.table[dirKey][stopId] || [];
      const cells = rows.map((m) => OT.simSecToClock(m * 60));
      return `<h3>${title}</h3><p style="font-size:1.05rem; line-height:2;">${cells.join(' · ')}</p>`;
    };
    host.innerHTML = `
      <p><strong>ป้าย: ${OT.esc((OT.state && stopMeta(OT.state, stopId)?.name) || stopId)} · สายนำร่อง 1 จตุจักร ↔ หัวลำโพง</strong><br>
      ออกจากต้นสายทุก 8 นาที · เวลาบริการ 06:00–22:00 น. · เป็นตารางเวลามาตรฐาน (ไม่ใช่ข้อมูลสด)</p>
      ${mk('fwd', 'ขาไป: จตุจักร  หัวลำโพง')}
      ${mk('rev', 'ขากลับ: หัวลำโพง  จตุจักร')}
      <p class="small">ขึ้นรถได้ทุกคนตามลำดับคิว ไม่ต้องสมัคร ไม่ต้องจอง ไม่มีค่ามัดจำ · สอบถามเจ้าหน้าที่ช่วงเร่งด่วน 07:00–09:00 และ 16:00–19:00 น.</p>`;
  }


  // ── โหมดคมชัดสูงสำหรับกลางแจ้ง (High-contrast) ──────────────────────────
  const hcBtn = document.getElementById('kiosk-hc');
  function applyHC() {
    const on = localStorage.getItem('ot-kiosk-hc') === '1';
    if (on) document.documentElement.dataset.kioskHc = '1';
    else delete document.documentElement.dataset.kioskHc;
    if (hcBtn) {
      hcBtn.setAttribute('aria-pressed', String(on));
      hcBtn.textContent = (on ? 'ปิดโหมดคมชัดสูง' : 'โหมดคมชัดสูง (กลางแจ้ง)');
    }
  }
  if (hcBtn) hcBtn.addEventListener('click', () => {
    localStorage.setItem('ot-kiosk-hc', localStorage.getItem('ot-kiosk-hc') === '1' ? '0' : '1');
    applyHC();
  });
  applyHC();

  OT.onState(render);
})();
