'use strict';
/* OmniTransit v5 — common.js
 * ไลบรารีกลาง: ข้อมูลสด (SSE), ธีม, ไอคอน SVG (Lucide-style — ไม่ใช้อีโมจิ),
 * เมนู 3 แท็บหลัก + เมนูตั้งค่า (ฟันเฟือง), มิเตอร์ความแน่น, บทพูด 45 วินาที, ทัวร์สาธิต
 */
(function () {
  const OT = (window.OT = {});

  // ── ไอคอน SVG มินิมอล (เส้น 2px, Lucide-style) ────────────────────────────
  const I = (paths, vb) => `<svg class="ico-svg" viewBox="${vb || '0 0 24 24'}" aria-hidden="true" focusable="false">${paths}</svg>`;
  OT.ICONS = {
    bus: I('<path d="M5 3h14a1 1 0 0 1 1 1v13H4V4a1 1 0 0 1 1-1Z"/><path d="M4 9h16M9 3v6M15 3v6"/><path d="M7 17v2.5M17 17v2.5"/><circle cx="8" cy="14" r="0.6"/><circle cx="16" cy="14" r="0.6"/>'),
    map: I('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>'),
    chart: I('<path d="M4 20V6M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8M20 16v-3"/>'),
    clock: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    users: I('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9" r="2.6"/><path d="M16.5 14c2.3 0 4 1.5 4.5 4"/>'),
    gear: I('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>'),
    sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>'),
    moon: I('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>'),
    alert: I('<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
    info: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.6v.3"/>'),
    check: I('<path d="M4.5 12.5 10 18 19.5 7"/>'),
    x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
    speaker: I('<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>'),
    print: I('<path d="M7 8V3.5h10V8"/><path d="M5 8h14a1.5 1.5 0 0 1 1.5 1.5V16H17.5M4.5 16H3.5V9.5A1.5 1.5 0 0 1 5 8"/><rect x="7" y="13.5" width="10" height="7"/><path d="M17.5 16H21"/>'),
    download: I('<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>'),
    door: I('<rect x="6" y="3.5" width="12" height="17" rx="1.5"/><path d="M14.5 12h.3"/>'),
    list: I('<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.3" cy="6.5" r="0.9"/><circle cx="4.3" cy="12" r="0.9"/><circle cx="4.3" cy="17.5" r="0.9"/>'),
    route: I('<circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><path d="M15.5 5.5H10a4 4 0 0 0-4 4v0a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v0a3.9 3.9 0 0 1-1.2 2.8"/>'),
    mic: I('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>'),
    play: I('<path d="M7 4.8v14.4L19 12 7 4.8Z"/>'),
    pause: I('<path d="M8 5v14M16 5v14"/>'),
    stop: I('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
    target: I('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/>'),
    megaphone: I('<path d="M4 10v4l11 5V5L4 10Z"/><path d="M15 8.5a4 4 0 0 1 0 7M7 14v5.5"/>'),
    scale: I('<path d="M12 3.5v17M7 20.5h10"/><path d="M12 6.5 5 8l2.6 6A3.6 3.6 0 0 1 5 14M12 6.5 19 8l-2.6 6A3.6 3.6 0 0 0 19 14"/>'),
    doc: I('<path d="M7 3.5h7L19 8.5v12H7v-17Z"/><path d="M13.5 3.5v5.5H19M10 13h6M10 16.5h6"/>'),
    flask: I('<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 19L13.5 9.5v-6"/><path d="M8 14h8"/>'),
    wifi: I('<path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.5a9 9 0 0 1 12.4 0M9.2 16a4.4 4.4 0 0 1 5.6 0"/><circle cx="12" cy="19" r="0.8"/>'),
    wrench: I('<path d="M14.5 6.5a4 4 0 0 1 5-5L16 5l3 3 3.5-3.5a4 4 0 0 1-5 5L6 21l-3-3L14.5 6.5Z"/>'),
    building: I('<path d="M4 20.5h16M6 20.5V4.5h8v16M14 9.5h4v11"/><path d="M9 8h2M9 11.5h2M9 15h2"/>'),
    search: I('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
    arrow: I('<path d="M4 12h15M13.5 6.5 19.5 12l-6 5.5"/>'),
    pin: I('<path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.8 12 21 12 21Z"/><circle cx="12" cy="10" r="2.3"/>'),
    sliders: I('<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>'),
  };
  OT.icon = (name, cls) => (OT.ICONS[name] || '').replace('class="ico-svg"', `class="ico-svg ${cls || ''}"`);

  // ── ธีม & ขนาดอักษร ──────────────────────────────────────────────────────
  // ขนาดตัวอักษร (จำค่าไว้เครื่องละ) — รองรับผู้สูงอายุ/สายตาไม่ดี
  const fsStored = localStorage.getItem('ot-fs');
  if (fsStored && ['sm', 'md', 'lg', 'xl'].includes(fsStored)) document.documentElement.dataset.fs = fsStored === 'md' ? '' : fsStored;
  OT.setFontSize = function (fs) {
    if (fs === 'md') delete document.documentElement.dataset.fs; else document.documentElement.dataset.fs = fs;
    localStorage.setItem('ot-fs', fs);
    document.querySelectorAll('[data-fs-btn]').forEach((b) => b.classList.toggle('primary', b.dataset.fsBtn === fs));
  };
  const themeStored = localStorage.getItem('ot-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = themeStored || (prefersDark ? 'dark' : 'light');

  OT.toggleTheme = function () {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ot-theme', next);
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.innerHTML = OT.icon(next === 'dark' ? 'sun' : 'moon');
      b.title = next === 'dark' ? 'สลับไปโหมดสว่าง' : 'สลับไปโหมดมืด';
    });
    if (window.OTPage && OTPage.onTheme) OTPage.onTheme(next);
  };

  // ── ตัวช่วยทั่วไป ─────────────────────────────────────────────────────────
  OT.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  OT.simSecToClock = (tSec) => {
    const t = ((tSec % 86400) + 86400) % 86400;
    return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
  };
  OT.compass = (deg) => ['เหนือ', 'ตอ.เฉียงเหนือ', 'ตะวันออก', 'ตอ.เฉียงใต้', 'ใต้', 'ตต.เฉียงใต้', 'ตะวันตก', 'ตต.เฉียงเหนือ'][Math.round((deg % 360) / 45) % 8];
  OT.dirName = (d) => (d === 1 ? 'จตุจักร ไป หัวลำโพง' : 'หัวลำโพง ไป จตุจักร');
  OT.dirShort = (d) => (d === 1 ? 'ขาไป' : 'ขากลับ');
  OT.etaRange = (nowSec, lowSec, highSec) => {
    const f = (s) => OT.simSecToClock(nowSec + Math.max(0, s));
    return `${f(lowSec)}–${f(highSec)} น.`;
  };
  OT.post = async function (url, body) {
    // ไม่มีทาง reject — ป้องกัน Unhandled Promise Rejection ทุกจุดที่เรียกใช้
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch {
      return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองอีกครั้ง' };
    }
  };
  OT.get = async function (url) {
    try {
      const r = await fetch(url);
      return await r.json();
    } catch {
      return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองอีกครั้ง' };
    }
  };
  OT.downloadFile = function (name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** คำภาษาง่ายของระดับความแน่น (สำหรับประชาชน) + ระดับศัพท์เทคนิค (สำหรับเจ้าหน้าที่) */
  OT.crowdSimple = (level) => ([
    { label: 'มีที่นั่งว่าง', cls: 'pass' },
    { label: 'มีที่ยืนสบาย', cls: 'warn' },
    { label: 'คนแน่นมาก', cls: 'fail' },
  ][level] || { label: 'ไม่มีข้อมูลสด (อิงตามรอบเวลา)', cls: '' });
  OT.crowdTech = (crowding) => (crowding && crowding.level >= 0 ? crowding.label : 'ไม่มีข้อมูลปัจจุบัน');
  OT.crowdBadge = function (crowding, big) {
    const lv = crowding ? crowding.level : -1;
    const simple = OT.crowdSimple(lv);
    return `<span class="crowd-badge ${big ? 'big' : ''}" role="img" aria-label="สถานะ: ${simple.label}"><span class="ico-dot ${simple.cls === 'pass' ? '' : ''}" style="background:${lv === 0 ? 'var(--ok-fill)' : lv === 1 ? 'var(--warn-fill)' : lv === 2 ? 'var(--crit-fill)' : 'var(--neutral-fill)'}"></span>${OT.esc(simple.label)}</span>`;
  };
  /** แถบมิเตอร์ความแน่นแนวนอน — ภาษาง่าย ไม่ใช้คำศัพท์ซับซ้อน */
  OT.crowdMeter = function (crowding, onboardEst) {
    const lv = crowding ? crowding.level : -1;
    const simple = OT.crowdSimple(lv);
    const extra = (lv >= 0 && onboardEst != null) ? ` · คนบนรถประมาณ ${onboardEst} คน` : '';
    return `<div class="crowd-meter" data-level="${lv}">
      <div class="cm-head"><span class="ico-dot" style="background:${lv === 0 ? 'var(--ok-fill)' : lv === 1 ? 'var(--warn-fill)' : lv === 2 ? 'var(--crit-fill)' : 'var(--neutral-fill)'}"></span>${OT.esc(simple.label)}${extra}</div>
      <div class="cm-track" role="img" aria-label="${simple.label}"><div class="cm-fill"></div></div>
    </div>`;
  };

  // ── ข้อมูลสด (SSE + fallback polling) ────────────────────────────────────
  OT.state = null;
  OT.listeners = [];
  OT.onState = function (fn) { OT.listeners.push(fn); if (OT.state) fn(OT.state); };
  function setState(s) {
    OT.state = s;
    for (const fn of OT.listeners) { try { fn(s); } catch (e) { console.error(e); } }
    renderSysMode(s);
  }
  OT.connect = function (scope) {
    OT.scope = scope || 'ops';
    fetch(`/api/state?scope=${OT.scope}`).then((r) => r.json()).then(setState).catch(() => {});
    const es = new EventSource(`/api/events?scope=${OT.scope}`);
    es.addEventListener('state', (ev) => { try { setState(JSON.parse(ev.data)); } catch {} });
    es.onerror = () => {};
  };

  // ── แถบนำทาง: 3 หน้าหลัก + เมนูตั้งค่า (ฟันเฟือง) ─────────────────────────
  const NAV = [
    ['index.html', 'map', 'หน้าผู้โดยสาร'],
    ['dispatcher.html', 'route', 'หน้านายท่า'],
    ['kpi.html', 'chart', 'สรุปผลโครงการ'],
  ];
  const GEAR_LINKS = [
    ['kiosk.html', 'speaker', 'ป้ายประกาศที่จุดจอด (Kiosk)'],
    ['spotter.html', 'list', 'ผู้สำรวจ / เซ็นเซอร์ประตู APC'],
    ['aieval.html', 'flask', 'ทดสอบและอนุมัติโมเดล AI'],
    ['sim.html', 'wrench', 'จำลองเหตุขัดข้อง / GTFS-RT'],
    ['governance.html', 'building', 'กำกับโครงการ งบประมาณ แผนงาน'],
  ];
  OT.renderNav = function (page) {
    const host = document.getElementById('ot-nav');
    if (!host) return;
    const here = page || location.pathname.split('/').pop() || 'index.html';
    host.innerHTML = `
      <div class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="index.html">
            <span class="brand-badge">${OT.icon('bus')}</span>
            <span><span class="brand-name">OmniTransit</span>
            <span class="brand-sub">รถมาตามรอบ · รู้ข้อมูลจริง · ขึ้นรถได้อย่างเป็นธรรม</span></span>
          </a>
          <nav class="mainnav" aria-label="เมนูหลัก">
            ${NAV.map(([href, ico, label]) => `<a href="${href}" ${here === href ? 'aria-current="page"' : ''}>${OT.icon(ico)}<span class="nav-label">${label}</span></a>`).join('')}
          </nav>
          <div class="top-actions">
            <button class="btn ghost small" data-theme-toggle onclick="OT.toggleTheme()" title="สลับโหมดสว่าง/มืด" aria-label="สลับโหมดสว่าง/มืด">${OT.icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
            <div class="gear-menu">
              <button class="btn small" id="gear-btn" aria-haspopup="true" aria-expanded="false" title="เครื่องมือผู้ปฏิบัติงาน การนำเสนอ และตั้งค่า">${OT.icon('sliders')} <span class="nav-label">เครื่องมือ</span></button>
              <div class="gear-panel" id="gear-panel" role="menu">
                <div class="gp-title">การนำเสนอ</div>
                <a href="#" onclick="OT.startTour(); return false;" role="menuitem">${OT.icon('target')}ทัวร์สาธิตระบบ 2 นาที</a>
                <a href="#" onclick="OT.openPitch(); return false;" role="menuitem">${OT.icon('megaphone')}บทพูดนำเสนอ 45 วินาที</a>
                <div class="gp-title">เครื่องมือสำหรับผู้ปฏิบัติงาน</div>
                ${GEAR_LINKS.map(([href, ico, label]) => `<a href="${href}" role="menuitem">${OT.icon(ico)}${label}</a>`).join('')}
                <div class="gp-title">OpenAI API — คาดการณ์ความแน่นจริง</div>
                <form class="gp-form" id="ai-key-form" autocomplete="off">
                  <input type="password" id="ai-key-input" placeholder="วาง OpenAI API Key (sk-…)" autocomplete="off" aria-label="OpenAI API Key">
                  <select id="ai-model-select" aria-label="เลือกโมเดล OpenAI">
                    <option value="gpt-4o-mini">gpt-4o-mini (ประหยัด)</option>
                    <option value="gpt-4o">gpt-4o (แม่นขึ้น)</option>
                  </select>
                  <div class="flex" style="gap:6px;">
                    <button class="btn small primary" id="ai-key-save" style="flex:1;" type="submit">บันทึก Key</button>
                    <button class="btn small" id="ai-key-clear" title="ลบ Key ออกจากเซสชันนี้" type="button">ลบ</button>
                  </div>
                  <div class="gp-title" style="padding-left:0;">ขนาดตัวอักษร</div>
                  <div class="flex" style="gap:6px;">
                    <button class="btn small" type="button" data-fs-btn="sm" onclick="OT.setFontSize('sm')">A−</button>
                    <button class="btn small" type="button" data-fs-btn="md" onclick="OT.setFontSize('md')">A</button>
                    <button class="btn small" type="button" data-fs-btn="lg" onclick="OT.setFontSize('lg')">A+</button>
                    <button class="btn small" type="button" data-fs-btn="xl" onclick="OT.setFontSize('xl')">A++</button>
                  </div>
                  <div class="small muted" id="ai-status-line">กำลังตรวจสอบสถานะ…</div>
                  <div class="small muted">ทางเลือกถาวร: ใส่ Key ในไฟล์ .env (ดู .env.example) แล้วรีสตาร์ตเซิร์ฟเวอร์</div>
                </form>
              </div>
            </div>
          </div>
        </div>
        <div id="ot-sysmode"></div>
      </div>`;
    const gp = host.querySelector('#gear-panel'), gb = host.querySelector('#gear-btn');
    const refreshAIStatus = async () => {
      const line = host.querySelector('#ai-status-line');
      const st = await OT.get('/api/ai/status');
      if (!line || !st) return;
      if (st.configured) {
        line.innerHTML = `สถานะ: พร้อมใช้งาน · โมเดล <b>${OT.esc(st.model)}</b> (${st.source === 'env' ? 'จากไฟล์ .env' : 'ตั้งค่าในเซสชันนี้'})`;
        const sel = host.querySelector('#ai-model-select');
        if (sel) sel.value = st.model;
      } else {
        line.textContent = 'สถานะ: ยังไม่ได้ใส่ API Key — การคาดการณ์ด้วย AI จริงยังไม่ทำงาน';
      }
    };
    gb.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = gp.classList.toggle('open');
      gb.setAttribute('aria-expanded', String(open));
      if (open) {
        refreshAIStatus();
        const cur = localStorage.getItem('ot-fs') || 'md';
        host.querySelectorAll('[data-fs-btn]').forEach((b) => b.classList.toggle('primary', b.dataset.fsBtn === cur));
      }
    });
    const keyInput = host.querySelector('#ai-key-input');
    const modelSel = host.querySelector('#ai-model-select');
    host.querySelector('#ai-key-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!keyInput.value.trim()) {
        const line = host.querySelector('#ai-status-line');
        if (line) line.textContent = 'กรุณาวาง API Key ก่อนบันทึก (Key เก็บเฉพาะในเซิร์ฟเวอร์ของคุณ)';
        return;
      }
      const r = await OT.post('/api/ai/config', { apiKey: keyInput.value, model: modelSel.value });
      keyInput.value = '';
      if (r.ok) refreshAIStatus();
    });
    host.querySelector('#ai-key-clear')?.addEventListener('click', async () => {
      await OT.post('/api/ai/config', { apiKey: '' });
      refreshAIStatus();
    });
    document.addEventListener('click', (e) => { if (!gp.contains(e.target)) gp.classList.remove('open'); });
  };

  OT.renderFooter = function () {
    const host = document.getElementById('ot-footer');
    if (!host) return;
    host.innerHTML = `
      <div class="footer">
        <div><strong>OmniTransit v5</strong> — ระบบสาธิตจำลองเพื่อการออกแบบและทดสอบ ยังไม่ใช่บริการเดินรถจริง ตัวเลขทั้งหมดเกิดจากการจำลอง</div>
        <div>แผนที่ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL) · ฟอนต์ IBM Plex Sans Thai (SIL OFL)</div>
        <div>ความเป็นส่วนตัว: ไม่มีกล้องหรือการจดจำใบหน้า · ไม่เก็บพิกัดโทรศัพท์ผู้โดยสาร · ไม่แสดงชื่อจริงของพนักงานขับรถ · ไม่มีการจองที่นั่งหรือเก็บมัดจำ — ขึ้นรถได้เท่าเทียมโดยไม่ต้องมีสมาร์ทโฟน</div>
      </div>`;
  };

  // ── แบนเนอร์สถานะระบบ ────────────────────────────────────────────────────
  let lastMode = '';
  function renderSysMode(s) {
    const host = document.getElementById('ot-sysmode');
    if (!host) return;
    let html = '';
    if (s.killSwitch && s.killSwitch.on) {
      html += `<div class="sysmode stopped" role="alert">${OT.icon('alert')} Kill Switch เปิดอยู่ — ระงับคำแนะนำ AI ทั้งหมด กลับสู่แผนเดิมที่อนุมัติไว้ (รถยังให้บริการตามตาราง) เหตุผล: ${OT.esc(s.killSwitch.reason || '-')}</div>`;
    }
    if (s.degraded) {
      html += `<div class="sysmode degraded" role="alert">${OT.icon('wifi')} ข้อมูลสดขัดข้องชั่วคราว — ถอนเวลาคาดการณ์สดแล้ว กำลังแสดงตารางเดินรถมาตรฐานพร้อมแจ้งเหตุ จะไม่แสดงเวลาปลอม</div>`;
    }
    if (html !== lastMode) { host.innerHTML = html; lastMode = html; }
  }

  // ── บทพูดนำเสนอ 45 วินาที ────────────────────────────────────────────────
  const PITCH = 'โครงการนี้ช่วยให้รถโดยสารมาตามรอบและบอกข้อมูลที่เชื่อถือได้ เราเริ่มจากเส้นทางเดียว ใช้ตำแหน่งรถกับการสำรวจคนขึ้นลงช่วยนายท่าจัดเที่ยว ผู้โดยสารขึ้นที่ป้ายเดิม จ่ายค่าโดยสารตามเดิม ไม่ต้องมีแอปและไม่ต้องจองที่ เราจะไม่ให้รถข้ามคนรอเพื่อทำตัวเลขให้ดีขึ้น ถ้าข้อมูลขาดก็บอกว่าขาด ถ้ารถไม่พอก็แสดงว่าต้องเพิ่มรถหรือคนขับเท่าไร ทดลองแล้ววัดทั้งเวลารอ คนขึ้นไม่ได้ รายได้พนักงาน และต้นทุน ถ้าได้ผลจริงและไม่มีปัญหาที่ค้างอยู่จึงขยาย';
  OT.openPitch = function () {
    let bd = document.getElementById('ot-pitch');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'ot-pitch';
      bd.className = 'modal-backdrop';
      bd.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pitch-title">
          <h2 id="pitch-title">บทพูดนำเสนอ 45 วินาที</h2>
          <div class="pitch-progress" aria-hidden="true"><div id="pitch-bar"></div></div>
          <blockquote style="font-size:1.02rem; line-height:1.9; margin:10px 0; border-inline-start:4px solid var(--accent); padding-inline-start:14px;">“${PITCH}”</blockquote>
          <p class="muted small">ที่มา: เอกสารแผนงาน OmniTransit v5 หัวข้อข้อความนำเสนอ</p>
          <div class="flex">
            <button class="btn primary" id="pitch-speak">${OT.icon('speaker')} อ่านออกเสียงภาษาไทย</button>
            <button class="btn" onclick="document.getElementById('ot-pitch').classList.remove('open')">ปิด</button>
          </div>
        </div>`;
      document.body.appendChild(bd);
      bd.addEventListener('click', (e) => { if (e.target === bd) bd.classList.remove('open'); });
      bd.querySelector('#pitch-speak').addEventListener('click', () => OT.speak(PITCH));
    }
    bd.classList.add('open');
    const bar = bd.querySelector('#pitch-bar');
    bar.style.transition = 'none'; bar.style.width = '0%';
    requestAnimationFrame(() => { bar.style.transition = 'width 45s linear'; bar.style.width = '100%'; });
  };
  OT.speak = function (text) {
    try {
      if (!('speechSynthesis' in window)) { alert('เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง'); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'th-TH'; u.rate = 0.98;
      const th = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('th'));
      if (th) u.voice = th;
      speechSynthesis.speak(u);
    } catch (e) { console.error(e); }
  };

  // ══ ทัวร์สาธิตระบบ 2 นาที ═══════════════════════════════════════════════
  const TOUR_PAGES = [
    { page: 'index.html', steps: [
      { sel: '[data-tour="map"]', title: 'แผนที่รถสด', text: 'รถเมล์ทั้ง 10 คันเคลื่อนที่บนแนวถนนจริงแบบเรียลไทม์ สีหมุดรถบอกระดับความแน่น สีเส้นถนนบอกสภาพจราจรจากความเร็วจริงของรถ ลองคลิกที่รถเพื่อดูผังตัวรถและจำนวนคน' },
      { sel: '[data-tour="arrival"]', title: 'การ์ดเวลารถมาถึง', text: 'ตัวเลขใหญ่บอกว่ารถจะมาอีกกี่นาที พร้อมแถบสีระดับความแน่นแบบเข้าใจง่าย และภาพประเภทรถพร้อมค่าโดยสาร — เวลาเป็น "ช่วงคาดการณ์" ตามความจริง' },
      { sel: '[data-tour="planner"]', title: 'วางแผนการเดินทาง', text: 'เลือกป้ายต้นทาง-ปลายทาง ระบบคำนวณเวลารอ เวลาเดินทางรวม ค่าโดยสารตามประเภทรถ และแนวโน้มความแน่น จากข้อมูลรถสด ไม่มีระบบจองที่นั่ง' },
      { sel: '[data-tour="schedule"]', title: 'ตารางเดินรถมาตรฐาน', text: 'เมื่อ GPS ขาดเกิน 90 วินาทีหรือระบบขัดข้อง ระบบจะถอนเวลาสดออกทันทีและแสดงตารางนี้แทน พร้อมระบุชัดว่าเป็นตารางเวลา — ไม่แสดงเวลาปลอม' },
    ]},
    { page: 'kiosk.html', steps: [
      { sel: '#kiosk-fwd', title: 'ป้ายประกาศสำหรับผู้ไม่มีสมาร์ทโฟน', text: 'หน้าจอที่ป้ายจริง ตัวอักษรใหญ่พิเศษอ่านได้จากระยะไกล แสดงเวลาถึงเป็นช่วงและความแน่น — คุ้มครองสิทธิของผู้สูงอายุและผู้ไม่มีมือถือ' },
      { sel: '#kiosk-speak', title: 'เสียงประกาศภาษาไทย', text: 'กดปุ่มนี้เพื่อฟังประกาศรถคันถัดไปด้วยเสียง และมีตารางเดินรถสั่งพิมพ์ติดป้ายได้จากปุ่มพิมพ์' },
    ]},
    { page: 'spotter.html', steps: [
      { sel: '.beam-visual', title: 'เซ็นเซอร์ลำแสงอินฟราเรดที่ประตู', text: 'ลำแสง 2 จุด: ตัดแสง 1 ไป 2 = คนขึ้น, 2 ไป 1 = คนลง ลองกดปุ่มจำลอง คนบนรถจะถูกคำนวณด้วยสมการสมดุลและขึ้นแผนที่ทันที' },
      { sel: '#btn-spot-submit', title: 'ผู้สำรวจภาคสนาม', text: 'ผู้สำรวจบันทึกคนขึ้น คนลง และคนที่ขึ้นไม่ได้เพราะรถเต็ม (Pass-up) รายป้าย เพื่อปรับค่าประมาณการและนับเข้าผลวัดความเป็นธรรม' },
    ]},
    { page: 'dispatcher.html', steps: [
      { sel: '#rec-area', title: 'ศูนย์ควบคุมนายท่า', text: 'เมื่อรถวิ่งติดกัน ระบบเสนอปรับจังหวะปล่อยรถคันถัดไปจากต้นสายภายในกรอบที่อนุมัติไว้เท่านั้น นายท่ากดปุ่มเดียวตัดสินใจ และทุกครั้งถูกบันทึกลงบันทึกการตัดสินใจ' },
      { sel: '#fleet-table', title: 'สถานะรถและแรงงาน', text: 'ชั่วโมงขับสะสม เวลาพักขั้นต่ำที่อู่ สัญญาณ GPS และความแน่นรายคันในบรรทัดเดียวต่อคัน ออกแบบให้คุ้มครองพนักงานขับรถตามกฎหมายแรงงาน' },
      { sel: '#countdown-area', title: 'นับถอยหลังปล่อยคันถัดไป', text: 'ตัวเลขใหญ่บอกนายท่าว่าอีกกี่นาที-วินาที จะถึงรอบปล่อยคันถัดไปของแต่ละทิศ' },
    ]},
    { page: 'kpi.html', steps: [
      { sel: '#kpi-tiles', title: 'วัดผลแบบไม่หลอกตัวเอง', text: 'สองสภาพแวดล้อมจำลองวิ่งคู่กันด้วยความต้องการเดินทางชุดเดียวกัน "ก่อนทดลอง" เทียบ "หลังทดลอง" เวลารอ คนขึ้นไม่ได้ และความสม่ำเสมอของรอบรถ รายงานตามจริงแม้ยังไม่ผ่านเป้า' },
      { sel: '#fairness-table', title: 'ตรวจ 7 กลุ่มผู้เกี่ยวข้อง', text: 'ตรวจรายสัปดาห์จากข้อมูลสด ตั้งแต่คนไม่มีสมาร์ทโฟน ผู้สูงอายุ ไปจนถึงพนักงานขับรถที่ไม่ถูกลงโทษจากคะแนน AI และมีระบบร้องเรียนออกเลขรับเรื่องทันที' },
    ]},
  ];

  const tour = { on: false, pageIdx: 0, stepIdx: 0, paused: false, timer: null, els: {} };
  const TOUR_STEP_MS = 9500;

  function tourSave() { localStorage.setItem('ot-tour', JSON.stringify({ on: tour.on ? 1 : 0, p: tour.pageIdx, s: tour.stepIdx })); }
  function tourCurrentPageIdx() {
    const here = location.pathname.split('/').pop() || 'index.html';
    return TOUR_PAGES.findIndex((p) => p.page === here);
  }
  OT.startTour = function () {
    tour.on = true;
    tour.pageIdx = Math.max(0, tourCurrentPageIdx());
    tour.stepIdx = 0;
    tour.paused = false;
    tourSave();
    OT.tourRender();
  };
  OT.tourAutoResume = function () {
    const saved = JSON.parse(localStorage.getItem('ot-tour') || '{"on":0}');
    if (!saved.on) return;
    const here = tourCurrentPageIdx();
    if (here < 0) {
      const next = Math.min(saved.p + 1, TOUR_PAGES.length - 1);
      location.href = TOUR_PAGES[next].page + '?tour=1';
      return;
    }
    tour.on = true; tour.pageIdx = here; tour.stepIdx = saved.s || 0; tour.paused = false;
    setTimeout(() => OT.tourRender(), 600);
  };
  function tourClear() {
    clearTimeout(tour.timer);
    if (tour.els.overlay) tour.els.overlay.remove();
    tour.els = {};
  }
  OT.stopTour = function () {
    tour.on = false; tourSave();
    tourClear();
  };
  function tourPosition() {
    const { spot, card } = tour.els;
    if (!spot || !card) return;
    const host = document.querySelector(TOUR_PAGES[tour.pageIdx].steps[tour.stepIdx].sel);
    const vw = window.innerWidth, vh = window.innerHeight;
    let rect = null;
    if (host) { const r = host.getBoundingClientRect(); if (r.width > 40 && r.height > 30) rect = r; }
    if (rect) {
      const pad = 8;
      spot.style.display = 'block';
      spot.style.top = (rect.top - pad) + 'px';
      spot.style.left = (rect.left - pad) + 'px';
      spot.style.width = (rect.width + pad * 2) + 'px';
      spot.style.height = (rect.height + pad * 2) + 'px';
      const below = rect.bottom + 14, cardH = card.offsetHeight || 170;
      if (below + cardH < vh - 12) { card.style.top = below + 'px'; card.style.left = Math.max(12, Math.min(vw - 352, rect.left)) + 'px'; }
      else { card.style.top = Math.max(12, rect.top - cardH - 14) + 'px'; card.style.left = Math.max(12, Math.min(vw - 352, rect.left)) + 'px'; }
    } else {
      spot.style.display = 'none';
      card.style.top = Math.max(12, vh / 2 - 110) + 'px';
      card.style.left = Math.max(12, vw / 2 - 170) + 'px';
    }
  }
  function tourScheduleNext() {
    clearTimeout(tour.timer);
    if (tour.paused) return;
    tour.timer = setTimeout(() => tourAdvance(1), TOUR_STEP_MS);
  }
  function tourAdvance(dir) {
    const steps = TOUR_PAGES[tour.pageIdx].steps;
    tour.stepIdx += dir;
    if (tour.stepIdx >= steps.length) {
      if (tour.pageIdx >= TOUR_PAGES.length - 1) {
        OT.stopTour();
        alert('จบทัวร์สาธิต — กด "เครื่องมือ > ทัวร์สาธิตระบบ" เพื่อเล่นซ้ำได้ทุกเมื่อ');
        return;
      }
      tour.pageIdx++; tour.stepIdx = 0; tourSave();
      location.href = TOUR_PAGES[tour.pageIdx].page + '?tour=1';
      return;
    }
    if (tour.stepIdx < 0) tour.stepIdx = 0;
    tourSave();
    OT.tourRender();
  }
  OT.tourRender = function () {
    tourClear();
    if (!tour.on) return;
    const step = TOUR_PAGES[tour.pageIdx].steps[tour.stepIdx];
    const totalSteps = TOUR_PAGES.reduce((a, p) => a + p.steps.length, 0);
    const beforeSteps = TOUR_PAGES.slice(0, tour.pageIdx).reduce((a, p) => a + p.steps.length, 0);
    const n = beforeSteps + tour.stepIdx + 1;
    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.innerHTML = `
      <div class="tour-spot"></div>
      <div class="tour-card" role="dialog" aria-label="ทัวร์สาธิต: ${OT.esc(step.title)}">
        <div class="tt">${OT.esc(step.title)}</div>
        <div class="tx">${OT.esc(step.text)}</div>
        <div class="tour-ctrl">
          <button class="btn small" id="tour-pause">${tour.paused ? OT.icon('play') + 'เล่นต่อ' : OT.icon('pause') + 'หยุดชั่วคราว'}</button>
          <button class="btn small" id="tour-prev">${OT.icon('arrow')}ก่อนหน้า</button>
          <button class="btn small primary" id="tour-next">ถัดไป${OT.icon('arrow')}</button>
          <button class="btn small ghost" id="tour-exit">จบทัวร์</button>
          <span class="tour-progress grow" style="min-width:90px;">ขั้นที่ ${n}/${totalSteps}
            <span class="bar"><div style="width:${(n / totalSteps) * 100}%;"></div></span>
          </span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    tour.els = { overlay, spot: overlay.querySelector('.tour-spot'), card: overlay.querySelector('.tour-card') };
    overlay.querySelector('#tour-pause').addEventListener('click', () => {
      tour.paused = !tour.paused;
      overlay.querySelector('#tour-pause').innerHTML = tour.paused ? OT.icon('play') + 'เล่นต่อ' : OT.icon('pause') + 'หยุดชั่วคราว';
      if (tour.paused) clearTimeout(tour.timer); else tourScheduleNext();
    });
    overlay.querySelector('#tour-prev').addEventListener('click', () => tourAdvance(-1));
    overlay.querySelector('#tour-next').addEventListener('click', () => tourAdvance(1));
    overlay.querySelector('#tour-exit').addEventListener('click', () => OT.stopTour());
    tourPosition();
    window.addEventListener('resize', tourPosition);
    window.addEventListener('scroll', tourPosition, true);
    tourScheduleNext();
  };

  // ── การ์ดต้อนรับบนหน้าแรก: บอกผู้ใช้ใหม่ว่าต้องกดอะไรก่อน ─────────────────
  OT.maybeWelcome = function () {
    if ((location.pathname.split('/').pop() || 'index.html') !== 'index.html') return;
    if (localStorage.getItem('ot-welcome') === 'done') return;
    const main = document.querySelector('main');
    if (!main) return;
    const el = document.createElement('div');
    el.className = 'card ot-welcome';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'คำแนะนำการใช้งานสำหรับผู้ใช้ใหม่');
    el.innerHTML = `
      <div class="flex spread" style="align-items:flex-start; gap:10px;">
        <div>
          <h2 style="margin:0 0 4px;">เริ่มต้นที่นี่ — ใช้งานง่ายๆ ใน 3 ขั้น</h2>
          <ol class="welcome-steps">
            <li><b>ดูรถสด</b> บนแผนที่ — คลิกที่หมุดรถเพื่อเห็นผังตัวรถและจำนวนคน</li>
            <li><b>เลือกป้ายรอรถ</b> ในช่องค้นหาด้านขวา เพื่อดูเวลารถจะมาถึง</li>
            <li><b>กด "วิเคราะห์ตอนนี้"</b> เพื่อให้ AI พยากรณ์ความแน่นของรถคันถัดไป</li>
          </ol>
          <div class="flex" style="gap:8px; flex-wrap:wrap; margin-top:10px;">
            <button class="btn primary" id="welcome-tour">${OT.icon('target')} เริ่มทัวร์สาธิต 2 นาที</button>
            <button class="btn" id="welcome-pitch">${OT.icon('megaphone')} ฟังบทพูดนำเสนอ</button>
            <button class="btn ghost" id="welcome-dismiss">เข้าใจแล้ว ปิดรายการนี้</button>
          </div>
        </div>
        <button class="btn ghost small" id="welcome-x" aria-label="ปิดคำแนะนำ">${OT.icon('x')}</button>
      </div>`;
    main.before(el);
    const dismiss = () => { localStorage.setItem('ot-welcome', 'done'); el.remove(); };
    el.querySelector('#welcome-tour').addEventListener('click', () => { dismiss(); OT.startTour(); });
    el.querySelector('#welcome-pitch').addEventListener('click', () => OT.openPitch());
    el.querySelector('#welcome-dismiss').addEventListener('click', dismiss);
    el.querySelector('#welcome-x').addEventListener('click', dismiss);
  };

  // ── บูตเมื่อโหลดหน้า ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    OT.renderNav();
    OT.renderFooter();
    OT.maybeWelcome();
    const skip = document.createElement('a');
    skip.className = 'skip-link'; skip.href = '#main'; skip.textContent = 'ข้ามไปยังเนื้อหาหลัก';
    document.body.prepend(skip);
    OT.connect(document.body.dataset.scope || 'ops');
    OT.tourAutoResume();
  });
})();
