'use strict';
/* OmniTransit v5 — passenger.js
 * หน้าผู้โดยสาร: การ์ดเวลารถมาถึงตัวเลขใหญ่ + มิเตอร์ความแน่นภาษาง่าย
 * + ค้นหาป้ายแบบ Instant Autocomplete + สลับต้นทาง-ปลายทาง (Swap)
 * + แผนที่สดเคลื่อนที่ลื่นไหล + Drawer ข้อมูลสดตัวรถ (แพนนุ่มนวล ผังที่นั่งเรียลไทม์)
 */
(function () {
  let map, busLayer, stopLayer, routeLine, flowLine, trafficLayer, baseLayer, basemapBtns;
  let geo = null; // เรขาคณิตถนนจริงของเส้นทาง — โหลดครั้งเดียวจาก /api/route.geo.json
  const markers = new Map();
  const stopMarkers = new Map();
  let segLines = [];
  let selectedStop = localStorage.getItem('ot-stop') || 'S08';
  let selectedDir = 1;

  // ── Passenger+: ป้ายโปรด · ติดตามรถ · ลิงก์ตรง ──────────────────────────
  let favorites = [];
  try { favorites = JSON.parse(localStorage.getItem('ot-favs') || '[]'); if (!Array.isArray(favorites)) favorites = []; } catch { favorites = []; }
  let followBusId = null;      // รถคันที่กำลังติดตาม (null = ไม่ติดตาม)
  let followAlerted = false;   // แจ้งเตือน "รถใกล้ถึง" แล้วหรือยัง (ครั้งเดียวต่อการติดตาม)
  let followPanT = 0;          // เวลาที่ pan ตามรถครั้งล่าสุด (กันดึงแผนที่สวนมือผู้ใช้)
  let geoRouteId = null;       // สายที่แผนที่/ตารางบนหน้านี้กำลังแสดง
  let routeSwitching = false;  // กำลังสลับสาย (กัน render คาบเกี่ยวระหว่างโหลดข้อมูลใหม่)
  let followEndUntil = 0;      // แสดงข้อความ "จบเที่ยวแล้ว" ค้างไว้ชั่วคราว (กันหายเพราะ render ใหม่ทุกวินาที)
  let fromId = 'S01', toId = 'S08';
  let selectedBusId = null;      // รถที่เปิด Drawer อยู่
  let timetable = null;

  const TRAFFIC_LABELS = ['ไหลลื่น', 'ปานกลาง', 'ติดขัด'];
  // สี hex แยกธีมสำหรับ SVG บนแผนที่ (stroke attribute ไม่รองรับ CSS var)
  function themeColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return dark
      ? { casing: '#454c55', traffic: ['#43b27c', '#e3a93a', '#e26056'], bus: ['#43b27c', '#e3a93a', '#e26056'], neutral: '#7b828b' }
      : { casing: '#c9cdd3', traffic: ['#2fae6e', '#e6a817', '#d6493f'], bus: ['#2fae6e', '#e6a817', '#d6493f'], neutral: '#9aa1a9' };
  }

  // ── ภาพเวกเตอร์ประเภทรถ + ค่าโดยสาร ──────────────────────────────────────
  const BUS_TYPE_INFO = {
    nonac: { name: 'รถร้อน ครีม-แดง', fare: '8 บาท (เหมาจ่าย)' },
    acblue: { name: 'รถปรับอากาศ ฟ้า-ขาว', fare: '15–20 บาท (ตามระยะทาง)' },
    ev: { name: 'รถไฟฟ้า EV พื้นต่ำ', fare: '15 บาท (เหมาจ่าย)' },
  };
  function busIllustration(modelId, w) {
    const W = w || 132, H = W * 0.42;
    const body = { nonac: '#f3ecda', acblue: '#f4f7fa', ev: '#eef3ee' }[modelId] || '#f4f7fa';
    const skirt = { nonac: '#c8382f', acblue: '#2e6fbd', ev: '#2f8f5c' }[modelId] || '#2e6fbd';
    const win = { nonac: '#3b4652', acblue: '#7fa8d9', ev: '#8fbfa4' }[modelId] || '#7fa8d9';
    const roofline = { nonac: '#c8382f', acblue: '#d9e4ef', ev: '#d8e6dc' }[modelId] || '#d9e4ef';
    return `<svg width="${W}" height="${H}" viewBox="0 0 132 55" role="img" aria-label="${BUS_TYPE_INFO[modelId]?.name || 'รถโดยสาร'}" style="display:block;">
      <rect x="4" y="8" width="124" height="36" rx="7" fill="${body}"/>
      <rect x="4" y="8" width="124" height="6" rx="3" fill="${roofline}"/>
      <rect x="4" y="34" width="124" height="10" rx="4" fill="${skirt}"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${14 + i * 26}" y="17" width="19" height="12" rx="2.5" fill="${win}"/>`).join('')}
      <rect x="112" y="17" width="12" height="20" rx="2" fill="${win}" opacity="0.85"/>
      <circle cx="30" cy="46" r="6.5" fill="#23272c"/><circle cx="30" cy="46" r="2.6" fill="#8b929b"/>
      <circle cx="102" cy="46" r="6.5" fill="#23272c"/><circle cx="102" cy="46" r="2.6" fill="#8b929b"/>
      ${modelId === 'ev' ? '<rect x="58" y="2" width="18" height="4" rx="2" fill="#2f8f5c"/>' : ''}
    </svg>`;
  }
  function fareFor(modelId, distKm) {
    if (modelId === 'nonac') return '8 บาท';
    if (modelId === 'ev') return '15 บาท';
    return (distKm && distKm > 6) ? '20 บาท' : '15 บาท';
  }

  // ── Autocomplete ค้นหาป้าย (Instant Search) ──────────────────────────────
  function makeAutocomplete(input, listEl, opts) {
    // opts: { options: () => [{id,label,sub}], getId: ()=>id, setId:(id)=>void, onPick:()=>void }
    let active = -1;
    let items = [];
    function labelOf(id) {
      const o = opts.options().find((x) => x.id === id);
      return o ? o.label : '';
    }
    function syncLabel() { input.value = labelOf(opts.getId()); }
    function close() { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function render(filter) {
      const all = opts.options();
      const q = (filter || '').trim().toLowerCase();
      items = q ? all.filter((o) => o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q)) : all;
      if (!items.length) {
        listEl.innerHTML = '<div class="ac-empty">ไม่พบป้ายที่ค้นหา</div>';
      } else {
        listEl.innerHTML = items.map((o, i) => `
          <div class="ac-item ${i === active ? 'active' : ''}" role="option" aria-selected="${i === active}" data-id="${o.id}">
            ${OT.icon('pin')}<span>${OT.esc(o.label)}</span>${o.sub ? `<span class="ac-sub">${OT.esc(o.sub)}</span>` : ''}
          </div>`).join('');
        listEl.querySelectorAll('.ac-item').forEach((el) => {
          el.addEventListener('mousedown', (e) => { e.preventDefault(); pick(el.dataset.id); });
        });
      }
      listEl.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function pick(id) {
      opts.setId(id);
      syncLabel();
      close();
      if (opts.onPick) opts.onPick();
    }
    input.addEventListener('focus', () => { input.select(); active = -1; render(''); });
    input.addEventListener('input', () => { active = -1; render(input.value); });
    input.addEventListener('blur', () => setTimeout(() => { if (listEl.hidden) return; syncLabel(); close(); }, 140));
    input.addEventListener('keydown', (e) => {
      if (listEl.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { render(''); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(input.value); markActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(input.value); markActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active].id); else if (items.length === 1) pick(items[0].id); }
      else if (e.key === 'Escape') { close(); syncLabel(); }
    });
    function markActive() {
      listEl.querySelectorAll('.ac-item').forEach((el, i) => {
        el.classList.toggle('active', i === active);
        if (i === active) el.scrollIntoView({ block: 'nearest' });
      });
    }
    return { syncLabel };
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function stopName(id) { return OT.state?.route?.stopCoords.find((s) => s.id === id)?.name || id; }
  function toggleFavorite(id) {
    favorites = favorites.includes(id) ? favorites.filter((f) => f !== id) : [id, ...favorites].slice(0, 5);
    localStorage.setItem('ot-favs', JSON.stringify(favorites));
    if (OT.state) renderFavRow(OT.state);
  }
  function renderFavRow(st) {
    const row = document.getElementById('fav-row');
    if (!row) return;
    const liveIds = new Set((st.route?.stopCoords || []).map((s) => s.id));
    const chips = favorites.filter((id) => liveIds.has(id)).map((id) => `
      <button class="chip fav-chip ${id === selectedStop ? 'fav-on' : ''}" data-fav="${id}" title="เปิดป้าย${OT.esc(stopName(id))}">
        <span class="ico-dot"></span>${OT.esc(stopName(id))}</button>`).join('');
    row.innerHTML = `${chips}
      <button class="btn small ghost" id="btn-nearby" title="ใช้ตำแหน่งของคุณหาป้ายที่ใกล้ที่สุด">${OT.icon('pin')} ป้ายใกล้ฉัน</button>
      <button class="btn small ghost ${favorites.includes(selectedStop) ? 'fav-star-on' : ''}" id="btn-fav" title="เก็บ/เอาป้ายนี้ออกจากป้ายโปรด">${OT.icon('target')} ${favorites.includes(selectedStop) ? 'ป้ายโปรดอยู่' : 'เก็บป้ายนี้'}</button>`;
  }
  function nearby() {
    if (!navigator.geolocation) { alert('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const stops = OT.state?.route?.stopCoords || [];
      if (!stops.length) return;
      let best = null, bd = Infinity;
      for (const s of stops) {
        const d = haversineM(latitude, longitude, s.lat, s.lng);
        if (d < bd) { bd = d; best = s; }
      }
      selectStop(best.id);
      alert(`ป้ายใกล้คุณที่สุด: ${best.name} (ระยะทางเส้นตรง ~${Math.round(bd)} ม.)`);
    }, () => alert('ไม่สามารถระบุตำแหน่งได้ — ลองอนุญาตการเข้าถึงตำแหน่งแล้วลองใหม่'), { timeout: 8000, maximumAge: 30000 });
  }
  function applyDeepLink() {
    const q = new URLSearchParams(location.search);
    const s = q.get('stop');
    if (s && OT.state?.route?.stopCoords.some((x) => x.id === s)) selectedStop = s;
    const d = parseInt(q.get('dir'));
    if (d === 1 || d === -1) selectedDir = d;
    const b = q.get('bus');
    if (b) { followBusId = b.toUpperCase(); followAlerted = false; }
  }

  // ── (Multi-route) เมนูเลือกสาย ──
  let routeOptions = [];
  OT.get('/api/routes').then((r) => {
    if (!r || !r.routes) return;
    routeOptions = r.routes;
    const sel = document.getElementById('route-select');
    if (!sel) return;
    sel.innerHTML = routeOptions.map((x) => `<option value="${OT.esc(x.id)}">${OT.esc(x.shortCode)} · ${OT.esc(x.name)}</option>`).join('');
    if (OT.state) sel.value = OT.state.routeId;
  }).catch(() => {});
  function syncRouteSelect(routeId) {
    const sel = document.getElementById('route-select');
    if (sel && sel.value !== routeId) sel.value = routeId;
  }
  document.getElementById('route-select').addEventListener('change', async (e) => {
    await OT.post('/api/control', { action: 'route', value: e.target.value });
    // SSE จะส่งสแนปชอตสายใหม่มา → applyState จัดการโหลดเรขาคณิต/ตารางใหม่เอง
  });

  /** ตรวจการสลับสาย: ล้างเลเยอร์+สถานะผู้ใช้ แล้วโหลดเรขาคณิต/ตารางเวลาของสายใหม่ */
  async function handleRouteSwitch(st) {
    if (geoRouteId === st.routeId) return;
    if (geoRouteId === null) { geoRouteId = st.routeId; return; } // โหลดครั้งแรก — geo ที่ fetch ไว้ตรงอยู่แล้ว
    routeSwitching = true;
    geoRouteId = st.routeId;
    // ล้างสถานะผู้ใช้ที่ผูกกับสายเดิม
    followBusId = null; followAlerted = false;
    if (selectedBusId) closeBusDrawer();
    const stops = st.route.stopCoords;
    selectedStop = stops[0].id;
    fromId = stops[0].id; toId = stops[Math.min(5, stops.length - 1)].id;
    // ล้างเลเยอร์แผนที่ของสายเก่า
    for (const { marker } of markers.values()) marker.remove();
    markers.clear(); stopMarkers.clear();
    stopLayer.clearLayers(); trafficLayer.clearLayers(); busLayer.clearLayers();
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (flowLine) { map.removeLayer(flowLine); flowLine = null; }
    // โหลดเรขาคณิต + ตารางเวลาของสายใหม่
    const g = await OT.get('/api/route.geo.json');
    if (g && g.path) geo = g;
    timetable = null;
    const tt = await OT.get('/api/timetable');
    if (tt && tt.table) timetable = tt;
    if (stopAC) { stopAC.syncLabel(); fromAC.syncLabel(); toAC.syncLabel(); }
    routeSwitching = false;
    if (OT.state && OT.state.routeId === st.routeId) {
      buildRoute(OT.state);
      renderAll(OT.state);
    }
  }

  // ── ภาพบรรยากาศจริงของแต่ละป้าย (Wikimedia Commons — เครดิตใน credits.json) ──
  let stopPhotos = null;
  fetch('/img/stops/credits.json').then((r) => (r.ok ? r.json() : {})).then((j) => { stopPhotos = j; }).catch(() => {});
  function stopPhotoHTML(stopId) {
    const p = stopPhotos && stopPhotos[stopId];
    if (!p) return '';
    const artist = (p.artist || p.title || '').slice(0, 80);
    return `<figure class="stop-photo">
      <img src="/img/stops/${OT.esc(stopId)}.jpg" alt="ภาพบรรยากาศจริงบริเวณป้าย" loading="lazy" width="960" height="300">
      <figcaption><a href="${OT.esc(p.page)}" target="_blank" rel="noopener">ภาพ: ${OT.esc(artist)}</a> · ${OT.esc(p.license || '')} · Wikimedia Commons</figcaption>
    </figure>`;
  }

  // ── แผนที่ — ไทล์คมชัดระดับสากล ฟรี ไม่มี Key ─────────────────────────────
  // แผนที่: OpenStreetMap Standard ไม่ต้องใช้ API Key (ใช้พื้นหลังเดียวกันทั้งธีมสว่างและมืด)
  // ดาวเทียม: Esri World Imagery (สัญญาอนุญาตเผยแพร่ของ Esri สำหรับใช้งานสาธิต)
  const BASEMAPS = {
    streets: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNativeZoom: 19, attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
    sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', subdomains: 'abc', maxNativeZoom: 19, attr: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics' },
  };
  function basemapKey() { return localStorage.getItem('ot-basemap') === 'sat' ? 'sat' : 'streets'; }
  function applyMapTheme() {
    const def = BASEMAPS[basemapKey()];
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(def.url, {
      maxNativeZoom: def.maxNativeZoom, maxZoom: 19,
      attribution: def.attr, crossOrigin: true, updateWhenIdle: false,
    }).addTo(map);
    if (basemapBtns) {
      const sat = basemapKey() === 'sat';
      basemapBtns.map.classList.toggle('active', !sat);
      basemapBtns.sat.classList.toggle('active', sat);
    }
  }
  function initMap() {
    map = L.map('map', { zoomControl: true, attributionControl: false, maxZoom: 19 }).setView([13.7650, 100.5330], 13);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
    // แผงสรุปสถานะเส้นทาง (มุมซ้ายบน) — อัปเดตทุก tick จาก updateBusMarkers()
    const metaCtl = L.control({ position: 'topleft' });
    metaCtl.onAdd = () => {
      const d = L.DomUtil.create('div', 'map-meta');
      d.id = 'map-meta';
      d.textContent = 'กำลังโหลดข้อมูลสด…';
      return d;
    };
    metaCtl.addTo(map);
    // ปุ่มสลับมุมมอง แผนที่/ดาวเทียม (จำค่าไว้เครื่องละ)
    const ctl = L.control({ position: 'topright' });
    ctl.onAdd = () => {
      const div = L.DomUtil.create('div', 'basemap-ctl');
      div.innerHTML = '<button type="button" data-bm="streets" aria-pressed="true">แผนที่</button><button type="button" data-bm="sat" aria-pressed="false">ดาวเทียม</button>';
      L.DomEvent.disableClickPropagation(div);
      basemapBtns = { map: div.querySelector('[data-bm="streets"]'), sat: div.querySelector('[data-bm="sat"]') };
      div.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-bm]');
        if (!b) return;
        localStorage.setItem('ot-basemap', b.dataset.bm);
        applyMapTheme();
      });
      return div;
    };
    ctl.addTo(map);
    applyMapTheme();
    trafficLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
    stopLayer = L.layerGroup().addTo(map);
    window.OTPage = { onTheme: () => { applyMapTheme(); refreshThemeColors(); } };
  }

  function buildRoute(st) {
    if (!geo) return;
    if (routeLine) map.removeLayer(routeLine);
    if (flowLine) map.removeLayer(flowLine);
    // เส้นทางแนวถนนจริง (หลายร้อยจุดจาก /api/route.geo.json — โหลดครั้งเดียว)
    routeLine = L.polyline(geo.path, { color: themeColors().casing, weight: 6, opacity: 0.55, lineJoin: 'round' }).addTo(map);
    // เส้นลูกศรไหลบางๆ ทับเส้นทาง — บอกทิศทางเดินรถ (เคลื่อนไหวด้วย CSS)
    flowLine = L.polyline(geo.path, {
      weight: 2.5, opacity: 0.85, lineCap: 'round',
      color: document.documentElement.dataset.theme === 'dark' ? '#6a9aef' : '#1c5cc8',
      className: 'route-flow',
    }).addTo(map);
    trafficLayer.clearLayers();
    segLines = geo.zones.map((z) => L.polyline(z.line, { color: themeColors().traffic[1], weight: 3.5, opacity: 0.95, lineCap: 'butt' })
      .bindTooltip('สภาพจราจร', { sticky: true })
      .addTo(trafficLayer));
    updateTraffic(st);
    stopLayer.clearLayers();
    stopMarkers.clear();
    const nStops = st.route.stopCoords.length;
    st.route.stopCoords.forEach((sc, i) => {
      const survey = sc.survey;
      const el = document.createElement('div');
      el.className = 'stop-marker' + (survey ? ' survey' : '');
      const m = L.marker([sc.lat, sc.lng], { icon: L.divIcon({ className: '', html: el.outerHTML, iconSize: survey ? [21, 21] : [15, 15], iconAnchor: survey ? [10.5, 10.5] : [7.5, 7.5] }) }).addTo(stopLayer);
      // ชื่อป้ายแสดงตลอด — ป้ายหัวท้ายสาย (จตุจักร / หัวลำโพง) เน้นตัวหนา
      const isTerm = i === 0 || i === nStops - 1;
      m.bindTooltip(`${isTerm ? '<b>' : ''}${OT.esc(sc.name)}${isTerm ? '</b>' : ''}`, {
        permanent: true, direction: 'right', offset: isTerm ? [10, 0] : [8, 0],
        className: 'stop-label' + (isTerm ? ' terminus' : ''),
      });
      m.on('click', () => selectStop(sc.id));
      stopMarkers.set(sc.id, m);
    });
    document.getElementById('route-name').textContent = `${st.route.shortCode} · ${st.route.name}`;
    map.fitBounds(L.latLngBounds(geo.path), { padding: [26, 26] });
  }

  function updateTraffic(st) {
    if (!st.route.traffic) return;
    const cols = themeColors().traffic;
    for (const seg of st.route.traffic) {
      const line = segLines[seg.i];
      if (!line) continue;
      line.setStyle({ color: cols[seg.level], weight: 3.5 + seg.level });
      line.setTooltipContent(`สภาพจราจร: ${TRAFFIC_LABELS[seg.level]} · ความเร็วเฉลี่ยจริงช่วงนี้ ~${seg.kmh} กม./ชม.`);
    }
  }

  function selectStop(id) {
    selectedStop = id;
    localStorage.setItem('ot-stop', id);
    stopAC.syncLabel();
    renderAll(OT.state);
    const sc = OT.state?.route?.stopCoords.find((s) => s.id === id);
    if (sc) map.panTo([sc.lat, sc.lng], { animate: true, duration: 0.6 });
  }

  // ── สมการ 1-3: พยากรณ์ไหลสะสมรายป้าย (จากข้อมูลสดที่เอนจินคำนวณให้รายคัน) ──
  function predAt(bus, stopId) {
    return (bus.prop || []).find((p) => p.id === stopId) || null;
  }
  function predLevelOf(model, n) {
    if (n == null) return -1;
    return n < model.seats ? 0 : n < model.seats + 0.65 * model.standing ? 1 : 2;
  }
  /** ไทม์ไลน์ป้ายระหว่างทางจากตำแหน่งรถถึงป้ายเป้าหมาย (รวมป้ายเป้าหมาย) */
  function loadTimeline(bus, stopId) {
    const prop = bus.prop || [];
    const ti = prop.findIndex((p) => p.id === stopId);
    return ti < 0 ? null : prop.slice(0, ti + 1);
  }
  /** สมการ 2: แตกตัวเวลาเป็น "วิ่งบนถนน + จอดรับ-ส่งรายป้าย" */
  function etaBreakdown(tl) {
    if (!tl || !tl.length) return null;
    const runMin = Math.max(1, Math.round(tl.reduce((a, c) => a + c.run, 0) / 60));
    const dwellMin = Math.max(0, +(tl.slice(0, -1).reduce((a, c) => a + c.dwell, 0) / 60).toFixed(1));
    const stops = Math.max(0, tl.length - 1);
    return { runMin, dwellMin, stops };
  }

  // ── ETA ──────────────────────────────────────────────────────────────────
  function busEtaToStop(st, bus, stopId) {
    if (bus.state === 'terminal' || bus.state === 'out') return null;
    const stopS = st.route.stopS[stopId];
    const dist = bus.dir === 1 ? stopS - bus.s : bus.s - stopS;
    if (dist <= 5) return null;
    const kmh = Math.max(6, bus.speedKmh || 15);
    let eta = (dist / 1000) / kmh * 3600;
    let stopsBetween = 0;
    for (const sc of st.route.stopCoords) {
      const sStop = st.route.stopS[sc.id];
      const d = bus.dir === 1 ? sStop - bus.s : bus.s - sStop;
      if (d > 5 && ((bus.dir === 1 && sStop < stopS) || (bus.dir === -1 && sStop > stopS))) stopsBetween++;
    }
    eta += stopsBetween * 25;
    const live = st.modelRelease === 'live' && bus.gpsOk;
    const low = Math.max(0, eta - (live ? eta * 0.10 + 20 : eta * 0.18 + 45));
    const high = eta + (live ? eta * 0.14 + 40 : eta * 0.32 + 90);
    return { low: Math.round(low), high: Math.round(high), live };
  }
  function approachingBuses(st, stopId, dir, limit, requireGps) {
    let list = st.ai.buses
      .map((b) => ({ b, eta: busEtaToStop(st, b, stopId) }))
      .filter((x) => x.eta && x.b.dir === dir);
    if (requireGps) {
      const fresh = list.filter((x) => x.b.gpsOk);
      if (fresh.length) list = fresh; // มีรถสถานะสด → ตัดคันที่ GPS ขาดช่วงออกตามกฎ 90 วินาที
    }
    return list.sort((a, z) => a.eta.low - z.eta.low).slice(0, limit);
  }

  // ── การ์ดเวลารถมาถึง ─────────────────────────────────────────────────────
  function renderArrival(st) {
    const box = document.getElementById('arrival-box');
    const degraded = st.degraded || st.ai.degradedFeed;
    document.querySelectorAll('#dir-tabs [data-dir]').forEach((b) => {
      const on = parseInt(b.dataset.dir) === selectedDir;
      b.classList.toggle('primary', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (degraded) {
      box.innerHTML = `
        <div class="arrival-card is-unknown">
          ${stopPhotoHTML(selectedStop)}
          <div class="ac-dir">ทิศ${OT.dirShort(selectedDir)} · ขณะนี้ไม่มีข้อมูลสด</div>
          <div class="ac-big">ตามรอบ<small>เวลา</small></div>
          <div class="ac-sub">ระบบถอนเวลาคาดการณ์สดออกแล้ว โปรดใช้ตารางเดินรถมาตรฐานด้านล่าง และฟังประกาศจากเจ้าหน้าที่ — จะไม่แสดงเวลาปลอม</div>
          ${OT.crowdMeter(null, null)}
        </div>`;
      document.getElementById('next-list').innerHTML = '';
      return;
    }
    const list = approachingBuses(st, selectedStop, selectedDir, 3, true);
    if (!list.length) {
      box.innerHTML = `
        <div class="arrival-card is-unknown">
          ${stopPhotoHTML(selectedStop)}
          <div class="ac-dir">ทิศ${OT.dirShort(selectedDir)}</div>
          <div class="ac-big">รอ<small>เที่ยวถัดไป</small></div>
          <div class="ac-sub">ยังไม่มีรถใกล้ป้ายนี้ในช่วงนี้ — ดูตารางเดินรถมาตรฐานด้านล่าง</div>
          ${OT.crowdMeter(null, null)}
        </div>`;
      document.getElementById('next-list').innerHTML = '';
      return;
    }
    const { b, eta } = list[0];
    const crowd = b.crowding || { level: -1 };
    const stale = !b.gpsOk;
    const minLow = Math.max(1, Math.round(eta.low / 60));
    const minHigh = Math.max(minLow + 1, Math.round(eta.high / 60));
    const info = BUS_TYPE_INFO[b.model.id] || { name: b.model.name, fare: 'ตามประกาศ' };
    // สมการ 1+3: เทียบคนบนรถขณะนี้ กับคาดการณ์เมื่อมาถึงป้ายที่ผู้โดยสารเลือก
    const pred = predAt(b, selectedStop);
    const predLevel = pred ? predLevelOf(b.model, pred.N) : -1;
    const tl = stale ? null : loadTimeline(b, selectedStop);
    const brk = etaBreakdown(tl);
    /** (ข้อ 3) กรอบ "ดูที่มาตัวเลขจากสมการ" — แสดงตัวเลขจริงของคันนั้นแบบกางดูได้ */
  function mathBreakdown(bus, crowd, pred, brk, eta) {
    if (!pred) return '';
    const nNow = (crowd.onboardEst != null) ? crowd.onboardEst : pred.N;
    const sigNow = bus.sigma || 0;
    const net = pred.N - nNow; // สุทธิระหว่างทาง = Σ B_hat − Σ A_hat
    const netTxt = `${net >= 0 ? '+' : ''}${net} คน${brk ? ` (จาก ${brk.stops} ป้ายระหว่างทาง)` : ''}`;
    let etaEq = '';
    if (brk && eta) {
      const midMin = +(((eta.low + eta.high) / 2) / 60).toFixed(1);
      const signalMin = Math.max(0, +(midMin - brk.runMin - brk.dwellMin).toFixed(1));
      etaEq = `
      <div class="mb-eq">สมการเวลาถึง (Coupled ETA): วิ่งตามความเร็วจริง + จอดรับ-ส่ง + ชะลอแยกสัญญาณ = เวลารวม</div>
      <div class="mb-num">~${brk.runMin} นาที + ~${brk.dwellMin} นาที (${brk.stops} ป้าย) + ~${signalMin} นาที ≈ <b>${minLow}–${minHigh} นาที</b></div>`;
    }
    return `<details class="math-box">
      <summary>ดูที่มาตัวเลขจากสมการ (Explainable Math Breakdown)</summary>
      <div class="mb-eq">สมการคนบนรถเมื่อถึงป้ายคุณ: คนบนรถตอนนี้ (N_k) − คาดลงระหว่างทาง (Σ A_hat) + คาดขึ้นระหว่างทาง (Σ B_hat) = คาดเมื่อถึงป้ายคุณ (N_hat_m ± σ)</div>
      <div class="mb-num"><b>${nNow}${sigNow ? ' ± ' + sigNow : ''} คน</b> − Σ A_hat + Σ B_hat (สุทธิ ${netTxt}) = <b>${pred.N} ± ${pred.sig} คน</b></div>
      ${etaEq}
      <div class="mb-note">ตัวเลขจากเอนจินจำลองสด (สมการไหลสะสมรายป้าย + ETA คูณขวักไขว่ · สมการที่ 1-2) — σ คือความไม่แน่นอนสะสมจากกล้อง AI มุมสูงเหนือประตู (Edge Vision) และการพยากรณ์ล่วงหน้า</div>
    </details>`;
  }

  // ── ผู้ช่วยตัดสินใจ "ขึ้นคันนี้เลย หรือรอคันถัดไป" — ใช้พยากรณ์ไหลสะสม (สมการที่ 1) เทียบสองคัน
    //    นี่คือของที่ Google Maps / viaBus / ThaiSmileBus ไม่มี: แนะนำการขึ้นรถจากความแน่นพยากรณ์จริง ──
    const pack2 = list[1] || null;
    const pred2 = pack2 ? predAt(pack2.b, selectedStop) : null;
    function boardAdvice() {
      if (stale || !pred) return '';
      if (pred.pu >= 40 && pack2 && pred2) {
        const waitMin = Math.max(1, Math.round((pack2.eta.low - eta.low) / 60));
        if (waitMin <= 12 && pred2.N + 6 <= pred.N) {
          return `<div class="board-advisor wait" role="note">
            <div class="ba-title">${OT.icon('scale')} ผู้ช่วยตัดสินใจ · แนะนำให้รอ</div>
            <div class="ba-body">คัน <b>${OT.esc(b.id)}</b> เสี่ยงขึ้นไม่ได้ <b>${pred.pu}%</b> (คาดแน่น ${pred.N}±${pred.sig} คน) — ส่วนคัน <b>${OT.esc(pack2.b.id)}</b> อีก ~${waitMin} นาที คาดว่างกว่า (${pred2.N}±${pred2.sig} คน · เสี่ยง ${pred2.pu}%) — ถ้าไม่รีบ รอคันถัดไปสบายกว่า</div>
          </div>`;
        }
      }
      if (pred.pu <= 20) {
        return `<div class="board-advisor ok" role="note">
          <div class="ba-title">${OT.icon('check')} ขึ้นคันนี้ได้สบาย</div>
          <div class="ba-body">เสี่ยงขึ้นไม่ได้เพียง ${pred.pu}% — คาดว่าคันนี้จะมี ${pred.N}±${pred.sig} คนตอนถึงป้ายของคุณ (ความจุตามกฎหมาย ${b.model.legalMax} คน)</div>
        </div>`;
      }
      return '';
    }
    const advisor = boardAdvice();
    const cmp = (!stale && pred) ? `
      <div class="load-cmp">
        <div class="lc-cell"><span class="lc-label">คนบนรถขณะนี้</span><span class="lc-value">${crowd.onboardEst ?? '–'}${b.sigma ? ' ± ' + b.sigma : ''} <small>คน</small></span></div>
        <div class="lc-arrow">${OT.icon('route')}</div>
        <div class="lc-cell lc-target"><span class="lc-label">คาดเมื่อถึงป้ายคุณ</span><span class="lc-value">${pred.N} ± ${pred.sig} <small>คน</small></span></div>
        <div class="chip ${pred.pu >= 50 ? 'fail' : pred.pu >= 20 ? 'warn' : 'pass'}"><span class="ico-dot"></span>โอกาสขึ้นไม่ได้ ${pred.pu}%</div>
      </div>` : '';
    const timeline = (tl && tl.length > 1) ? `
      <div class="load-timeline" role="list" aria-label="ป้ายระหว่างทางและคาดการณ์คนขึ้น-ลง">
        ${tl.map((p, i) => {
          const sc = (OT.state?.route?.stopCoords || []).find((s) => s.id === p.id);
          const delta = p.n - p.N; // การเปลี่ยนแปลงสุทธิที่ป้ายนี้ = คนขึ้น − คนลง (N_hat หลังออก − ตอนถึง)
          const last = i === tl.length - 1;
          const shortName = last ? 'ป้ายคุณ' : OT.esc((sc?.name || p.id).split(/[/–]/)[0]);
          return `<span role="listitem" class="lt-node ${last ? 'lt-target' : ''}" title="${OT.esc(sc?.name || p.id)} — คาด ${p.N} คนตอนถึง · จอด ~${p.dwell} วิ${p.pu >= 20 ? ` · เสี่ยงขึ้นไม่ได้ ${p.pu}%` : ''}">
            <span class="lt-name">${shortName}</span>
            <span class="lt-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : ''}${delta}</span>
          </span>`;
        }).join(`<span class="lt-sep">${OT.icon('route')}</span>`)}
      </div>` : '';
    box.innerHTML = `
      <div class="arrival-card ${stale ? 'is-unknown' : ''}">
        ${stopPhotoHTML(selectedStop)}
        <div class="ac-dir">${OT.icon('clock')} ทิศ${OT.dirShort(selectedDir)} · คัน ${OT.esc(b.id)} · ${OT.esc(b.model.name)}</div>
        <div class="ac-actions">
          <button class="btn small ${followBusId === b.id ? '' : 'primary'}" data-follow="${OT.esc(b.id)}">${followBusId === b.id ? OT.icon('check') + ' กำลังติดตามคันนี้' : OT.icon('target') + ' ติดตามรถคันนี้'}</button>
          <button class="btn small ghost" data-share title="คัดลอกลิงก์เปิดป้ายนี้">${OT.icon('megaphone')} แชร์ป้ายนี้</button>
        </div>
        ${stale
          ? `<div class="ac-big">อิงรอบ<small>เวลา</small></div>
             <div class="ac-sub">ข้อมูลพิกัดคันนี้ขาดช่วงเกิน 90 วินาที — ระบบปลดสถานะสดแล้ว ใช้ตารางเดินรถด้านล่างแทน (จะไม่แสดงเวลาปลอม)</div>`
          : `<div class="ac-big">อีก ${minLow}<small>นาที</small></div>
             <div class="ac-sub">คาดการณ์ถึงป้าย ${OT.etaRange(st.ai.tSec, eta.low, eta.high)} (ช่วง ${minLow}–${minHigh} นาที)${brk ? ` · แตกตัวเวลา: วิ่งบนถนน ~${brk.runMin} นาที + จอดรับ-ส่ง ${brk.stops} ป้าย (≈ ${brk.dwellMin} นาที)` : ''} · ไม่รับประกันที่นั่ง</div>`}
        ${cmp}
        ${advisor}
        ${timeline}
        ${mathBreakdown(b, crowd, pred, brk, eta)}
        ${OT.crowdMeter(predLevel >= 0 ? { level: predLevel, sourceLabel: 'พยากรณ์ไหลสะสมรายป้าย (สมการที่ 1)' } : crowd, pred && predLevel >= 0 ? null : crowd.onboardEst)}
        <div class="bustype active mt">
          ${busIllustration(b.model.id, 108)}
          <div><div class="bt-name">${OT.esc(info.name)}</div><div class="bt-fare">ค่าโดยสาร ${OT.esc(info.fare)} · จ่ายบนรถตามช่องทางเดิม</div></div>
        </div>
      </div>`;
    document.getElementById('next-list').innerHTML = list.slice(1).map(({ b: bb, eta: e2 }) => {
      const c2 = bb.crowding || { level: -1 };
      const info2 = BUS_TYPE_INFO[bb.model.id] || { name: bb.model.name, fare: '' };
      const p2 = predAt(bb, selectedStop);
      const aw2 = stopsAway(bb, selectedStop);
      return `<div class="bustype mt ${followBusId === bb.id ? 'followed' : ''}">
        ${busIllustration(bb.model.id, 84)}
        <div class="grow"><div class="bt-name">คัน ${OT.esc(bb.id)} · ${OT.esc(info2.name)}${aw2 != null ? ` <span class="muted">· อีก ${aw2} ป้าย</span>` : ''}</div>
        <div class="bt-fare">อีก ~${Math.max(1, Math.round(e2.low / 60))} นาที · ${OT.esc(fareFor(bb.model.id))}${p2 ? ` · คาด ${p2.N} ± ${p2.sig} คนเมื่อถึงป้ายคุณ` : ''}</div>
        ${p2 ? `<span class="chip ${p2.pu >= 50 ? 'fail' : p2.pu >= 20 ? 'warn' : 'pass'}" style="margin-top:5px;"><span class="ico-dot"></span>เสี่ยงขึ้นไม่ได้ ${p2.pu}%</span>` : ''}</div>
        <div class="bt-meter">${OT.crowdMeter(c2, c2.onboardEst)}</div>
        <button class="btn small" data-follow="${OT.esc(bb.id)}">${followBusId === bb.id ? OT.icon('check') + ' ติดตามอยู่' : 'ติดตาม'}</button>
      </div>`;
    }).join('');
  }

  // ── วางแผนการเดินทาง ─────────────────────────────────────────────────────
  function computeTrip(st) {
    const order = st.route.stopCoords;
    const iFrom = order.findIndex((s) => s.id === fromId);
    const iTo = order.findIndex((s) => s.id === toId);
    if (iFrom < 0 || iTo < 0) return { error: 'กรุณาเลือกป้ายต้นทางและปลายทางจากรายการ' };
    if (iFrom === iTo) return { error: 'ต้นทางและปลายทางเป็นป้ายเดียวกัน กรุณาเลือกป้ายต่างกัน' };
    const dir = iTo > iFrom ? 1 : -1;
    const distKm = Math.abs(st.route.stopS[toId] - st.route.stopS[fromId]) / 1000;
    const buses = approachingBuses(st, fromId, dir, 3, true);
    if (!buses.length) return { error: 'ขณะนี้ยังไม่มีรถสถานะสดใกล้ต้นทางทิศนี้ ลองดูตารางเดินรถหรือรอสักครู่' };
    const options = buses.map(({ b, eta }) => {
      const stopsBetween = Math.abs(iTo - iFrom) - 1;
      // สมการ 1+2: เวลาโดยสารจริงจากพยากรณ์ไหลสะสมของคันเดียวกัน (ETA คูณขวักไขว่) — ถ้าไม่มีข้อมูลใช้สูตรประมาณ
      const tl = loadTimeline(b, toId);
      const fi = tl ? tl.findIndex((p) => p.id === fromId) : -1;
      const seg = tl && fi >= 0 ? tl.slice(fi) : null;
      const pFrom = seg ? seg[0] : null, pTo = tl ? tl[tl.length - 1] : null;
      let rideMin, breakdown = null;
      if (pFrom && pTo && pTo.eta >= pFrom.eta) {
        rideMin = (pTo.eta - pFrom.eta) / 60;
        breakdown = etaBreakdown(seg) || { runMin: Math.round(rideMin), dwellMin: 0, stops: stopsBetween };
      } else {
        const kmh = Math.max(7, b.speedKmh || 16);
        rideMin = (distKm / kmh) * 60 + stopsBetween * 0.5;
      }
      return { b, eta, rideMin, fare: fareFor(b.model.id, distKm), stopsBetween, breakdown };
    });
    const first = options[0];
    return {
      dir, distKm, options, first,
      waitMin: [Math.max(1, Math.round(first.eta.low / 60)), Math.max(2, Math.round(first.eta.high / 60))],
      totalMin: [Math.max(1, Math.round(first.eta.low / 60) + Math.round(first.rideMin * 0.92)), Math.max(2, Math.round(first.eta.high / 60) + Math.round(first.rideMin * 1.15))],
    };
  }

  function renderTripResult(st) {
    const box = document.getElementById('trip-result');
    const r = computeTrip(st);
    if (r.error) { box.innerHTML = `<div class="banner info">${OT.icon('info')}<div>${OT.esc(r.error)}</div></div>`; return; }
    const fromName = st.route.stopCoords.find((s) => s.id === fromId).name;
    const toName = st.route.stopCoords.find((s) => s.id === toId).name;
    const info = BUS_TYPE_INFO[r.first.b.model.id] || { name: r.first.b.model.name, fare: '' };
    box.innerHTML = `
      <div class="flex spread mb-sm">
        <strong style="font-size:0.9rem;">${OT.esc(fromName)} ไป ${OT.esc(toName)}</strong>
        <span class="chip">${OT.icon('route')}${r.distKm.toFixed(1)} กม. · ${OT.dirShort(r.dir)}</span>
      </div>
      <div class="arrival-card">
        <div class="ac-dir">${OT.icon('clock')} คัน ${OT.esc(r.first.b.id)} · ${OT.esc(info.name)}</div>
        <div class="ac-big">${r.totalMin[0]}–${r.totalMin[1]}<small>นาที ถึงปลายทาง</small></div>
        <div class="ac-sub">${r.first.breakdown
          ? `รอคันถัดไป ${r.waitMin[0]}–${r.waitMin[1]} นาที + เวลารวมบนรถเกิดจาก: วิ่งบนถนน ~${r.first.breakdown.runMin} นาที + จอดรับคนระหว่างทาง ${r.first.breakdown.stops} ป้าย (ประมาณ ${r.first.breakdown.dwellMin} นาที)`
          : `รอคันถัดไป ${r.waitMin[0]}–${r.waitMin[1]} นาที + เดินทางบนรถ ~${Math.round(r.first.rideMin)} นาที (จอดรับระหว่างทาง ${r.first.stopsBetween} ป้าย)`}</div>
        ${OT.crowdMeter(r.first.b.crowding || null, (r.first.b.crowding || {}).onboardEst)}
      </div>
      <div class="bustype active mt">
        ${busIllustration(r.first.b.model.id, 100)}
        <div><div class="bt-name">ค่าโดยสาร ${OT.esc(r.first.fare)}</div><div class="bt-fare">${OT.esc(info.fare)} · จ่ายบนรถ ไม่ต้องจอง ไม่มีมัดจำ</div></div>
      </div>
      <p class="hint">ระดับความแน่นอาจเปลี่ยนตามจริงระหว่างทาง — แสดงเป็น "ช่วงคาดการณ์" ตามพิมพ์เขียว</p>`;
  }

  // ── ผังที่นั่งเรียลไทม์ (สเปก: ครีมแดง 34 / แอร์ฟ้า 28 / EV 31 + จุดวีลแชร์) ──
  function seatLayoutSVG(model, onboard) {
    const seats = model.seats, standing = model.standing;
    const onb = onboard == null ? 0 : onboard;
    const seated = Math.min(onb, seats);
    const standers = Math.min(Math.max(0, onb - seated), standing);
    const nRows = Math.floor(seats / 4);
    const rearExtra = seats % 4;
    const pitch = 266 / (nRows + 2.2);
    let seatSvgs = '';
    let seatIdx = 0;
    for (let r = nRows - 1; r >= 0; r--) {
      const x = 66 + r * pitch;
      for (const cy of [92, 78, 42, 28]) {
        const occ = seatIdx < seated;
        seatSvgs += `<rect x="${x}" y="${cy}" width="9" height="11" rx="2.5" fill="${occ ? 'var(--accent)' : 'var(--accent-wash)'}" stroke="var(--line)" stroke-width="0.5"><title>ที่นั่งที่ ${seats - seatIdx}${occ ? ' — มีคนนั่ง' : ' — ว่าง'}</title></rect>`;
        seatIdx++;
      }
    }
    for (let k = 0; k < rearExtra; k++) {
      const occ = seatIdx < seated;
      seatSvgs += `<rect x="${248 + k * 10}" y="${k % 2 ? 28 : 78}" width="9" height="11" rx="2.5" fill="${occ ? 'var(--accent)' : 'var(--accent-wash)'}" stroke="var(--line)" stroke-width="0.5"><title>เบาะท้าย${occ ? ' — มีคนนั่ง' : ' — ว่าง'}</title></rect>`;
      seatIdx++;
    }
    let standDots = '';
    for (let k = 0; k < Math.min(standers, 10); k++) {
      standDots += `<circle cx="${74 + k * 17}" cy="${62 + (k % 2) * 3}" r="4" fill="var(--warn-fill)" stroke="var(--surface-1)" stroke-width="1"><title>ผู้ยืน</title></circle>`;
    }
    const wcBay = model.wheelchair
      ? `<rect x="36" y="40" width="22" height="24" rx="4" fill="var(--ok-wash)" stroke="var(--ok)" stroke-width="1.4"/>
         <text x="47" y="56" text-anchor="middle" font-size="11" fill="var(--ok)" font-weight="700">วีล</text>
         <text x="47" y="72" text-anchor="middle" font-size="7.5" fill="var(--ok)">จุดวีลแชร์</text>`
      : '';
    return `
      <svg viewBox="0 0 280 124" width="100%" role="img" aria-label="ผังที่นั่งเรียลไทม์: มีคนนั่ง ${seated} จาก ${seats} ที่นั่ง ยืน ${standers} จาก ${standing} ที่" style="max-width:310px; display:block; margin:4px auto 0;">
        <rect x="6" y="14" width="268" height="98" rx="16" fill="none" stroke="var(--ink-2)" stroke-width="2"/>
        <rect x="18" y="24" width="26" height="18" rx="4" fill="var(--grid)" stroke="var(--line)"/>
        <text x="31" y="37" text-anchor="middle" font-size="10" fill="var(--ink-2)">คนขับ</text>
        ${wcBay}
        ${seatSvgs}${standDots}
        ${standers > 10 ? `<text x="${74 + 10 * 17}" y="65" font-size="11" font-weight="600" fill="var(--ink-2)">+${standers - 10}</text>` : ''}
        <rect x="40" y="112" width="9" height="9" rx="2" fill="var(--accent)"/>
        <text x="53" y="119" font-size="9.5" fill="var(--ink-2)">นั่ง ${seated}/${seats}</text>
        <circle cx="136" cy="116" r="4" fill="var(--warn-fill)"/>
        <text x="144" y="119" font-size="9.5" fill="var(--ink-2)">ยืน ${standers} คน</text>
        <rect x="206" y="110" width="9" height="9" rx="2" fill="var(--accent-wash)" stroke="var(--line)"/>
        <text x="219" y="119" font-size="9.5" fill="var(--ink-2)">ว่าง ${Math.max(0, seats - seated)}</text>
      </svg>`;
  }

  // ── Drawer ข้อมูลสดตัวรถ ─────────────────────────────────────────────────
  function openBusDrawer(busId) {
    selectedBusId = busId;
    const b = OT.state?.ai.buses.find((x) => x.id === busId);
    if (!b) return;
    // แพนแผนที่อย่างนุ่มนวลไปยังตำแหน่งรถ
    map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 14), { duration: 0.85, easeLinearity: 0.18 });
    document.getElementById('bus-drawer').classList.add('open');
    document.getElementById('bus-drawer').setAttribute('aria-hidden', 'false');
    document.getElementById('drawer-scrim').hidden = false;
    renderDrawer(OT.state);
  }
  function closeBusDrawer() {
    selectedBusId = null;
    document.getElementById('bus-drawer').classList.remove('open');
    document.getElementById('bus-drawer').setAttribute('aria-hidden', 'true');
    document.getElementById('drawer-scrim').hidden = true;
  }
  function renderDrawer(st) {
    if (!selectedBusId || !st || st.degraded) return;
    const b = st.ai.buses.find((x) => x.id === selectedBusId);
    if (!b) { closeBusDrawer(); return; }
    const crowd = b.crowding || { level: -1 };
    document.getElementById('bd-title').textContent = `คัน ${b.id} · ${b.model.name}`;
    document.getElementById('bd-sub').textContent = `${OT.dirName(b.dir)} · เที่ยวที่ ${b.tripNo}`;
    const simple = OT.crowdSimple(crowd.level);
    document.getElementById('bd-body').innerHTML = `
      ${OT.crowdBadge(crowd, true)}
      <div class="telemetry">
        <div class="t-box"><div class="t-label">ความเร็วสด</div><div class="t-value">${b.speedKmh} <small>กม./ชม.</small></div></div>
        <div class="t-box"><div class="t-label">ทิศทาง</div><div class="t-value" style="font-size:0.95rem;">${OT.compass(b.bearing)} <small>${b.bearing}°</small></div></div>
        <div class="t-box"><div class="t-label">อัปเดตพิกัด</div><div class="t-value" style="font-size:0.95rem;">${b.lastFixSecAgo} <small>วินาทีที่แล้ว${b.gpsOk ? '' : ' — ขาดช่วง'}</small></div></div>
        <div class="t-box"><div class="t-label">ผู้ขับ (รหัส)</div><div class="t-value" style="font-size:0.95rem;">${OT.esc(b.driver)} <small>ขับสะสม ${(b.driveMin / 60).toFixed(1)} ชม.</small></div></div>
      </div>
      ${OT.crowdMeter(crowd, crowd.onboardEst)}
      <h3 style="margin:14px 0 2px; font-size:0.9rem;">ผังที่นั่งเรียลไทม์ (ตามสเปกรุ่น)</h3>
      ${seatLayoutSVG(b.model, crowd.onboardEst)}
      <p class="hint" style="margin-top:6px;">ป้ายถัดไป: ${OT.esc(b.nextStopName)} · คนบนรถโดยประมาณ ${crowd.onboardEst === null ? 'ไม่มีข้อมูล' : crowd.onboardEst + (b.sigma ? ' ± ' + b.sigma : '') + ' คน'}${crowd.sourceLabel ? ' · ' + OT.esc(crowd.sourceLabel) : ''} · ± คือความไม่แน่นอนสะสมตามจำนวนป้ายที่อ่านจากกล้อง AI มุมสูงเหนือประตู (Edge Vision) + สมการพยากรณ์ล่วงหน้า · ไม่รับประกันที่นั่ง และไม่มีระบบจอง</p>`;
  }

  // ── หมุดรถ ───────────────────────────────────────────────────────────────
  function busColor(b) { return (b.crowding && b.crowding.level >= 0) ? themeColors().bus[b.crowding.level] : themeColors().neutral; }
  function updateBusMarkers(st) {
    const degraded = st.degraded || !st.ai.buses.length;
    document.getElementById('live-ind').style.opacity = degraded ? 0.35 : 1;
    if (degraded) {
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      return;
    }
    const meta = document.getElementById('map-meta');
    if (meta) meta.textContent = degraded
      ? 'ข้อมูลสดขัดข้อง — แสดงตารางเดินรถแทน'
      : `รถวิ่ง ${st.ai.buses.length} คัน · ป้าย ${st.route.stopCoords.length} จุด · สายนำร่อง 1`;
    const seen = new Set();
    for (const b of st.ai.buses) {
      seen.add(b.id);
      let m = markers.get(b.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'bus-marker';
        el.innerHTML = `<div class="rot"><div class="arrow" aria-hidden="true"></div><div class="bub">${OT.icon('bus')}</div></div><div class="bus-tag">${OT.esc(b.id)} · ${OT.dirShort(b.dir)}</div>`;
        const marker = L.marker([b.lat, b.lng], { icon: L.divIcon({ className: '', html: el, iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 500, keyboard: true });
        m = {
          marker, el, id: b.id,
          rot: el.querySelector('.rot'), bub: el.querySelector('.bub'), arrow: el.querySelector('.arrow'),
          cur: { lat: b.lat, lng: b.lng, brg: b.bearing || 0 },
          target: { lat: b.lat, lng: b.lng, brg: b.bearing || 0 },
        };
        marker.on('click', () => openBusDrawer(b.id));
        marker.addTo(busLayer);
        markers.set(b.id, m);
      }
      m.target = { lat: b.lat, lng: b.lng, brg: b.bearing || 0 };
      const col = busColor(b);
      m.bub.style.background = col;
      const dirFull = OT.dirName(b.dir); // "จตุจักร ไป หัวลำโพง" / "หัวลำโพง ไป จตุจักร"
      m.bub.title = `คัน ${b.id} — ${OT.dirShort(b.dir)} (${dirFull}) — คลิกเพื่อดูข้อมูลสด`;
      m.marker.bindTooltip(`คัน <b>${OT.esc(b.id)}</b> · ${OT.dirShort(b.dir)} — ${OT.esc(dirFull)}<br><span class="muted">คลิกเพื่อดูผังตัวรถและจำนวนคนสด</span>`, { direction: 'top', offset: [0, -20] });
      m.arrow.style.borderBottomColor = col;
    }
    for (const [id, m] of markers) if (!seen.has(id)) { m.marker.remove(); markers.delete(id); }
  }

  let lastFrame = performance.now();
  function animateMarkers(now) {
    const dt = Math.min(0.12, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    const k = 1 - Math.pow(0.0015, dt);
    for (const m of markers.values()) {
      m.cur.lat += (m.target.lat - m.cur.lat) * k;
      m.cur.lng += (m.target.lng - m.cur.lng) * k;
      const d = ((m.target.brg - m.cur.brg + 540) % 360) - 180;
      m.cur.brg = (m.cur.brg + d * k + 360) % 360;
      m.marker.setLatLng([m.cur.lat, m.cur.lng]);
      m.rot.style.transform = `rotate(${m.cur.brg.toFixed(1)}deg)`;
    }
    requestAnimationFrame(animateMarkers);
  }
  function refreshThemeColors() {
    for (const [i, line] of segLines.entries()) {
      const lvl = OT.state?.route?.traffic?.[i]?.level ?? 1;
      line.setStyle({ color: themeColors().traffic[lvl] });
    }
    if (routeLine) routeLine.setStyle({ color: themeColors().casing });
    if (flowLine) flowLine.setStyle({ color: document.documentElement.dataset.theme === 'dark' ? '#6a9aef' : '#1c5cc8' });
    for (const [busId, m] of markers) {
      const lv = OT.state?.ai?.buses.find((b) => b.id === busId)?.crowding?.level ?? -1;
      const col = lv >= 0 ? themeColors().bus[lv] : themeColors().neutral;
      m.bub.style.background = col;
      m.arrow.style.borderBottomColor = col;
    }
  }

  // ── แจ้งเตือน + ตาราง ─────────────────────────────────────────────────────
  function renderAlerts(st) {
    const area = document.getElementById('alert-area');
    const alerts = [];
    if (st.degraded) alerts.push(['crit', 'ระบบข้อมูลสดขัดข้องชั่วคราว — ถอนเวลาคาดการณ์สดออกแล้ว แสดงตารางเดินรถมาตรฐานพร้อมแจ้งเหตุ']);
    for (const inc of (st.ai.incidents || []).slice(-2).reverse()) {
      if (inc.level === 'info') continue;
      alerts.push([inc.level === 'serious' ? 'crit' : 'warn', `${inc.t} น. — ${OT.esc(inc.msg)}`]);
    }
    if (st.rain) alerts.push(['info', 'สภาพฝนตก (จำลอง): รถวิ่งช้าลง เวลาถึงอาจคลาดเคลื่อนเพิ่ม']);
    if (st.rush) alerts.push(['info', 'ชั่วโมงเร่งด่วน (จำลอง): ความต้องการเดินทางและการจราจรสูง']);
    area.innerHTML = alerts.slice(0, 2).map(([cls, msg]) => `<div class="banner ${cls}">${OT.icon(cls === 'crit' ? 'alert' : 'info')}<div>${msg}</div></div>`).join('');
  }

  function renderSchedule(st) {
    const box = document.getElementById('schedule-box');
    if (!timetable) { box.innerHTML = '<p class="muted small">กำลังโหลดตาราง…</p>'; return; }
    const degraded = st.degraded;
    const dirKey = selectedDir === 1 ? 'fwd' : 'rev';
    const rows = (timetable.table[dirKey] || {})[selectedStop] || [];
    const now = st.ai.tSec;
    const next = rows.filter((m) => m * 60 >= now - 60).slice(0, degraded ? 8 : 4);
    const upcoming = next.length ? next : rows.slice(0, 4);
    const dirLabel = OT.dirName(selectedDir);
    box.innerHTML = `
      ${degraded ? '<div class="banner warn">' + OT.icon('alert') + '<div>ข้อมูลสดขาดช่วง — กำลังใช้ตารางเวลามาตรฐาน</div></div>' : ''}
      <table class="data" aria-label="ตารางเดินรถทิศ${OT.dirShort(selectedDir)}ที่ป้ายนี้">
        <thead><tr><th>${OT.esc(dirLabel)} · ผ่านป้ายนี้</th><th>หมายเหตุ</th></tr></thead>
        <tbody><tr><td class="num">${upcoming.map((m) => OT.simSecToClock(m * 60)).join(' · ')} น.</td><td class="muted small">ออกต้นสายทุก 8 นาที (06:00–22:00 น.)</td></tr></tbody>
      </table>
      <p class="hint">เป็น "ตารางเวลา" ไม่ใช่ข้อมูลสด ${degraded ? '' : '— ใช้เป็นแผนสำรองเมื่อข้อมูลสดขาดช่วง'}</p>`;
  }

  // ── บูต ──────────────────────────────────────────────────────────────────
  initMap();
  requestAnimationFrame(animateMarkers);
  fetch('/api/timetable').then((r) => r.json()).then((t) => { timetable = t; }).catch(() => {});

  let stopAC, fromAC, toAC;
  function stopOptions() {
    return (OT.state?.route?.stopCoords || []).map((s, i, arr) => ({
      id: s.id, label: s.name, sub: s.survey ? s.surveyLabel : (i === 0 ? 'ต้นสาย' : i === arr.length - 1 ? 'ปลายสาย' : ''),
    }));
  }
  function buildAutocompletes() {
    stopAC = makeAutocomplete(document.getElementById('stop-select'), document.getElementById('stop-ac-list'), {
      options: stopOptions,
      getId: () => selectedStop,
      setId: (id) => { selectedStop = id; localStorage.setItem('ot-stop', id); },
      onPick: () => selectStop(selectedStop),
    });
    fromAC = makeAutocomplete(document.getElementById('trip-from'), document.querySelector('#trip-planner .ac-search:nth-of-type(1) .ac-list'), {
      options: stopOptions,
      getId: () => fromId,
      setId: (id) => { fromId = id; },
      onPick: () => { if (document.getElementById('trip-result').dataset.filled && OT.state) renderTripResult(OT.state); },
    });
    toAC = makeAutocomplete(document.getElementById('trip-to'), document.querySelector('#trip-planner .ac-search:nth-of-type(2) .ac-list'), {
      options: stopOptions,
      getId: () => toId,
      setId: (id) => { toId = id; },
      onPick: () => { if (document.getElementById('trip-result').dataset.filled && OT.state) renderTripResult(OT.state); },
    });
    stopAC.syncLabel(); fromAC.syncLabel(); toAC.syncLabel();
  }

  document.getElementById('trip-btn').addEventListener('click', () => {
    document.getElementById('trip-result').dataset.filled = '1';
    if (OT.state) renderTripResult(OT.state);
  });
  document.getElementById('trip-swap').addEventListener('click', () => {
    [fromId, toId] = [toId, fromId];
    if (fromAC && toAC) { fromAC.syncLabel(); toAC.syncLabel(); }
    if (OT.state && document.getElementById('trip-result').dataset.filled) renderTripResult(OT.state);
  });
  document.getElementById('dir-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dir]');
    if (!btn) return;
    selectedDir = parseInt(btn.dataset.dir);
    renderAll(OT.state);
  });
  document.getElementById('btn-print-sched').addEventListener('click', () => window.print());
  // Passenger+: ปุ่มทั้งหมดใช้ delegation เพราะการ์ดถูกวาดใหม่ทุกวินาทีจากข้อมูลสด
  document.getElementById('arrival-box').addEventListener('click', (e) => {
    const f = e.target.closest('[data-follow]');
    if (f) { startFollow(fally(f)); return; }
    if (e.target.closest('[data-share]')) shareStop();
  });
  function fally(el) { const id = el.dataset.follow; return followBusId === id ? null : id; }
  function shareStop() {
    const url = `${location.origin}/?stop=${encodeURIComponent(selectedStop)}&dir=${selectedDir}`;
    if (navigator.share) navigator.share({ title: 'เวลารถถึงป้าย' + stopName(selectedStop), url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => alert('คัดลอกลิงก์ป้ายนี้แล้ว: ' + url)).catch(() => alert(url));
  }
  document.getElementById('next-list').addEventListener('click', (e) => {
    const f = e.target.closest('[data-follow]');
    if (f) { const id = f.dataset.follow; startFollow(followBusId === id ? null : id); }
  });
  document.getElementById('fav-row').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-fav]');
    if (chip) { selectStop(chip.dataset.fav); return; }
    if (e.target.closest('#btn-nearby')) nearby();
    if (e.target.closest('#btn-fav')) toggleFavorite(selectedStop);
  });
  document.getElementById('follow-bar').addEventListener('click', (e) => {
    if (e.target.closest('#btn-unfollow')) startFollow(null);
  });
  // (ข้อ 4) แถบควบคุมจำลองด่วนใต้แผนที่ — คำสั่งเดียวกับหน้า sim โดยไม่ต้องเปลี่ยนหน้า
  document.getElementById('quicksim').addEventListener('click', async (e) => {
    const qs = e.target.closest('[data-qs]');
    if (qs) {
      const kind = qs.dataset.qs;
      if (kind === 'gps') {
        qs.disabled = true;
        const oldTxt = qs.textContent;
        await OT.post('/api/control', { action: 'gps_out', busId: 'all' });
        qs.textContent = 'ส่งแล้ว — GPS ขาด 5 นาที (จำลอง)';
        setTimeout(() => { qs.textContent = oldTxt; qs.disabled = false; }, 2500);
      } else {
        const on = !(OT.state && OT.state[kind]);
        await OT.post('/api/control', { action: kind, value: on });
      }
      return;
    }
    const sp = e.target.closest('[data-speed]');
    if (sp) await OT.post('/api/control', { action: 'speed', value: parseInt(sp.dataset.speed) });
  });
  function updateQuickSim(st) {
    const bar = document.getElementById('quicksim');
    if (!bar) return;
    bar.querySelector('[data-qs="rain"]').classList.toggle('primary', !!st.rain);
    bar.querySelector('[data-qs="rain"]').setAttribute('aria-pressed', String(!!st.rain));
    bar.querySelector('[data-qs="rush"]').classList.toggle('primary', !!st.rush);
    bar.querySelector('[data-qs="rush"]').setAttribute('aria-pressed', String(!!st.rush));
    bar.querySelectorAll('[data-speed]').forEach((b) => {
      const on = parseInt(b.dataset.speed) === st.simSpeed;
      b.classList.toggle('primary', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  if (localStorage.getItem('ot-favs') === null) { favorites = ['S08']; localStorage.setItem('ot-favs', '["S08"]'); } // ตัวอย่างป้ายโปรดครั้งแรก (ยังไม่มี state — renderAll จะวาดเอง)
  document.getElementById('bd-close').addEventListener('click', closeBusDrawer);
  document.getElementById('drawer-scrim').addEventListener('click', closeBusDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBusDrawer(); });

  // ── คาดการณ์ความแน่นด้วย OpenAI จริง (/api/ai/predict-crowd) ──────────────
  const $ai = (id) => document.getElementById(id);
  let aiBusy = false;
  function renderAIError(msg, needsKey) {
    $ai('ai-body').innerHTML = `
      <div class="banner ${needsKey ? 'info' : 'warn'}">${OT.icon(needsKey ? 'info' : 'alert')}
      <div class="grow">${OT.esc(msg)}${needsKey ? '<br><span class="small muted">เปิดปุ่ม "เครื่องมือ" มุมขวาบน วาง OpenAI API Key แล้วบันทึก — หรือใส่ในไฟล์ .env ตาม .env.example</span>' : ''}</div></div>`;
  }
  async function fetchAIPrediction() {
    if (aiBusy || !OT.state || OT.state.degraded) return;
    aiBusy = true;
    const btn = $ai('ai-fetch');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังวิเคราะห์…'; }
    $ai('ai-body').innerHTML = '<p class="muted small">กำลังส่งบริบทการเดินทางสด (คนรอ จราจร ฝน ช่วงเวลา ระยะห่างรถ) ให้ OpenAI วิเคราะห์…</p>';
    const r = await OT.get(`/api/ai/predict-crowd?stopId=${encodeURIComponent(selectedStop)}&dir=${selectedDir}`);
    if (btn) { btn.disabled = false; btn.textContent = 'วิเคราะห์ตอนนี้'; }
    aiBusy = false;
    if (!r.ok) { renderAIError(r.error || 'เรียกโมเดลไม่สำเร็จ', !!r.needsKey); return; }
    const d = r.data;
    const levelNames = ['มีที่นั่งว่าง', 'มีที่ยืนสบาย', 'คนแน่นมาก'];
    const risk = d.pass_up_risk_percent;
    $ai('ai-body').innerHTML = `
      <div class="arrival-card">
        <div class="ac-dir">${OT.icon('flask')} ผลวิเคราะห์ AI · คัน ${OT.esc(d.bus_id)} (${OT.esc(d.model_name)}) → ป้าย${OT.esc(d.target_stop)}</div>
        <div class="ac-big">${d.predicted_passengers}<small>คน คาดการณ์เมื่อถึงป้าย</small></div>
        <div class="flex" style="gap:6px; margin-top:6px; flex-wrap:wrap;">
          <span class="chip">${OT.icon('users')} นั่ง ${d.seated_count} · ยืน ${d.standing_count}</span>
          <span class="chip ${d.crowding_level === 2 ? 'fail' : d.crowding_level === 1 ? 'warn' : 'pass'}"><span class="ico-dot"></span>${levelNames[d.crowding_level]}</span>
        </div>
        <div class="crowd-meter" data-level="${risk >= 60 ? 2 : risk >= 30 ? 1 : 0}" style="margin-top:10px;">
          <div class="cm-head"><span class="ico-dot"></span>ความเสี่ยงขึ้นไม่ได้ที่ป้ายนี้ ${risk}%</div>
          <div class="cm-track" role="img" aria-label="ความเสี่ยงขึ้นไม่ได้ ${risk}%"><div class="cm-fill" style="width:${risk}%; background:${risk >= 60 ? 'var(--crit-fill)' : risk >= 30 ? 'var(--warn-fill)' : 'var(--ok-fill)'};"></div></div>
        </div>
        <blockquote style="margin:12px 0 0; border-inline-start:4px solid var(--accent); padding-inline-start:12px; font-size:0.88rem; line-height:1.7;">${OT.esc(d.ai_reasoning_th)}</blockquote>
        <div class="ai-source ${d.predictor === 'local' ? 'local' : 'live'}">${OT.icon(d.predictor === 'local' ? 'target' : 'flask')}
          ${d.predictor === 'local'
            ? 'ประมวลผลด้วยเอนจินคณิตศาสตร์ 4 สมการ (สามารถใส่ OpenAI Key ในเมนู "เครื่องมือ" เพื่อใช้ LLM เสริมได้)'
            : 'วิเคราะห์สดด้วย OpenAI API · ' + OT.esc(d.ai_model)}
          · บริบทเวลาจำลอง ${OT.esc(d.context_clock)} น.${r.cached ? ' · แคช 45 วินาที' : ''} — ค่าคาดการณ์อ้างอิง ไม่รับประกันที่นั่ง</div>
      </div>`;
  }
  $ai('ai-fetch').addEventListener('click', fetchAIPrediction);
  OT.get('/api/ai/status').then((st) => {
    if (st && st.configured) setTimeout(fetchAIPrediction, 1500); // มี Key → วิเคราะห์ให้อัตโนมัติครั้งแรก
    else {
      $ai('ai-body').innerHTML = `
        <div class="banner info">${OT.icon('info')}
        <div class="grow"><b>ยังไม่ได้ระบุ OpenAI API Key</b> — ระบบคาดการณ์ด้วย AI จริงยังไม่ทำงาน<br>
        <span class="small muted">เปิดปุ่ม "เครื่องมือ" มุมขวาบน วาง Key (sk-…) เลือกโมเดล แล้วกดบันทึก · หรือใส่ในไฟล์ .env ตาม .env.example แล้วรีสตาร์ต · ส่วนอื่นของระบบใช้ได้ปกติโดยไม่ต้องมี Key</span></div></div>`;
    }
  });

  function stopsAway(bus, stopId) {
    const tl = loadTimeline(bus, stopId);
    return tl ? Math.max(0, tl.length - 1) : null;
  }
  function renderFollow(st) {
    const bar = document.getElementById('follow-bar');
    if (!bar) return;
    if (!followBusId) { bar.hidden = true; bar.innerHTML = ''; return; }
    const bus = st.ai.buses.find((b) => b.id === followBusId);
    if (!bus) {
      if (followEndUntil === 0) followEndUntil = Date.now() + 8000; // เริ่มนับแสดงข้อความ
      const endedId = followBusId;
      followBusId = null; followAlerted = false;
      if (Date.now() < followEndUntil) {
        bar.hidden = false;
        bar.innerHTML = `<div class="follow-bar">${OT.icon('info')} รถคัน ${OT.esc(endedId)} จบเที่ยวกลับสู่อู่แล้ว — ยุติการติดตาม</div>`;
      } else bar.hidden = true;
      return;
    }
    const eta = busEtaToStop(st, bus, selectedStop);
    const away = stopsAway(bus, selectedStop);
    let status;
    if (!eta) status = bus.state === 'running'
      ? 'รถผ่านป้ายของคุณไปแล้ว — ระบบจะติดตามจนคันนี้จบเที่ยว'
      : 'คันนี้พักที่อู่ — จะเริ่มนับใหม่เมื่อออกเที่ยวใหม่';
    else {
      const min = Math.max(1, Math.round(eta.low / 60));
      status = away === 0 ? 'ถึงป้ายของคุณแล้วตอนนี้' : `อีก ${away} ป้าย · ประมาณ ${min} นาที`;
      if (!followAlerted && away != null && away <= 2 && eta.low <= 300) { // เหลือ <= 2 ป้าย และอีกไม่เกิน ~5 นาที
        followAlerted = true;
        OT.speak(`รถคัน ${bus.id} กำลังจะถึงป้าย ${stopName(selectedStop)} ในอีกประมาณ ${min} นาที`);
      }
    }
    bar.hidden = false;
    bar.innerHTML = `<div class="follow-bar">
      <span class="live-dot" style="position:static;"></span>
      <b>กำลังติดตามคัน ${OT.esc(bus.id)}</b><span class="muted">→ ป้าย${OT.esc(stopName(selectedStop))}</span>
      <span class="follow-status">${status}</span>
      <button class="btn small ghost" id="btn-unfollow">หยุดติดตาม</button>
    </div>`;
    // แผนที่เลื่อนตามรถเฉพาะเมื่อหมุดหลุดออกนอกกรอบมุมมอง (ไม่ดึงสวนมือผู้ใช้)
    const m = markers.get(bus.id);
    if (m && Date.now() - followPanT > 4000) {
      const ll = L.latLng(m.cur.lat, m.cur.lng);
      if (!map.getBounds().pad(-0.22).contains(ll)) { map.panTo(ll, { animate: true, duration: 0.8 }); followPanT = Date.now(); }
    }
  }
  function startFollow(busId) {
    followBusId = busId; followAlerted = false; followPanT = 0; followEndUntil = 0;
    if (OT.state) renderFollow(OT.state);
  }

  function renderAll(st) {
    updateQuickSim(st);
    renderFavRow(st);
    renderFollow(st);
    renderArrival(st);
    renderSchedule(st);
    if (document.getElementById('trip-result').dataset.filled) renderTripResult(st);
    if (selectedBusId) renderDrawer(st); // Drawer เปิดอยู่ → อัปเดตทุกช่วงข้อมูลสด
  }

  // ── รับข้อมูลสด: แผนที่จะเริ่มวาดได้เมื่อมีทั้งสถานะและเรขาคณิตถนนจริง ──
  async function applyState(st) {
    syncRouteSelect(st.routeId);
    await handleRouteSwitch(st);
    if (routeSwitching) return;
    if (!routeLine) { applyDeepLink(); buildRoute(st); buildAutocompletes(); }
    if (!routeLine) return;
    updateBusMarkers(st);
    updateTraffic(st);
    document.getElementById('sim-clock').textContent = st.ai.clock + ' น.';
    renderAlerts(st);
    renderAll(st);
  }
  OT.onState((st) => { if (geo) applyState(st); });
  fetch('/api/route.geo.json').then((r) => r.json())
    .then((g) => { geo = g; if (OT.state) applyState(OT.state); })
    .catch(() => { /* แผนที่ยังใช้รายการป้าย/การ์ดเวลาได้ตามปกติ */ });
})();
