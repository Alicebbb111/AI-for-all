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

  // ── ตารางรถบรรทัดเดียว ───────────────────────────────────────────────────
  function renderFleet(st) {
    const tbody = $('fleet-table-el').querySelector('tbody');
    tbody.innerHTML = st.ai.buses.map((b) => {
      const tag = b.state === 'running' ? '<span class="tag run"><span class="ico-dot"></span>วิ่งตามเส้นทาง</span>'
        : b.state === 'dwell' ? '<span class="tag idle"><span class="ico-dot"></span>จอดรับ-ส่ง</span>'
        : b.state === 'terminal' ? `<span class="tag rest"><span class="ico-dot"></span>พักที่อู่ ${b.layoverSec != null ? Math.round(b.layoverSec / 60) + ' นาที' : ''}</span>`
        : b.state === 'broken' ? '<span class="tag bad"><span class="ico-dot"></span>รถเสีย</span>'
        : '<span class="tag bad"><span class="ico-dot"></span>ครบกะ/พ้นสภาพ</span>';
      const crowd = b.crowding || { level: -1 };
      const simple = OT.crowdSimple(crowd.level);
      const restTxt = b.state === 'terminal' && b.layoverSec != null
        ? `${Math.max(0, 6 - Math.round(b.layoverSec / 60))} นาที ถึงพักครบ`
        : `พักสะสม ${b.restMin} นาที`;
      return `<tr>
        <td><b>${OT.esc(b.id)}</b> <span class="muted small">${OT.esc(b.label)}</span></td>
        <td><span class="chip">${OT.esc(MODEL_SHORT[b.model.id] || b.model.name)}</span></td>
        <td class="small">${OT.esc(b.nextStopName)} · ${OT.dirShort(b.dir)}</td>
        <td>${tag}<div class="muted" style="font-size:0.7rem;">เที่ยวที่ ${b.tripNo}</div></td>
        <td class="num small">${restTxt}</td>
        <td class="num small">${(b.driveMin / 60).toFixed(1)} ชม.</td>
        <td>${OT.crowdBadge(crowd)}</td>
        <td>${b.gpsOk ? '<span class="tag run"><span class="ico-dot"></span>ปกติ</span>' : `<span class="tag bad"><span class="ico-dot"></span>ขาด ${b.gpsStaleSec} วิ</span>`}</td>
      </tr>`;
    }).join('');
    const mf = st.minFleet;
    $('fleet-adequacy').innerHTML = mf.shortfall > 0
      ? `${OT.icon('alert')} รถพร้อม ${mf.available}/${mf.minFleet} คัน — ขาด ${mf.shortfall}`
      : `${OT.icon('check')} รถพร้อม ${mf.available} คัน เพียงพอต่อขั้นต่ำ ${mf.minFleet} คัน`;
    $('fleet-adequacy').className = 'chip ' + (mf.shortfall > 0 ? 'fail' : 'pass');
  }

  function renderAudit(st) {
    $('audit-log').innerHTML = (st.audit || []).slice(0, 30).map((a) =>
      `<li><time>${a.tSim}</time><span><b>${OT.esc(a.actor)}</b> — ${OT.esc(a.action)}<br><span class="muted small">${OT.esc(a.detail || '')}</span></span></li>`).join('') ||
      '<li><span class="muted">ยังไม่มีรายการ</span></li>';
  }

  function renderAlerts(st) {
    let html = '';
    if (st.killSwitch && st.killSwitch.on) html += `<div class="banner crit">${OT.icon('alert')}<div>Kill Switch เปิดอยู่ — คำแนะนำทั้งหมดถูกระงับ ใช้แผนเดิมที่อนุมัติไว้</div></div>`;
    const serious = (st.ai.incidents || []).filter((i) => i.level === 'serious').slice(-2).reverse();
    for (const inc of serious) html += `<div class="banner crit">${OT.icon('alert')}<div>${inc.t} — ${OT.esc(inc.msg)}</div></div>`;
    $('dispatcher-alert').innerHTML = html;
  }

  $('auto-approve').addEventListener('change', (e) => OT.post('/api/control', { action: 'auto_approve', value: e.target.checked }));

  OT.onState((st) => {
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
  });
})();
