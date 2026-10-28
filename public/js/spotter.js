'use strict';
/* OmniTransit v5 — spotter.js (จำลองลำแสง APC + แผงผู้สำรวจภาคสนาม) */
(function () {
  let busId = 'B03';

  const $ = (id) => document.getElementById(id);

  function buildSelectors(st) {
    const bs = $('bus-select');
    if (!bs.options.length) {
      bs.innerHTML = st.ai.buses.map((b) => `<option value="${b.id}">${b.id} · ${OT.esc(b.model.name)} · ${OT.esc(b.label)}</option>`).join('');
      bs.value = busId;
      bs.addEventListener('change', () => { busId = bs.value; render(st); });
    } else bs.value = busId;
    const ss = $('spot-stop');
    if (!ss.options.length) {
      ss.innerHTML = st.route.stopCoords.map((s) => `<option value="${s.id}">${s.survey ? ' ' : ''}${OT.esc(s.name)}</option>`).join('');
    }
  }

  function busOf(st) { return st.ai.buses.find((b) => b.id === busId); }

  function render(st) {
    buildSelectors(st);
    const b = busOf(st);
    if (!b) return;
    // ป้ายสถานะความแน่นของรถที่เลือก
    $('sel-bus-crowd').innerHTML = OT.crowdBadge(b.crowding) + (b.crowding.sourceLabel ? ` <span class="chip">หมายเหตุ: ${OT.esc(b.crowding.sourceLabel)}</span>` : '');
    // สมการสมดุลสด
    const last = b.lastArrival;
    const before = last ? Math.max(0, last.onboardAfter - last.board + last.alight) : null;
    $('balance-line').innerHTML = `
      <span class="chip">คัน ${b.id}</span>
      <span class="chip">รุ่น: ${OT.esc(b.model.name)} (เบาะ ${b.model.seats} + ยืน ${b.model.standing} · สูงสุด ${b.model.legalMax})</span>
      <span class="chip">คนบนรถโดยประมาณ: <b>${b.onboardEst === null ? 'ไม่มีข้อมูล' : b.onboardEst + ' คน'}</b></span>
      ${last ? `<span class="chip">ป้ายล่าสุด: ${OT.esc(last.stopName)} · ขึ้น ${last.board} ลง ${last.alight} ขึ้นไม่ได้ ${last.passUp}</span>` : ''}
    `;
    // บันทึก APC
    $('apc-log').innerHTML = (st.apcLog || []).slice(0, 10).map((e) =>
      `<li><time>${e.t}</time><span>คัน ${e.busId} — ตัดแสง <b>${OT.esc(e.beam)}</b>  คนบนรถโดยประมาณ <b>${e.onboardEst}</b></span></li>`).join('') ||
      '<li><span class="muted">ยังไม่มีเหตุการณ์ — กดปุ่มจำลองคนเข้า/ออก</span></li>';
    // ตารางผู้สำรวจ
    const tb = $('spotter-table').querySelector('tbody');
    tb.innerHTML = (st.spotterLog || []).map((e) => `
      <tr><td>${e.t}</td><td>${e.busId}</td><td>${OT.esc(e.stopName)}</td>
      <td class="num">${e.board}</td><td class="num">${e.alight}</td><td class="num">${e.passUp > 0 ? `<b style="color:var(--critical);">${e.passUp}</b>` : '0'}</td>
      <td class="num">${e.before} / ${e.after}</td></tr>`).join('') ||
      '<tr><td colspan="7" class="muted">ยังไม่มีบันทึก</td></tr>';
    // ตารางคนรอทุกป้าย
    $('stops-table').querySelector('tbody').innerHTML = st.ai.stops.map((s) => `
      <tr><td>${OT.esc(s.name)}</td><td>${s.survey ? `<span class="chip warn"> ${s.surveyLabel}</span>` : ''}</td>
      <td class="num">${s.wait1}</td><td class="num">${s.waitN1}</td></tr>`).join('');
  }

  // ── ลำแสงแฟลช ────────────────────────────────────────────────────────────
  function flash(order) {
    const b1 = $('beam1'), b2 = $('beam2'), strip = $('beam-strip');
    b1.classList.add('broken'); b2.classList.add('broken'); strip.classList.add('broken');
    setTimeout(() => { b1.classList.remove('broken'); b2.classList.remove('broken'); strip.classList.remove('broken'); }, 320);
    const c = $('beam-count');
    c.textContent = String((parseInt(c.textContent) || 0) + (order === 'in' ? 1 : 0));
    setTimeout(() => { c.textContent = '0'; }, 900);
  }

  async function beam(direction) {
    flash(direction);
    const r = await OT.post('/api/apc', { busId, direction });
    if (!r.ok) console.warn(r.error);
  }
  $('btn-in').addEventListener('click', () => beam('in'));
  $('btn-out').addEventListener('click', () => beam('out'));

  // ── ผู้สำรวจบันทึก ──────────────────────────────────────────────────────
  $('btn-spot-submit').addEventListener('click', async () => {
    const body = {
      busId,
      stopId: $('spot-stop').value,
      board: parseInt($('spot-board').value) || 0,
      alight: parseInt($('spot-alight').value) || 0,
      passUp: parseInt($('spot-passup').value) || 0,
    };
    const r = await OT.post('/api/spotter', body);
    if (r.ok) {
      $('btn-spot-submit').textContent = ' บันทึกแล้ว (' + r.after + ' คนบนรถ)';
      setTimeout(() => { $('btn-spot-submit').textContent = ' บันทึกรายป้าย'; }, 1600);
      $('spot-board').value = 0; $('spot-alight').value = 0; $('spot-passup').value = 0;
    } else alert(r.error || 'บันทึกไม่สำเร็จ');
  });

  // ── นายท่ากดสถานะต้นทาง / เซ็นเซอร์ขัดข้อง ─────────────────────────────
  $('btn-origin').addEventListener('click', async () => {
    const r = await OT.post('/api/origin', { busId });
    if (r.ok) { $('btn-origin').textContent = ' กดแล้ว — ขึ้นป้าย "สถานะเมื่อออกต้นทาง"'; setTimeout(() => { $('btn-origin').textContent = ' นายท่ากดสถานะต้นทาง'; }, 1800); }
  });
  $('apc-fault').addEventListener('change', async (e) => {
    await OT.post('/api/control', { action: 'apc_fault', busId, value: e.target.checked });
  });

  // ── Keyboard Shortcuts สำหรับผู้สำรวจหน้างาน ─────────────────────────────
  // ↑/↓ = คนขึ้น ±1 (กด Shift พร้อมกัน = ±5) · →/← = คนลง ±1 · P = ขึ้นไม่ได้ +1 · Enter = บันทึก
  function flashField(el) {
    el.style.borderColor = 'var(--accent)';
    setTimeout(() => { el.style.borderColor = ''; }, 260);
  }
  function bump(el, d) {
    el.value = Math.max(0, (parseInt(el.value) || 0) + d);
    flashField(el);
  }
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type="text"], textarea, select')) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp') { bump($('spot-board'), step); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { bump($('spot-board'), -step); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { bump($('spot-alight'), step); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { bump($('spot-alight'), -step); e.preventDefault(); }
    else if (e.key === 'p' || e.key === 'P') { bump($('spot-passup'), 1); e.preventDefault(); }
    else if (e.key === 'Enter') { $('btn-spot-submit').click(); }
  });

  // ──  ส่งออกข้อมูลสำรวจเป็น CSV (เปิดใน Excel ได้ — มี BOM ภาษาไทย) ──────
  $('btn-csv').addEventListener('click', () => {
    const st = OT.state;
    if (!st) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['เวลา(จำลอง)', 'รถ', 'รหัสป้าย', 'ป้าย', 'คนขึ้น', 'คนลง', 'ขึ้นไม่ได้(Pass-up)', 'คนบนรถก่อน', 'คนบนรถหลัง', 'ผู้บันทึก']];
    for (const e of st.spotterLog || []) rows.push([e.t, e.busId, e.stopId, e.stopName, e.board, e.alight, e.passUp, e.before, e.after, e.by]);
    // สรุปรวมรายป้าย
    const agg = new Map();
    for (const e of st.spotterLog || []) {
      const a = agg.get(e.stopId) || { name: e.stopName, b: 0, al: 0, p: 0, n: 0 };
      a.b += e.board; a.al += e.alight; a.p += e.passUp; a.n++;
      agg.set(e.stopId, a);
    }
    rows.push([]);
    rows.push(['== สรุปรวมรายป้าย ==', '', '', '', 'รวมขึ้น', 'รวมลง', 'รวมขึ้นไม่ได้', 'จำนวนรายการ']);
    for (const [id, a] of agg) rows.push(['สรุป', id, '', a.name, a.b, a.al, a.p, a.n]);
    rows.push([]);
    rows.push(['หมายเหตุ', 'ข้อมูลจากระบบจำลอง OmniTransit v5 เวลา ' + st.ai.clock + ' น. (จำลอง) — Pass-up = คนที่พยายามขึ้นแต่รถเต็ม']);
    const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `omnitransit-spotter-${d.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('btn-csv').textContent = ' ส่งออกแล้ว';
    setTimeout(() => { $('btn-csv').textContent = ' ส่งออกข้อมูลสำรวจ (CSV)'; }, 1800);
  });

  OT.onState((st) => {
    const b = busOf(st);
    if (b) $('apc-fault').checked = !!b.apcFault;
    render(st);
  });
})();
