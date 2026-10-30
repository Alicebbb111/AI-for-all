'use strict';
/* OmniTransit v5 — dispatcher.js
 * หน้านายท่าแบบทำงานเร็ว: นับถอยหลังรอบปล่อยรถ, การ์ดแจ้งเตือนรถติดกันแบบกดปุ่มเดียว,
 * ตารางรถบรรทัดเดียวต่อคัน, เสียงเตือนสังเคราะห์ และบันทึกการตัดสินใจ
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const MODEL_SHORT = { nonac: 'รถร้อน', acblue: 'แอร์', ev: 'EV' };

  // ── เสียงเตือนสังเคราะห์ (Web Audio API — เริ่มได้หลังผู้ใช้สัมผัสหน้าจอ) ──
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* ไม่รองรับ */ } }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }
  document.addEventListener('pointerdown', ensureAudio);
  document.addEventListener('keydown', ensureAudio);
  function alertBeep() {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    for (const [f, at] of [[880, 0], [1180, 0.16], [880, 0.32]]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.16, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.15);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + at); o.stop(now + at + 0.17);
    }
  }
  const seenRecs = new Set();
  let audioFirstLoad = true;

  // ── นับถอยหลังรอบปล่อยรถคันถัดไป ─────────────────────────────────────────
  function renderCountdown(st) {
    for (const dir of [1, -1]) {
      const arr = st.ai.departures[String(dir)] || [];
      const last = arr.length ? arr[arr.length - 1] : st.ai.tSec - 480;
      const shift = st.ai.terminalShift[String(dir)] || 0;
      const next = last + 480 + shift;
      const remain = Math.max(0, next - st.ai.tSec);
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(Math.floor(remain % 60)).padStart(2, '0');
      $('cd-' + dir).textContent = `${mm}:${ss}`;
      const waiting = st.ai.buses.filter((b) => b.state === 'terminal' && b.dir === dir).length;
      // สมการ 4: แนะนำจากช่องไฟหน้า-หลังของคันที่รออยู่ที่อู่ (แสดงก่อนนายท่ากดตัดสินใจ)
      const hr = st.ai.holdRec && st.ai.holdRec[String(dir)];
      const hint = hr && waiting
        ? hr.holdMin >= 1 ? ` · สมการช่องไฟแนะนำหน่วง ${hr.holdMin} นาที (หน้า ${hr.H_frontMin} / หลัง ${hr.H_backMin} นาที)`
        : hr.rawHoldMin <= -1 ? ` · สมการช่องไฟแนะนำปล่อยเร็วขึ้น (${hr.H_frontMin} / ${hr.H_backMin} นาที)` : ''
        : '';
      $('cd-' + dir + '-sub').textContent = waiting
        ? `คันรอปล่อยที่อู่ ${waiting} คัน · ปรับจากคำแนะนำ ${Math.round(shift / 60)} นาที${hint}`
        : `รอรถวิ่งกลับถึงอู่ · ปรับจากคำแนะนำ ${Math.round(shift / 60)} นาที`;
    }
  }

  // ── การ์ดแจ้งเตือน + ปุ่มตัดสินใจปุ่มเดียว ────────────────────────────────
  function waitingBusId(st, dir) {
    const b = st.ai.buses.find((x) => x.state === 'terminal' && x.dir === dir);
    return b ? b.id : null;
  }
  function renderRecs(st) {
    const box = $('rec-area');
    const pending = st.ai.recommendations.filter((r) => r.status === 'pending');
    const bunch = pending.filter((r) => r.type === 'delay_next' || r.type === 'early_next');
    const others = pending.filter((r) => !(r.type === 'delay_next' || r.type === 'early_next'));
    const recent = st.ai.recommendations.filter((r) => r.status !== 'pending').slice(0, 3);

    let html = bunch.map((r) => {
      const wait = waitingBusId(st, r.dir) || 'คันถัดไป';
      const h = r.hold || null;
      // สมการ 4 (Daganzo two-sided holding): เหตุผลบรรทัดเดียวจากช่องไฟหน้า-หลังจริง
      const eq = h ? `<span class="chip small" style="margin-top:6px;">rawHold = 0.5·(${h.H_targetMin} − ${h.H_frontMin}) + 0.25·(${h.H_backMin} − ${h.H_frontMin}) = ${h.rawHoldMin} นาที</span>` : '';
      const msg = r.type === 'delay_next'
        ? (h
          ? `คัน ${OT.esc(h.busId || wait)} — คันหน้าห่างเพียง ${h.H_frontMin} นาที (คันหลังห่าง ${h.H_backMin} นาที · รอบเป้าหมาย ${h.H_targetMin} นาที) แนะนำชะลอปล่อย ${r.shiftMin} นาที เพื่อปรับสมดุลช่องไฟหน้า-หลัง`
          : `คัน ${OT.esc(wait)} กำลังจะปล่อย แต่เที่ยวก่อนหน้าออกห่างกันเพียง ${OT.esc((r.detail.match(/ห่างกัน ([\d.]+) นาที/) || [])[1] || '?')} นาที — แนะนำหน่วงเวลาปล่อยคันถัดไป ${r.shiftMin} นาที`)
        : (h
          ? `คันหน้าห่าง ${h.H_frontMin} นาที (คันหลัง ${h.H_backMin} นาที) ช่องไฟกว้างกว่ารอบเป้าหมาย ${h.H_targetMin} นาที — แนะนำปล่อยคัน ${OT.esc(h.busId || wait)} ก่อนกำหนด ${Math.abs(r.shiftMin)} นาที (ยังเว้นห่างขั้นต่ำ 6 นาที)`
          : `ช่วงเว้นรถยาวเกินรอบ — แนะนำปล่อยคัน ${OT.esc(wait)} ก่อนกำหนด ${Math.abs(r.shiftMin)} นาที`);
      return `
      <div class="alert-bunch" role="alert">
        <div class="ab-title">${OT.icon('alert')} ${r.type === 'delay_next' ? 'รถวิ่งติดกัน' : 'ช่องไฟถี่เกินรอบ'} · ทิศ${OT.dirShort(r.dir)} · สมการช่องไฟสองทิศ</div>
        <div class="ab-msg">${msg}</div>
        ${eq}
        <div class="ab-actions">
          <button class="btn primary xl" data-decide="approved" data-rec="${r.id}">ปล่อยตามคำแนะนำ (${r.shiftMin > 0 ? '+' : ''}${r.shiftMin} นาที)</button>
          <button class="btn xl" data-decide="rejected" data-rec="${r.id}">ปล่อยตามเวลาเดิม</button>
        </div>
      </div>`;
    }).join('');

    html += others.map((r) => `
      <div class="banner warn">${OT.icon('alert')}
        <div class="grow"><b>กำลังบริการไม่พอ</b> — ${OT.esc(r.detail)}</div>
        <button class="btn small" data-decide="approved" data-rec="${r.id}">รับทราบและส่งต่อ</button>
      </div>`).join('');

    if (!bunch.length && !others.length) {
      html = `<div class="card tight"><div class="flex">${OT.icon('check', 'lg')}<span style="font-weight:600;">รถทุกคันวิ่งตามรอบปกติ ไม่มีเหตุรอตัดสินใจ</span></div></div>`;
    } else if (recent.length) {
      html += `<details class="card tight mt"><summary style="cursor:pointer; font-weight:600; font-size:0.84rem;">ตัดสินใจไปแล้วเมื่อไม่นานนี้ (${recent.length})</summary>
        ${recent.map((r) => `<div class="gate"><span class="tag ${r.status === 'approved' ? 'run' : r.status === 'rejected' ? 'rest' : 'warn'}"><span class="ico-dot"></span>${r.status === 'approved' ? 'อนุมัติ' : r.status === 'rejected' ? 'ใช้แผนเดิม' : r.status === 'suppressed' ? 'ถูกระงับ' : 'หมดอายุ'}</span><span class="small">${r.t} — ${OT.esc(r.title)}</span></div>`).join('')}
      </details>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-decide]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      await OT.post('/api/dispatch', { recId: btn.dataset.rec, decision: btn.dataset.decide, note: btn.dataset.decide === 'rejected' ? 'นายท่าเลือกใช้แผนเดิมจากหน้าจอ' : 'นายท่าอนุมัติจากหน้าจอ' });
    }));
  }

  // ── ตารางรถ: 7 คอลัมน์ — ข้อมูลรอง (ทะเบียน/เที่ยว/พัก/ขับ) อยู่ใต้ชื่อคัน ──
  function renderFleet(st) {
    const tbody = document.querySelector('#fleet-table-el tbody');
    tbody.innerHTML = st.ai.buses.map((b) => {
      const tag = b.state === 'running' ? '<span class="tag run"><span class="ico-dot"></span>วิ่งตามเส้นทาง</span>'
        : b.state === 'dwell' ? '<span class="tag idle"><span class="ico-dot"></span>จอดรับ-ส่ง</span>'
        : b.state === 'terminal' ? `<span class="tag rest"><span class="ico-dot"></span>พักที่อู่</span>`
        : b.state === 'broken' ? '<span class="tag bad"><span class="ico-dot"></span>รถเสีย</span>'
        : '<span class="tag bad"><span class="ico-dot"></span>ครบกะ</span>';
      const la = b.lastArrival;
      const hasLoad = Number.isFinite(b.onboardEst);
      const pct = hasLoad ? Math.min(100, Math.round((b.onboardEst / b.model.legalMax) * 100)) : 0;
      const col = pct >= 75 ? 'var(--crit-fill)' : pct >= 45 ? 'var(--warn-fill)' : 'var(--ok-fill)';
      const sig = b.nextSignalState || {};
      const sigTxt = sig.hasSignal
        ? `<span class="sig-dot" style="background:${sig.color === 'red' ? 'var(--crit-fill)' : sig.color === 'amber' ? 'var(--warn-fill)' : 'var(--ok-fill)'}"></span> ${sig.color === 'red' ? `แดง ${sig.remainingSec} วิ` : sig.color === 'amber' ? 'เหลือง' : 'เขียว'}`
        : '<span class="muted">ไม่มีไฟ</span>';
      return `<tr>
        <td><b>${OT.esc(b.id)}</b> <span class="chip small">${OT.esc(MODEL_SHORT[b.model.id] || b.model.name)}</span>
          <div class="muted small">${OT.esc(b.label)} · เที่ยว ${b.tripNo} · พัก ${b.restMin} นาที · ขับ ${(b.driveMin / 60).toFixed(1)} ชม.</div></td>
        <td>${tag}<div class="small">${OT.esc(b.nextStopName)} · ${OT.dirShort(b.dir)}</div></td>
        <td><div class="cam-load"><div class="cam-bar"><div style="width:${hasLoad ? pct : 0}%; background:${col};"></div></div><span class="num small"><b>${hasLoad ? b.onboardEst : '–'}</b>/${b.model.legalMax}</span></div>
          <div class="muted small">${hasLoad ? OT.crowdSimple(b.crowding ? b.crowding.level : -1).label : 'ไม่มีข้อมูลสด (รอกล้องอ่านค่า)'}</div></td>
        <td class="num small">+${la ? la.board : 0} / -${la ? la.alight : 0}${la ? `<div class="muted" style="font-size:0.68rem;">ที่ ${OT.esc(la.stopName)}</div>` : ''}</td>
        <td class="num small">${b.actualDwellSec} วิ${b.remainingDwellSec ? `<div class="muted" style="font-size:0.68rem;">เหลือจอด ${b.remainingDwellSec} วิ</div>` : ''}</td>
        <td class="small">${sigTxt}</td>
        <td>${b.gpsOk ? '<span class="tag run"><span class="ico-dot"></span>ปกติ</span>' : `<span class="tag bad"><span class="ico-dot"></span>ขาด ${b.gpsStaleSec} วิ</span>`}</td>
      </tr>`;
    }).join('');
    const mf = st.minFleet;
    const el = document.getElementById('fleet-adequacy');
    el.innerHTML = mf.shortfall > 0
      ? `${OT.icon('alert')} รถพร้อม ${mf.available}/${mf.minFleet} — ขาด ${mf.shortfall}`
      : `${OT.icon('check')} รถพร้อม ${mf.available} คัน เพียงพอ (ขั้นต่ำ ${mf.minFleet})`;
    el.className = 'chip ' + (mf.shortfall > 0 ? 'fail' : 'pass');
  }

    function renderAudit(st) {
    $('audit-log').innerHTML = (st.audit || []).slice(0, 30).map((a) =>
      `<li><time>${a.tSim}</time><span><b>${OT.esc(a.actor)}</b> — ${OT.esc(a.action)}<br><span class="muted small">${OT.esc(a.detail || '')}</span></span></li>`).join('') ||
      '<li><span class="muted">ยังไม่มีรายการ</span></li>';
  }

  function renderAlerts(st) {
    let html = '';
    if (st.killSwitch && st.killSwitch.on) html += `<div class="banner crit">${OT.icon('alert')}<div>Kill Switch เปิดอยู่ — คำแนะนำทั้งหมดถูกระงับ ใช้แผนเดิมที่อนุมัติไว้</div></div>`;
    const serious = (st.ai.incidents || []).filter((i) => i.level === 'serious').slice(-1).reverse();
    for (const inc of serious) html += `<div class="banner crit" style="padding:6px 10px; font-size:0.76rem;">${OT.icon('alert')}<div>${inc.t} — ${OT.esc(inc.msg)}</div></div>`;
    $('dispatcher-alert').innerHTML = html;
  }

  $('auto-approve').addEventListener('change', (e) => OT.post('/api/control', { action: 'auto_approve', value: e.target.checked }));

  // ════════════════════════════════════════════════════════════════════════
  //  Mission Control — Anti-Bunching & Dispatch (ข้อมูลจริงจากกล้อง AI เหนือประตู)
  // ════════════════════════════════════════════════════════════════════════

  // ── แถบจำลองสถานการณ์สด (Judge Live Scenario Trigger) ────────────────────
  document.getElementById('scenario-bar').addEventListener('click', async (e) => {
    const sc = e.target.closest('[data-scen]');
    if (sc) {
      if (sc.dataset.scen === 'rain') return OT.post('/api/control', { action: 'rain', value: !(OT.state && OT.state.rain) });
      if (sc.dataset.scen === 'rush') return OT.post('/api/control', { action: 'rush', value: !(OT.state && OT.state.rush) });
      if (sc.dataset.scen === 'slowzone') return OT.post('/api/control', { action: 'slowzone' });
      if (sc.dataset.scen === 'breakdown') return OT.post('/api/control', { action: 'breakdown' });
    }
    const sp = e.target.closest('[data-speed]');
    if (sp) await OT.post('/api/control', { action: 'speed', value: parseInt(sp.dataset.speed) });
  });
  function renderScenarioBar(st) {
    document.querySelector('[data-scen="rain"]').classList.toggle('primary', !!st.rain);
    document.querySelector('[data-scen="rain"]').setAttribute('aria-pressed', String(!!st.rain));
    document.querySelector('[data-scen="rush"]').classList.toggle('primary', !!st.rush);
    document.querySelector('[data-scen="rush"]').setAttribute('aria-pressed', String(!!st.rush));
    document.querySelectorAll('#scenario-bar [data-speed]').forEach((b) => {
      const on = parseInt(b.dataset.speed) === st.simSpeed;
      b.classList.toggle('primary', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ── โซน 1: เครื่องคิดเลขสมการปล่อยรถสด (Live Dispatch Formula Telemetry) ──
  function verdictOf(hr) {
    if (!hr) return { label: 'รอคันวิ่งกลับอู่', cls: '' };
    if (hr.holdMin >= 1) return { label: `หน่วงปล่อย +${hr.holdMin} นาที`, cls: 'warn' };
    if (hr.rawHoldMin <= -1) return { label: `ดึงปล่อยเร็ว ${Math.min(5, Math.round(-hr.rawHoldMin))} นาที`, cls: 'pass' };
    return { label: 'ปล่อยตามรอบเดิม', cls: '' };
  }
  function dirRow(hr) {
    if (!hr) {
      return `<td class="fx-empty">รอคันวิ่งกลับถึงอู่ — เริ่มคำนวณเมื่อมีคันรอปล่อย</td>`;
    }
    const loadPct = hr.frontBusCapacity ? Math.round((hr.frontBusLoad / hr.frontBusCapacity) * 100) : 0;
    const hfCls = hr.H_frontMin < hr.H_targetMin * 0.6 ? 'fx-bad' : hr.H_frontMin >= hr.H_targetMin ? 'fx-ok' : 'fx-warn';
    return `<td>
      <div class="fx-line"><span class="fx-k">H_front</span><b class="${hfCls}">${hr.H_frontMin}</b><span class="fx-u">นาที · ${hr.frontGapMeters != null ? hr.frontGapMeters.toLocaleString() + ' ม.' : '-'}</span></div>
      <div class="fx-line"><span class="fx-k">H_back</span><b>${hr.H_backMin}</b><span class="fx-u">นาที · ${hr.backGapMeters != null ? hr.backGapMeters.toLocaleString() + ' ม.' : '-'}</span></div>
      <div class="fx-line"><span class="fx-k">กล้อง AI</span><b class="${loadPct >= 75 ? 'fx-bad' : ''}">${hr.frontBusLoad ?? '-'}/${hr.frontBusCapacity ?? '-'}</b><span class="fx-u">คน · คิวอู่ ${hr.originQueuePax}</span></div>
      <div class="fx-line"><span class="fx-k">ถนน/ไฟ</span><b>${hr.corridorAvgSpeedKmh}</b><span class="fx-u">กม./ชม. · ไฟแดง ${hr.redLightsActiveCount}/${hr.totalSignalStops} แยก</span></div>
      <div class="fx-line fx-eqline"><span class="fx-k">Δt</span><b>${hr.rawHoldMin} → ${hr.loadWeightedHoldMin}</b><span class="fx-u">นาที (raw → load-weighted)</span></div>
    </td>`;
  }
  function renderFormula(st) {
    const rows = [
      ['', 'ขาไป · จตุจักร ไป หัวลำโพง', 'ขากลับ · หัวลำโพง ไป จตุจักร'],
      ['H_front · H_back', null, null],
      ['คนจริงบนคันหน้า (กล้อง AI)', null, null],
      ['ถนน & สัญญาณไฟ', null, null],
      ['ผลสมการ Δt (Daganzo + Load-weighted)', null, null],
    ];
    const hr1 = st.ai.holdRec && st.ai.holdRec['1'];
    const hr2 = st.ai.holdRec && st.ai.holdRec['-1'];
    const v1 = verdictOf(hr1), v2 = verdictOf(hr2);
    document.getElementById('dispatch-formula').innerHTML = `
      <table class="data fx-table">
        <thead><tr><th></th><th>${rows[0][1]}</th><th>${rows[0][2]}</th></tr></thead>
        <tbody>
          <tr><td class="fx-rowhead">ข้อมูลสด / ผลสมการ</td>${dirRow(hr1)}${dirRow(hr2)}</tr>
        </tbody>
      </table>
      <div class="fx-verdicts">
        <span class="chip ${v1.cls}">ขาไป: ${v1.label} · Δt ${hr1 ? hr1.rawHoldMin + ' → ' + hr1.loadWeightedHoldMin + ' นาที' : '-'}</span>
        <span class="chip ${v2.cls}">ขากลับ: ${v2.label} · Δt ${hr2 ? hr2.rawHoldMin + ' → ' + hr2.loadWeightedHoldMin + ' นาที' : '-'}</span>
        <span class="chip">สมการ: Δt = 0.5·(Ht − Hf) + 0.25·(Hb − Hf) · กรอบอนุมัติ 0–5 นาที · ห้ามตัดพักขั้นต่ำ 6 นาที</span>
      </div>`;
  }

  // ── โซน 2: หลักฐาน 4 เสา (4-Pillar Evidence Chips) ในการ์ดตัดสินใจ ────────
  function pillarChips(r) {
    const h = r.hold;
    if (!h) return '';
    const loadPct = h.frontBusCapacity ? Math.round((h.frontBusLoad / h.frontBusCapacity) * 100) : 0;
    return `
      <div class="pillar-grid">
        <div class="pillar"><div class="pl-head">ระยะห่าง & ช่องไฟ</div><div>H_front ${h.H_frontMin} นาที (${h.frontGapMeters != null ? h.frontGapMeters.toLocaleString() + ' ม.' : '-'}) · เป้า ${h.H_targetMin} นาที · H_back ${h.H_backMin} นาที</div></div>
        <div class="pillar"><div class="pl-head">กล้อง AI นับคนจริง</div><div>คันหน้า ${h.frontBusLoad ?? '-'}/${h.frontBusCapacity ?? '-'} คน (${loadPct}%) · คิวอู่ ${h.originQueuePax} คน</div></div>
        <div class="pillar"><div class="pl-head">ไฟแดง & จราจร</div><div>เร็วเฉลี่ย ${h.corridorAvgSpeedKmh} กม./ชม. · ไฟแดงสด ${h.redLightsActiveCount}/${h.totalSignalStops} แยก</div></div>
        <div class="pillar"><div class="pl-head">ผลลัพธ์สมการ</div><div>shift ${r.shiftMin > 0 ? '+' : ''}${r.shiftMin} นาที · load-weighted ${h.loadWeightedHoldMin} นาที · ไม่ตัดพักขั้นต่ำ 6 นาที</div></div>
      </div>`;
  }

  // ── โซน 3: เรดาร์เส้นทาง SVG interactive ─────────────────────────────────
  const SPEED_COLOR = [[16, '#2fae6e'], [12, '#e6a817'], [0, '#d6493f']]; // กม./ชม. → สี
  function speedColor(kmh) { for (const [min, c] of SPEED_COLOR) if (kmh >= min) return c; return '#d6493f'; }
  function sigDot(state) { return state.color === 'red' ? '#d03b3b' : state.color === 'amber' ? '#d97706' : state.color === 'green' ? '#0ca30c' : 'transparent'; }
  let inspectorStopId = 'S08'; // เปิดหน้าเจอการ์ดไฟแดงประตูน้ำ (จุดวิกฤต) ทันที
  function renderRadar(st) {
    const host = document.getElementById('corridor-radar');
    const stops = st.ai.stops, buses = st.ai.buses, total = st.route.totalLenM;
    const W = 1000, LANE = { '1': 34, '-1': 86 }, H = 128;
    const x = (m) => 30 + (Math.max(0, Math.min(total, m)) / total) * (W - 60);
    const parts = [];
    // เส้นเลนส์ + สีความเร็วรายโซน
    parts.push(`<line x1="${x(0)}" y1="62" x2="${x(total)}" y2="62" stroke="var(--line)" stroke-width="10"/>`);
    for (const z of (st.ai.zoneSpeeds || [])) {
      parts.push(`<line x1="${x(z.fromS)}" y1="62" x2="${x(z.toS)}" y2="62" stroke="${speedColor(z.speedKmh)}" stroke-width="6" stroke-linecap="butt"><title>โซน ${z.zone + 1}: ${z.speedKmh} กม./ชม.</title></line>`);
    }
    // ป้าย + ไฟแดง
    stops.forEach((s, i) => {
      const px = x(s.s);
      parts.push(`<line x1="${px}" y1="14" x2="${px}" y2="110" stroke="var(--line)" stroke-width="1"/>`);
      parts.push(`<circle cx="${px}" cy="62" r="5" fill="var(--surface-1)" stroke="var(--accent)" stroke-width="2" style="cursor:pointer;" class="radar-stop" data-stop="${s.id}"><title>${OT.esc(s.name)} — คลิกดูรายละเอียด</title></circle>`);
      parts.push(`<text x="${px}" y="10" font-size="9" text-anchor="middle" fill="var(--ink-2)" font-weight="600">${s.id}</text>`);
      if (s.signal) {
        const ss = s.signalState;
        parts.push(`<circle cx="${px}" cy="112" r="4.5" fill="${sigDot(ss)}"><title>ไฟจราจร ${OT.esc(s.name)}: ${ss.color} · เหลือ ${ss.remainingSec} วิ</title></circle>`);
        if (ss.color === 'red') parts.push(`<text x="${px}" y="124" font-size="8.5" text-anchor="middle" fill="var(--crit)" font-variant-numeric="tabular-nums">${ss.remainingSec} วิ</text>`);
      }
    });
    // รถ: เลนบน = ขาไป, เลนล่าง = ขากลับ + เส้นโยงช่องไฟแดงกะพริบเมื่อ < 4 นาที
    const byDir = { '1': [], '-1': [] };
    for (const b of buses) if (b.state === 'running' || b.state === 'dwell') byDir[String(b.dir)].push(b);
    for (const dir of ['1', '-1']) byDir[dir].sort((a, z) => dir === '1' ? a.s - z.s : z.s - a.s);
    for (const dir of ['1', '-1']) {
      const group = byDir[dir];
      for (let i = 0; i < group.length; i++) {
        const b = group[i], px = x(b.s), y = LANE[dir];
        const loadPct = b.model.legalMax ? Math.round((b.onboardEst / b.model.legalMax) * 100) : 0;
        const col = loadPct >= 75 ? 'var(--crit-fill)' : loadPct >= 45 ? 'var(--warn-fill)' : 'var(--ok-fill)';
        parts.push(`<g class="radar-bus" data-bus="${b.id}">
          <rect x="${px - 16}" y="${y - 12}" width="34" height="24" rx="6" fill="var(--surface-1)" stroke="${col}" stroke-width="2"><title>คัน ${b.id} · ${b.speedKmh} กม./ชม. · คนจริง ${b.onboardEst}/${b.model.legalMax} · ${OT.esc(b.nextStopName)}</title></rect>
          <text x="${px}" y="${y - 1}" font-size="8.5" text-anchor="middle" font-weight="700" fill="var(--ink)">${b.id}</text>
          <text x="${px}" y="${y + 9}" font-size="8" text-anchor="middle" fill="var(--ink-2)" font-variant-numeric="tabular-nums">${b.onboardEst}/${b.model.legalMax}</text>
        </g>`);
        if (i < group.length - 1) {
          const ahead = group[i], behind = group[i + 1];
          const gapM = Math.abs(ahead.s - behind.s);
          const spd = Math.max(4, ((ahead.speedKmh || 10) + (behind.speedKmh || 10)) / 2);
          const gapMin = (gapM / 1000) / spd * 60;
          if (gapMin < 4) {
            const xa = x(dir === '1' ? behind.s : ahead.s), xb = x(dir === '1' ? ahead.s : behind.s);
            parts.push(`<line x1="${xa}" y1="${y + 14}" x2="${xb}" y2="${y + 14}" stroke="var(--crit-fill)" stroke-width="2" class="gap-alert"><title>ช่องไฟเพียง ${gapMin.toFixed(1)} นาที (${Math.round(gapM)} ม.) — เสี่ยงวิ่งติดกัน</title></line>`);
          }
        }
      }
    }
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto;" font-family="inherit">${parts.join('')}</svg>`;
    const reds = stops.filter((s) => s.signal && s.signalState.color === 'red').length;
    const totalSig = stops.filter((s) => s.signal).length;
    document.getElementById('radar-meta').textContent = `ติดไฟแดงสด ${reds}/${totalSig} แยก · เส้นแดงกะพริบ = ช่องไฟ < 4 นาที`;
    host.querySelectorAll('.radar-stop').forEach((c) => c.addEventListener('click', () => { inspectorStopId = c.dataset.stop; renderInspector(st); }));
  }

  // ── Inspector: การ์ดเจาะลึกรายป้ายเมื่อคลิก ──────────────────────────────
  function renderInspector(st) {
    const box = document.getElementById('stop-inspector');
    const s = st.ai.stops.find((x) => x.id === inspectorStopId);
    if (!s) { box.innerHTML = ''; return; }
    const ss = s.signalState;
    const dirOf = (b) => (b.dir === 1 ? b.s <= s.s : b.s >= s.s);
    const approaching = st.ai.buses
      .filter((b) => (b.state === 'running' || b.state === 'dwell') && b.dir === 1 ? b.s < s.s : b.s > s.s)
      .filter((b) => dirOf(b))
      .sort((a, z) => Math.abs(s.s - a.s) - Math.abs(s.s - z.s))[0];
    let etaTxt = 'ยังไม่มีรถมุ่งหน้ามาป้ายนี้';
    if (approaching) {
      const dist = Math.abs(s.s - approaching.s);
      const etaMin = (dist / 1000) / Math.max(6, approaching.speedKmh || 15) * 60;
      etaTxt = `คัน ${approaching.id} · อีก ~${Math.max(1, Math.round(etaMin))} นาที · คนบนรถจริง ${approaching.onboardEst}/${approaching.model.legalMax} คน (กล้อง AI)`;
    }
    const sigTxt = ss.hasSignal
      ? `<span class="sig-dot" style="background:${sigDot(ss)}"></span> <b>${ss.color === 'red' ? 'ไฟแดง' : ss.color === 'amber' ? 'เหลือง' : 'เขียว'}</b> · เหลือ ${ss.remainingSec} วิ · รอบ ${ss.cycleSec} วิ · หน่วงเฉลี่ย ${ss.expectedDelaySec} วิ`
      : 'ไม่มีสัญญาณไฟจราจรที่ป้ายนี้';
    box.innerHTML = `
      <div class="inspector">
        <div class="insp-head">
          <b>${OT.esc(s.name)}</b> <span class="chip small">${s.id}</span>
          <span class="muted small">· ห่างต้นสาย ${(s.s / 1000).toFixed(1)} กม. · ความเร็วหน้าป้าย ${s.zoneSpeedKmh} กม./ชม.</span>
          <button class="btn small ghost" id="insp-close" style="margin-inline-start:auto;">ปิด</button>
        </div>
        <div class="insp-grid">
          <div><span class="fx-label">สัญญาณไฟจราจร</span><div>${sigTxt}</div></div>
          <div><span class="fx-label">คนรอขณะนี้</span><div>ขาไป <b>${s.wait1} คน</b> · ขากลับ <b>${s.waitN1} คน</b></div></div>
          <div><span class="fx-label">รถกำลังมุ่งหน้ามา</span><div>${etaTxt}</div></div>
        </div>
      </div>`;
    document.getElementById('insp-close').addEventListener('click', () => { inspectorStopId = null; box.innerHTML = ''; });
  }

  // ── โซน 4ข: แผงควบคุมช่องไฟสด & ป้องกันรถขาดระยะ (Anti-Bunching Control) ──
  function renderHeadwayControl(st) {
    const visualHost = document.getElementById('headway-visual-corridor');
    const tableHost = document.getElementById('headway-pair-table');
    const chip = document.getElementById('bunching-status-chip');
    if (!visualHost || !tableHost) return;

    const buses = st.ai.buses;
    const activeBuses = buses.filter((b) => b.state === 'running' || b.state === 'dwell');

    const byDir = {
      '1': activeBuses.filter((b) => b.dir === 1).sort((a, z) => z.s - a.s),
      '-1': activeBuses.filter((b) => b.dir === -1).sort((a, z) => a.s - z.s),
    };

    let allGapsMin = [];
    let bunchingCount = 0;
    let gapCount = 0;
    const tableRows = [];
    const visualHtmlParts = [];

    for (const dir of ['1', '-1']) {
      const isOutbound = dir === '1';
      const dirTitle = isOutbound ? 'ขาไป · จตุจักร ➔ หัวลำโพง' : 'ขากลับ · หัวลำโพง ➔ จตุจักร';
      const dirBadgeCls = isOutbound ? 'pass' : 'warn';
      const list = byDir[dir];

      let trackCards = [];
      if (!list.length) {
        trackCards.push('<span class="muted small" style="padding:10px;">ไม่มีรถที่กำลังให้บริการในทิศทางนี้</span>');
      } else {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          const paxCount = b.onboardEst ?? 0;
          const maxPax = b.model?.legalMax || 72;
          const loadPct = maxPax ? Math.round((paxCount / maxPax) * 100) : 0;
          const loadCol = loadPct >= 75 ? 'var(--crit)' : loadPct >= 45 ? 'var(--warn)' : 'var(--ok)';

          const busCard = `
            <div class="hv-bus-node radar-bus" data-bus="${b.id}">
              <div class="hv-bus-head">
                <span style="color:var(--accent); font-size:0.86rem;">${b.id}</span>
                <span class="chip small ${b.state === 'dwell' ? 'warn' : 'pass'}" style="font-size:0.64rem; padding:1px 6px;">${b.state === 'dwell' ? 'จอดป้าย' : 'กำลังวิ่ง'}</span>
              </div>
              <div class="hv-bus-pax">คนจริง: <b style="color:${loadCol};">${paxCount}</b>/${maxPax} คน</div>
              <div class="cam-bar" style="margin:4px 0 5px; height:5px;"><div style="width:${Math.min(100, loadPct)}%; background:${loadCol};"></div></div>
              <div class="hv-bus-speed">${b.speedKmh || 0} กม./ชม. · ${b.nextStopName ? OT.esc(b.nextStopName.split(' ')[0]) : '-'}</div>
            </div>`;
          trackCards.push(busCard);

          if (i < list.length - 1) {
            const follower = list[i + 1];
            const followerPax = follower.onboardEst ?? 0;
            const followerMax = follower.model?.legalMax || 72;
            const gapM = Math.abs(b.s - follower.s);
            const avgSpeed = Math.max(6, ((b.speedKmh || 15) + (follower.speedKmh || 15)) / 2);
            const gapMin = (gapM / 1000) / avgSpeed * 60;
            allGapsMin.push(gapMin);

            let status = 'ok';
            let statusColor = 'var(--ok)';
            let chipHtml = `<span class="chip pass">สม่ำเสมอ (ระยะกำลังดี)</span>`;
            let advice = 'เดินรถตามความเร็วปกติ';

            if (gapMin < 5) {
              status = 'danger';
              statusColor = 'var(--crit)';
              bunchingCount++;
              chipHtml = `<span class="chip fail" style="animation:gap-blink 1s steps(2,start) infinite;">จี้ท้าย (&lt;5 น.)</span>`;
              advice = `หน่วงคัน ${follower.id} ไว้ 2-3 นาทีเพื่อดึงระยะ`;
            } else if (gapMin < 10) {
              status = 'warn';
              statusColor = 'var(--warn)';
              chipHtml = `<span class="chip warn">เริ่มชิด (5-10 น.)</span>`;
              advice = 'เฝ้าระวังการจอดแช่ป้ายของคันหน้า';
            } else if (gapMin <= 22) {
              status = 'ok';
              statusColor = 'var(--ok)';
              chipHtml = `<span class="chip pass">สม่ำเสมอ (10-22 น.)</span>`;
              advice = 'เดินรถตามความเร็วปกติ';
            } else if (gapMin <= 28) {
              status = 'warn';
              statusColor = 'var(--warn)';
              chipHtml = `<span class="chip warn">เริ่มทิ้งช่วง (&gt;22 น.)</span>`;
              advice = `กำชับคัน ${follower.id} เร่งความเร็วตามรอบ`;
            } else {
              status = 'gap';
              statusColor = '#9333ea';
              gapCount++;
              chipHtml = `<span class="chip" style="color:#9333ea; border-color:#9333ea; background:rgba(147,51,234,0.12); font-weight:700;">ขาดระยะ (&gt;28 น.)</span>`;
              advice = 'เตรียมปล่อยรถเสริมแทรกช่องว่างด่วน';
            }

            const badgeText = status === 'ok' ? 'ปกติ' : status === 'danger' ? 'จี้ท้าย' : status === 'gap' ? 'ขาดระยะ' : 'เริ่มห่าง';
            const linkHtml = `
              <div class="hv-gap-link">
                <span class="hv-gap-badge ${status}">↔ ${gapMin.toFixed(1)} นาที (${badgeText})</span>
                <div class="hv-gap-line"></div>
                <span class="hv-gap-dist">${gapM.toLocaleString()} ม.</span>
              </div>`;
            trackCards.push(linkHtml);

            tableRows.push(`
              <tr>
                <td><b>${follower.id}</b> ตามหลัง <b>${b.id}</b></td>
                <td><span class="chip small ${dirBadgeCls}">${isOutbound ? 'ขาไป' : 'ขากลับ'}</span></td>
                <td class="num">
                  <div class="hw-time-cell">
                    <span class="hw-time-val" style="color:${statusColor};">${gapMin.toFixed(1)} <small style="font-size:0.72rem; font-weight:normal;">นาที</small></span>
                    <span class="hw-time-sub">${gapM.toLocaleString()} ม.</span>
                  </div>
                </td>
                <td>${chipHtml}</td>
                <td>
                  <div style="font-size:0.8rem;"><b>${followerPax}</b>/${followerMax} คน vs <b>${paxCount}</b>/${maxPax} คน</div>
                  <div class="muted small" style="font-size:0.68rem;">(คันหลัง vs คันหน้า)</div>
                </td>
                <td class="num font-num">${avgSpeed.toFixed(1)} <small>กม./ชม.</small></td>
                <td><b>${advice}</b></td>
              </tr>`);
          }
        }
      }

      visualHtmlParts.push(`
        <div class="hv-track">
          <div class="hv-track-title">
            <span class="chip small ${dirBadgeCls}">${dirTitle}</span>
            <span class="muted small">(ขบวนวิ่งจากซ้ายไปขวาตามลำดับ)</span>
          </div>
          <div class="hv-corridor-row">
            ${trackCards.join('')}
          </div>
        </div>`);
    }

    visualHost.innerHTML = visualHtmlParts.join('');

    tableHost.innerHTML = `
      <table class="data headway-pair-table">
        <thead>
          <tr>
            <th>คู่รถที่วิ่งตามกัน</th>
            <th>ทิศทาง</th>
            <th class="num">เวลาที่คันหลังตามอยู่ (ระยะห่าง)</th>
            <th>สถานะระยะห่าง</th>
            <th>คนจริงบนรถ (กล้อง AI)</th>
            <th class="num">ความเร็วเฉลี่ย</th>
            <th>คำสั่งการนายท่า (Action)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.join('') || '<tr><td colspan="7" class="muted">ไม่มีรถที่กำลังวิ่งคู่กันในสาย</td></tr>'}
        </tbody>
      </table>`;

    const avgHeadwayEl = document.getElementById('kpi-avg-headway');
    const cvEl = document.getElementById('kpi-headway-cv');
    const bunchEl = document.getElementById('kpi-bunching-count');
    const gapEl = document.getElementById('kpi-gap-count');

    if (avgHeadwayEl) {
      if (allGapsMin.length) {
        const meanHw = allGapsMin.reduce((a, b) => a + b, 0) / allGapsMin.length;
        avgHeadwayEl.innerHTML = `${meanHw.toFixed(1)} <small>นาที</small>`;
      } else {
        avgHeadwayEl.innerHTML = `8.0 <small>นาที</small>`;
      }
    }
    if (cvEl) {
      const cvVal = st.ai.metrics?.headwayCV != null ? st.ai.metrics.headwayCV : 0.18;
      cvEl.textContent = cvVal.toFixed(2);
      cvEl.style.color = cvVal <= 0.25 ? 'var(--ok)' : cvVal <= 0.35 ? 'var(--warn)' : 'var(--crit)';
    }
    if (bunchEl) {
      bunchEl.innerHTML = `${bunchingCount} <small>คู่</small>`;
      bunchEl.style.color = bunchingCount > 0 ? 'var(--crit)' : 'var(--ok)';
    }
    if (gapEl) {
      gapEl.innerHTML = `${gapCount} <small>ช่วง</small>`;
      gapEl.style.color = gapCount > 0 ? 'var(--warn)' : 'var(--ok)';
    }

    if (chip) {
      if (bunchingCount > 0) {
        chip.textContent = `แจ้งเตือน: พบรถเสี่ยงวิ่งติดกัน ${bunchingCount} คู่ (แนะนำหน่วงรถ)`;
        chip.className = 'chip fail';
      } else if (gapCount > 0) {
        chip.textContent = `เฝ้าระวัง: พบรถขาดระยะ ${gapCount} ช่วง`;
        chip.className = 'chip warn';
      } else {
        chip.textContent = 'สถานะปกติ · ช่องไฟสม่ำเสมอทั้งสาย';
        chip.className = 'chip pass';
      }
    }
  }



  // ── นักวิเคราะห์สถานการณ์สด (OpenAI — Hybrid: ไม่มี Key ใช้รายงานท้องถิ่น) ──
  let aaBusy = false;
  async function renderAIAnalyst() {
    if (aaBusy) return;
    aaBusy = true;
    const prov = document.getElementById('aa-provider'), txt = document.getElementById('aa-text');
    if (!prov || !txt) { aaBusy = false; return; }
    try {
      const r = await OT.get('/api/operations/copilot?ai=1');
      if (r && r.text) {
        txt.textContent = r.text;
        prov.textContent = r.provider === 'openai' ? `วิเคราะห์สดด้วย OpenAI · ${r.modelVersion || ''}` : 'เอนจินวิเคราะห์ท้องถิ่น (ใส่ OpenAI Key เพื่อใช้ LLM สด)';
        prov.className = 'chip small ' + (r.provider === 'openai' ? 'pass' : '');
      }
    } catch { /* คงข้อความเดิม */ }
    aaBusy = false;
  }

  // ── โซน 6: ตารางรถ — คอลัมน์กล้อง AI + ไฟแดงป้ายหน้า (คงคอลัมน์เดิมครบ) ────
  let mcChartTick = 0;
  OT.onState((st) => {
    renderScenarioBar(st);
    renderFormula(st);
    renderRadar(st);
    renderInspector(st);
    renderHeadwayControl(st);
    $('disp-clock').textContent = st.ai.clock + ' น.';
    $('auto-approve').checked = st.autoApprove;
    renderCountdown(st);
    renderRecs(st);
    renderFleet(st);
    renderAudit(st);
    renderAlerts(st);
    const pendingBunch = st.ai.recommendations.filter((r) => r.status === 'pending' && (r.type === 'delay_next' || r.type === 'early_next'));
    const fresh = pendingBunch.filter((r) => !seenRecs.has(r.id));
    for (const r of pendingBunch) seenRecs.add(r.id);
    if (!audioFirstLoad && fresh.length && $('audio-alert').checked) alertBeep();
    audioFirstLoad = false;
    // กราฟช่องไฟ/คนจริง ทุก 5 วินาที · นักวิเคราะห์ AI ทุก 30 วินาที
    if (mcChartTick % 30 === 0) renderAIAnalyst();
    mcChartTick++;
  });
})();
