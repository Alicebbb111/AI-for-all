'use strict';
/* OmniTransit v5 — sim.js (Chaos Simulator + GTFS-RT JSON สด) */
(function () {
  const $ = (id) => document.getElementById(id);
  let gtfsTab = 'all';

  // ── ปุ่มความเร็ว ──────────────────────────────────────────────────────────
  $('speed-btns').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-speed]');
    if (!btn) return;
    await OT.post('/api/control', { action: 'speed', value: parseInt(btn.dataset.speed) });
  });

  $('t-rain').addEventListener('change', (e) => OT.post('/api/control', { action: 'rain', value: e.target.checked }));
  $('t-rush').addEventListener('change', (e) => OT.post('/api/control', { action: 'rush', value: e.target.checked }));
  $('t-server').addEventListener('change', (e) => OT.post('/api/control', { action: 'server_down', value: e.target.checked }));
  $('b-reset').addEventListener('click', () => OT.post('/api/control', { action: 'reset' }));

  $('b-gps').addEventListener('click', () => OT.post('/api/control', { action: 'gps_out', busId: $('chaos-bus').value }));
  $('b-break').addEventListener('click', () => OT.post('/api/control', { action: 'breakdown', busId: $('chaos-bus').value }));
  $('b-apc').addEventListener('click', () => {
    const busId = $('chaos-bus').value === 'all' ? 'B03' : $('chaos-bus').value;
    OT.post('/api/control', { action: 'apc_fault', busId, value: true });
  });

  // ── GTFS tabs ────────────────────────────────────────────────────────────
  $('gtfs-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    gtfsTab = btn.dataset.tab;
    $('gtfs-tabs').querySelectorAll('[data-tab]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('primary', on);
      b.setAttribute('aria-selected', String(on));
    });
    loadGtfs();
  });

  function hl(json) {
    return OT.esc(json)
      .replace(/&quot;([^&]+)&quot;(?=\s*:)/g, '<span class="k">"$1"</span>')
      .replace(/: &quot;([^&]*)&quot;/g, ': <span class="s">"$1"</span>')
      .replace(/: (-?\d+\.?\d*)/g, ': <span class="n">$1</span>');
  }
  async function loadGtfs() {
    try {
      const feed = await (await fetch('/api/gtfs-rt')).json();
      let obj = feed;
      if (gtfsTab !== 'all') {
        const key = gtfsTab === 'vehicle' ? 'vehicle' : gtfsTab === 'trip' ? 'tripUpdate' : 'alert';
        obj = { header: feed.header, entity: feed.entity.filter((e) => e[key]) };
      }
      $('gtfs-out').innerHTML = hl(JSON.stringify(obj, null, 2));
    } catch (e) { $('gtfs-out').textContent = 'โหลด feed ไม่สำเร็จ: ' + e.message; }
  }
  setInterval(loadGtfs, 2000);
  loadGtfs();

  // ── ซิงก์ UI กับสถานะ ────────────────────────────────────────────────────
  let busOptionsBuilt = false;
  OT.onState((st) => {
    $('clock-line').textContent = `เวลาจำลอง ${st.ai.clock} น. · เร็ว ×${st.simSpeed} · โหมด ${st.mode === 'stopped' ? 'Kill Switch' : 'ปกติ'}`;
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('primary', parseInt(b.dataset.speed) === st.simSpeed));
    $('t-rain').checked = st.rain;
    $('t-rush').checked = st.rush;
    $('t-server').checked = st.degraded;
    if (!busOptionsBuilt && st.ai.buses.length) {
      busOptionsBuilt = true;
      const sel = $('chaos-bus');
      sel.innerHTML = '<option value="all">ทุกคัน</option>' + st.ai.buses.map((b) => `<option value="${b.id}">${b.id} · ${OT.esc(b.model.name)}</option>`).join('');
    }
    $('event-log').innerHTML = (st.events || []).slice().reverse().map((e) => {
      const color = e.level === 'serious' ? 'var(--critical)' : e.level === 'warning' ? 'var(--warn-text)' : 'inherit';
      return `<li><time>${e.tSim}</time><span style="color:${color};">${OT.esc(e.msg)}</span></li>`;
    }).join('') || '<li><span class="muted">ยังไม่มีเหตุการณ์</span></li>';
  });
})();
